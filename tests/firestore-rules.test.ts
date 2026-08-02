import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  deleteDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StateCodec } from "../src/lib/codec";
import { EditorStateService } from "../src/lib/editor-state";
import { BoardModel } from "../src/lib/model";
import { AnswerPoolSorter } from "../src/lib/sorting";
import type { AuthUser } from "../src/services/cloud-auth-service";
import { CloudBoardRepository } from "../src/services/cloud-board-repository";
import type { FirebaseClient } from "../src/services/firebase-client";

const projectId = "squarecast-test";
const rules = readFileSync(
  new URL("../firestore.rules", import.meta.url),
  "utf8",
);

let environment: RulesTestEnvironment;

function auth(uid: string) {
  return environment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    email_verified: true,
  }).firestore();
}

function unverified(uid: string) {
  return environment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    email_verified: false,
  }).firestore();
}

function anonymous(uid: string) {
  return environment.authenticatedContext(uid, {
    email_verified: false,
    firebase: { sign_in_provider: "anonymous" },
  }).firestore();
}

function boardData(ownerUid = "owner") {
  return {
    schemaVersion: 1,
    title: "Rules Board",
    stateHash: "#sq1:test-payload",
    ownerUid,
    memberUids: [ownerUid],
    roles: { [ownerUid]: "owner" },
    revision: 1,
    recentOperationIds: [],
    shareTokens: {},
    checkpointRevisions: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    updatedBy: ownerUid,
  };
}

async function seedBoard(id = "board-1", data = boardData()) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "boards", id), data);
  });
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules },
  });
});

beforeEach(async () => environment.clearFirestore());
afterAll(async () => environment.cleanup());

describe("Firestore security rules", () => {
  it("allows a verified user to create a valid owned board", async () => {
    const database = auth("owner");
    await assertSucceeds(
      setDoc(doc(database, "boards", "new-board"), {
        ...boardData(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("creates cloud boards with a restorable baseline checkpoint", async () => {
    const database = auth("owner");
    const repository = new CloudBoardRepository(
      { firestore: () => database } as unknown as FirebaseClient,
      new StateCodec(),
      new EditorStateService(new AnswerPoolSorter()),
      () => ({
        uid: "owner",
        email: "owner@example.test",
        displayName: "Owner",
        emailVerified: true,
        isAnonymous: false,
      }),
    );

    const board = await repository.create(BoardModel.createDefaultEditor());
    const checkpoints = await repository.listCheckpoints(board.id);
    expect(checkpoints).toEqual([
      expect.objectContaining({ revision: 1, reason: "Board Created", isCurrent: true }),
    ]);
  });

  it("rejects unverified board creation and forged initial permissions", async () => {
    await assertFails(
      setDoc(doc(unverified("owner"), "boards", "unverified"), boardData()),
    );
    await assertFails(
      setDoc(doc(auth("owner"), "boards", "forged"), {
        ...boardData(),
        roles: { owner: "owner", outsider: "editor" },
      }),
    );
  });

  it("allows an unverified account to reopen a board it already joined", async () => {
    await seedBoard("joined-board", {
      ...boardData(),
      memberUids: ["owner", "joined-editor"],
      roles: { owner: "owner", "joined-editor": "editor" },
    });
    await assertSucceeds(
      getDoc(doc(unverified("joined-editor"), "boards", "joined-board")),
    );
  });

  it("restricts private board reads and membership queries", async () => {
    await seedBoard();
    await assertSucceeds(getDoc(doc(auth("owner"), "boards", "board-1")));
    await assertFails(getDoc(doc(auth("outsider"), "boards", "board-1")));
    await assertSucceeds(
      getDocs(
        query(
          collection(auth("owner"), "boards"),
          where("memberUids", "array-contains", "owner"),
          orderBy("updatedAt", "desc"),
        ),
      ),
    );
    await assertFails(getDocs(collection(auth("outsider"), "boards")));
  });

  it("requires monotonic revisions for editor state changes", async () => {
    await seedBoard("board-1", {
      ...boardData(),
      memberUids: ["owner", "editor"],
      roles: { owner: "owner", editor: "editor" },
    });
    const reference = doc(auth("editor"), "boards", "board-1");
    await assertSucceeds(
      updateDoc(reference, {
        title: "Edited",
        stateHash: "#sq1:edited",
        revision: 2,
        recentOperationIds: ["operation-1"],
        checkpointRevisions: [],
        updatedAt: serverTimestamp(),
        updatedBy: "editor",
        lastOperation: {
          id: "operation-1",
          targets: ["config:title"],
          uid: "editor",
        },
      }),
    );
    await assertFails(
      updateDoc(reference, {
        stateHash: "#sq1:skipped",
        revision: 4,
        recentOperationIds: ["operation-2"],
        checkpointRevisions: [],
        updatedAt: serverTimestamp(),
        updatedBy: "editor",
        lastOperation: {
          id: "operation-2",
          targets: ["config:title"],
          uid: "editor",
        },
      }),
    );
  });

  it("adds signed-in accounts through a perpetual active invitation", async () => {
    await seedBoard();
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, "editorInvites", "active-token"), {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
      });
    });
    await assertSucceeds(
      updateDoc(doc(unverified("joiner"), "boards", "board-1"), {
        memberUids: arrayUnion("joiner"),
        "roles.joiner": "editor",
        lastAcceptedInvite: "active-token",
        updatedAt: serverTimestamp(),
        updatedBy: "joiner",
      }),
    );
    await seedBoard("board-2", { ...boardData(), title: "Other" });
    await assertFails(
      updateDoc(doc(auth("late"), "boards", "board-2"), {
        memberUids: arrayUnion("late"),
        "roles.late": "editor",
        lastAcceptedInvite: "active-token",
        updatedAt: serverTimestamp(),
        updatedBy: "late",
      }),
    );
  });

  it("treats reopening an accepted editor invitation as a successful no-op", async () => {
    await seedBoard();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "editorInvites", "reusable-token"), {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
      });
    });
    const database = auth("joiner");
    const repository = new CloudBoardRepository(
      { firestore: () => database } as unknown as FirebaseClient,
      new StateCodec(),
      new EditorStateService(new AnswerPoolSorter()),
      () => ({
        uid: "joiner",
        email: "joiner@example.test",
        displayName: "Joiner",
        emailVerified: true,
        isAnonymous: false,
      }),
    );

    expect(await repository.acceptInvite("reusable-token")).toBe("board-1");
    expect(await repository.acceptInvite("reusable-token")).toBe("board-1");
    await environment.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDoc(doc(context.firestore(), "boards", "board-1"));
      expect(snapshot.data()?.memberUids).toEqual(["owner", "joiner"]);
      expect(snapshot.data()?.roles).toEqual({ owner: "owner", joiner: "editor" });
    });
  });

  it("keeps Create idempotent and invalidates an invite only on explicit rotation", async () => {
    await seedBoard();
    const database = auth("owner");
    const currentUser: AuthUser = {
      uid: "owner",
      email: "owner@example.test",
      displayName: "Owner",
      emailVerified: true,
      isAnonymous: false,
    };
    const repository = new CloudBoardRepository(
      { firestore: () => database } as unknown as FirebaseClient,
      new StateCodec(),
      new EditorStateService(new AnswerPoolSorter()),
      () => currentUser,
    );

    const first = await repository.createEditorInvite("board-1");
    const repeated = await repository.createEditorInvite("board-1");
    expect(repeated).toBe(first);

    const rotated = await repository.createEditorInvite("board-1", true);
    expect(rotated).not.toBe(first);
    await environment.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore();
      expect((await getDoc(doc(admin, "editorInvites", first))).exists()).toBe(false);
      expect((await getDoc(doc(admin, "editorInvites", rotated))).exists()).toBe(true);
    });
  });

  it("allows public token gets while denying collection listing", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "publicShares", "public-token"), {
        schemaVersion: 1,
        kind: "view",
        boardId: "board-1",
        stateHash: "#sq1:public",
        title: "Public",
        revision: 1,
        updatedAt: Timestamp.now(),
      });
    });
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonymous, "publicShares", "public-token")));
    await assertFails(getDocs(collection(anonymous, "publicShares")));
  });

  it("prevents editors and anonymous clients from publishing token documents", async () => {
    await seedBoard("board-1", {
      ...boardData(),
      memberUids: ["owner", "editor"],
      roles: { owner: "owner", editor: "editor" },
    });
    const share = {
      schemaVersion: 1,
      kind: "view",
      boardId: "board-1",
      stateHash: "#sq1:test-payload",
      title: "Rules Board",
      revision: 1,
      updatedAt: serverTimestamp(),
    };
    await assertFails(
      setDoc(doc(auth("editor"), "publicShares", "forged-editor"), share),
    );
    await assertFails(
      setDoc(
        doc(environment.unauthenticatedContext().firestore(), "publicShares", "forged-public"),
        share,
      ),
    );
  });

  it("limits membership changes to the owner and twenty members", async () => {
    await seedBoard();
    const memberUids = ["owner", ...Array.from({ length: 20 }, (_, index) => `u${index}`)];
    const roles = Object.fromEntries(
      memberUids.map((uid) => [uid, uid === "owner" ? "owner" : "editor"]),
    );
    await assertFails(
      updateDoc(doc(auth("owner"), "boards", "board-1"), {
        memberUids,
        roles,
      }),
    );
  });

  it("allows ownership transfer only to an existing editor", async () => {
    await seedBoard("board-1", {
      ...boardData(),
      memberUids: ["owner", "editor"],
      roles: { owner: "owner", editor: "editor" },
    });
    const reference = doc(auth("owner"), "boards", "board-1");
    await assertFails(
      updateDoc(reference, {
        ownerUid: "outsider",
        memberUids: ["owner", "editor", "outsider"],
        roles: { owner: "editor", editor: "editor", outsider: "owner" },
        updatedAt: serverTimestamp(),
        updatedBy: "owner",
      }),
    );
    await assertSucceeds(
      updateDoc(reference, {
        ownerUid: "editor",
        roles: { owner: "editor", editor: "owner" },
        updatedAt: serverTimestamp(),
        updatedBy: "owner",
      }),
    );
  });

  it("makes revoked invitations unusable", async () => {
    await seedBoard();
    await environment.withSecurityRulesDisabled(async (context) => {
      const reference = doc(context.firestore(), "editorInvites", "revoked");
      await setDoc(reference, {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
      });
      await deleteDoc(reference);
    });
    await assertFails(
      updateDoc(doc(auth("joiner"), "boards", "board-1"), {
        memberUids: arrayUnion("joiner"),
        "roles.joiner": "editor",
        lastAcceptedInvite: "revoked",
        updatedAt: serverTimestamp(),
        updatedBy: "joiner",
      }),
    );
  });

  it("grants anonymous editor sessions only while their bearer token is active", async () => {
    await seedBoard("board-1", {
      ...boardData(),
      shareTokens: { invite: "guest-token" },
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "editorInvites", "guest-token"), {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
      });
    });
    const guest = anonymous("guest");
    const board = doc(guest, "boards", "board-1");
    await assertFails(getDoc(board));
    await assertFails(
      setDoc(doc(guest, "boards", "board-1", "editorSessions", "guest"), {
        schemaVersion: 1,
        inviteToken: "wrong-token",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(auth("account"), "boards", "board-1", "editorSessions", "account"), {
        schemaVersion: 1,
        inviteToken: "guest-token",
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(doc(guest, "boards", "board-1", "editorSessions", "guest"), {
        schemaVersion: 1,
        inviteToken: "guest-token",
        createdAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDoc(board));
    await assertSucceeds(
      updateDoc(board, {
        title: "Guest Edit",
        stateHash: "#sq1:guest-edit",
        revision: 2,
        recentOperationIds: ["guest-operation"],
        checkpointRevisions: [],
        updatedAt: serverTimestamp(),
        updatedBy: "guest",
        lastOperation: {
          id: "guest-operation",
          targets: ["config:title"],
          uid: "guest",
        },
      }),
    );
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, "editorInvites", "rotated-token"), {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
      });
      await updateDoc(doc(database, "boards", "board-1"), {
        "shareTokens.invite": "rotated-token",
      });
    });
    await assertFails(getDoc(board));
  });

  it("opens an editor link through the repository without permanent membership", async () => {
    const codec = new StateCodec();
    const editor = BoardModel.createDefaultEditor();
    await seedBoard("board-1", {
      ...boardData(),
      stateHash: codec.encode(editor),
      shareTokens: { invite: "repository-token" },
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "editorInvites", "repository-token"), {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
      });
    });
    const database = anonymous("repository-guest");
    const repository = new CloudBoardRepository(
      { firestore: () => database } as unknown as FirebaseClient,
      codec,
      new EditorStateService(new AnswerPoolSorter()),
      () => ({
        uid: "repository-guest",
        email: "",
        displayName: "Guest Editor",
        emailVerified: false,
        isAnonymous: true,
      }),
    );

    expect(await repository.acceptInvite("repository-token")).toBe("board-1");
    expect(await repository.acceptInvite("repository-token")).toBe("board-1");
    const saved = await repository.applyOperation(
      "board-1",
      {
        id: "guest-save",
        type: "patch-config",
        patch: { title: "Saved By Guest" },
      },
      "Guest Board Change",
    );
    expect(saved.editor.config.title).toBe("Saved By Guest");
    expect(saved.revision).toBe(2);
    await expect(repository.listCheckpoints("board-1")).resolves.toHaveLength(2);
    await environment.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDoc(doc(context.firestore(), "boards", "board-1"));
      expect(snapshot.data()?.memberUids).toEqual(["owner"]);
      expect(
        (await getDoc(doc(
          context.firestore(),
          "boards",
          "board-1",
          "editorSessions",
          "repository-guest",
        ))).data()?.inviteToken,
      ).toBe("repository-token");
    });
  });

  it("protects presence by board membership and session ownership", async () => {
    await seedBoard();
    const ownerPresence = doc(auth("owner"), "boards", "board-1", "presence", "session-1");
    await assertSucceeds(
      setDoc(ownerPresence, {
        uid: "owner",
        displayName: "Owner",
        lastSeen: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(auth("outsider"), "boards", "board-1", "presence", "session-2"), {
        uid: "outsider",
        displayName: "Outsider",
        lastSeen: serverTimestamp(),
      }),
    );
  });

  it("rejects oversized cloud payloads", async () => {
    const oversized = `#sq1:${"x".repeat(768_001)}`;
    await assertFails(
      setDoc(doc(auth("owner"), "boards", "large-board"), {
        ...boardData(),
        stateHash: oversized,
      }),
    );
    expect(oversized.length).toBeGreaterThan(768_000);
  });
});

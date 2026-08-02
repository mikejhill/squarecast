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

  it("accepts an active invite but rejects expired invites", async () => {
    await seedBoard();
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, "editorInvites", "active-token"), {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      });
      await setDoc(doc(database, "editorInvites", "expired-token"), {
        schemaVersion: 1,
        boardId: "board-1",
        role: "editor",
        ownerUid: "owner",
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() - 60_000),
      });
    });
    await assertSucceeds(
      updateDoc(doc(auth("joiner"), "boards", "board-1"), {
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
        lastAcceptedInvite: "expired-token",
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
        expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
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
        expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
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

import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { z } from "zod";
import type {
  BoardCheckpoint,
  BoardPermission,
  BoardRepository,
  BoardSummary,
  SavedBoard,
} from "../lib/board-repository";
import type { StateCodec } from "../lib/codec";
import {
  applyEditorOperation,
  createOperationId,
  editorOperationTargetKeys,
  editorOperationSchema,
  type EditorOperation,
} from "../lib/editor-operation";
import type { EditorStateService } from "../lib/editor-state";
import { editorStateSchema, type EditorState } from "../lib/model";
import type { AuthUser } from "./cloud-auth-service";
import type { FirebaseClient } from "./firebase-client";

const MAX_PAYLOAD_BYTES = 750 * 1024;
const MAX_MEMBERS = 20;
const CHECKPOINT_LIMIT = 25;
const PRESENCE_TTL_MS = 2 * 60 * 1000;

const roleSchema = z.enum(["owner", "editor"]);
const shareTokensSchema = z.object({
  view: z.string().optional(),
  play: z.string().optional(),
  invite: z.string().optional(),
});
const cloudRecordSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string(),
  stateHash: z.string().startsWith("#sq1:"),
  ownerUid: z.string().min(1),
  memberUids: z.array(z.string().min(1)).max(MAX_MEMBERS),
  roles: z.record(z.string(), roleSchema),
  revision: z.number().int().positive(),
  recentOperationIds: z.array(z.string()).max(50),
  shareTokens: shareTokensSchema,
  checkpointRevisions: z.array(z.number().int().positive()).max(CHECKPOINT_LIMIT),
  lastOperation: z.object({
    id: z.string().min(1),
    targets: z.array(z.string().min(1)).max(20),
    uid: z.string().min(1),
  }).optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
  updatedBy: z.string(),
  lastAcceptedInvite: z.string().optional(),
});
type CloudRecord = z.infer<typeof cloudRecordSchema>;

const publicShareSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.enum(["view", "play"]),
  boardId: z.string(),
  stateHash: z.string().startsWith("#sq1:"),
  title: z.string(),
  revision: z.number().int().positive(),
  updatedAt: z.unknown(),
});

const inviteSchema = z.object({
  schemaVersion: z.literal(1),
  boardId: z.string(),
  role: z.literal("editor"),
  ownerUid: z.string(),
  createdAt: z.unknown(),
});

export type PublicShareKind = "view" | "play";
export type PublicShare = {
  kind: PublicShareKind;
  boardId: string;
  editor: EditorState;
  title: string;
  revision: number;
};

export type BoardPresence = {
  uid: string;
  displayName: string;
  lastSeen: number;
};

/** Removes expired sessions and collapses multiple browser sessions for one user. */
export function activeBoardPresence(
  entries: readonly BoardPresence[],
  now = Date.now(),
): readonly BoardPresence[] {
  const cutoff = now - PRESENCE_TTL_MS;
  const newestByUser = new Map<string, BoardPresence>();
  for (const entry of entries) {
    if (entry.lastSeen < cutoff) continue;
    const current = newestByUser.get(entry.uid);
    if (!current || entry.lastSeen > current.lastSeen) {
      newestByUser.set(entry.uid, entry);
    }
  }
  return [...newestByUser.values()].sort(
    (left, right) => right.lastSeen - left.lastSeen || left.uid.localeCompare(right.uid),
  );
}

export class CloudPayloadTooLargeError extends Error {
  public constructor() {
    super("This board exceeds the 750 KiB cloud-storage payload limit.");
    this.name = "CloudPayloadTooLargeError";
  }
}

/** Firestore implementation for account boards and live collaboration. */
export class CloudBoardRepository implements BoardRepository {
  private firestoreClient: Firestore | null = null;

  public constructor(
    private readonly firebase: FirebaseClient,
    private readonly codec: StateCodec,
    private readonly editorState: EditorStateService,
    private readonly getUser: () => AuthUser | null,
  ) {}

  private get database(): Firestore {
    this.firestoreClient ??= this.firebase.firestore();
    return this.firestoreClient;
  }

  public async list(): Promise<readonly BoardSummary[]> {
    const user = this.requireVerifiedUser();
    const result = await getDocs(
      query(
        collection(this.database, "boards"),
        where("memberUids", "array-contains", user.uid),
        orderBy("updatedAt", "desc"),
      ),
    );
    return result.docs.map((snapshot) =>
      this.toSummary(snapshot.id, this.parseRecord(snapshot.data()), user.uid),
    );
  }

  public async load(id: string): Promise<SavedBoard | null> {
    const user = this.requireSignedInUser();
    const snapshot = await getDoc(doc(this.database, "boards", id));
    if (!snapshot.exists()) return null;
    return this.toSavedBoard(
      id,
      this.parseRecord(snapshot.data()),
      user.uid,
      user.isAnonymous ? "editor" : undefined,
    );
  }

  public async create(editor: EditorState): Promise<SavedBoard> {
    const user = this.requireSignedInUser();
    const parsed = editorStateSchema.parse(editor);
    const stateHash = this.encodeWithinLimit(parsed);
    const reference = doc(collection(this.database, "boards"));
    const record = {
      schemaVersion: 1 as const,
      title: parsed.config.title,
      stateHash,
      ownerUid: user.uid,
      memberUids: [user.uid],
      roles: { [user.uid]: "owner" as const },
      revision: 1,
      recentOperationIds: [] as string[],
      shareTokens: {},
      checkpointRevisions: [1],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    };
    const batch = writeBatch(this.database);
    batch.set(reference, record);
    batch.set(doc(reference, "checkpoints", "1"), {
      schemaVersion: 1,
      revision: 1,
      stateHash,
      reason: "Board Created",
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });
    await batch.commit();
    return {
      id: reference.id,
      title: parsed.config.title,
      storageKind: "cloud",
      permission: "owner",
      revision: 1,
      updatedAt: Date.now(),
      createdAt: Date.now(),
      editor: parsed,
    };
  }

  public async applyOperation(
    id: string,
    operation: EditorOperation,
    checkpointReason?: string,
  ): Promise<SavedBoard> {
    const user = this.requireSignedInUser();
    const parsedOperation = editorOperationSchema.parse(operation);
    const boardReference = doc(this.database, "boards", id);
    const saved = await runTransaction(this.database, async (transaction) => {
      const snapshot = await transaction.get(boardReference);
      if (!snapshot.exists()) throw new Error("The account board no longer exists.");
      const current = this.parseRecord(snapshot.data());
      if (!user.isAnonymous && !current.memberUids.includes(user.uid)) {
        throw new Error("Access to this board was removed.");
      }
      if (current.recentOperationIds.includes(parsedOperation.id)) {
        return this.toSavedBoard(
          id,
          current,
          user.uid,
          user.isAnonymous ? "editor" : undefined,
        );
      }
      const editor = this.decodeEditor(current.stateHash);
      const nextEditor = applyEditorOperation(
        this.editorState,
        editor,
        parsedOperation,
      );
      const stateHash = this.encodeWithinLimit(nextEditor);
      const revision = current.revision + 1;
      const needsEarlierCheckpoint = Boolean(
        checkpointReason && current.checkpointRevisions.length === 0,
      );
      const nextCheckpointRevisions = checkpointReason
        ? [
            ...current.checkpointRevisions,
            ...(needsEarlierCheckpoint ? [current.revision] : []),
            revision,
          ].slice(-CHECKPOINT_LIMIT)
        : current.checkpointRevisions;
      const nextData = {
        title: nextEditor.config.title,
        stateHash,
        revision,
        recentOperationIds: [
          ...current.recentOperationIds,
          parsedOperation.id,
        ].slice(-50),
        checkpointRevisions: nextCheckpointRevisions,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        lastOperation: {
          id: parsedOperation.id,
          targets: [...editorOperationTargetKeys(parsedOperation)],
          uid: user.uid,
        },
      };
      transaction.update(boardReference, nextData);
      if (checkpointReason) {
        if (needsEarlierCheckpoint) {
          transaction.set(
            doc(boardReference, "checkpoints", String(current.revision)),
            {
              schemaVersion: 1,
              revision: current.revision,
              stateHash: current.stateHash,
              reason: `Before ${checkpointReason}`,
              createdAt: current.updatedAt,
              createdBy: user.uid,
            },
          );
        }
        transaction.set(
          doc(boardReference, "checkpoints", String(revision)),
          {
            schemaVersion: 1,
            revision,
            stateHash,
            reason: checkpointReason,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
          },
        );
        const removed = current.checkpointRevisions.find(
          (candidate) => !nextCheckpointRevisions.includes(candidate),
        );
        if (removed !== undefined) {
          transaction.delete(
            doc(boardReference, "checkpoints", String(removed)),
          );
        }
      }
      for (const kind of ["view", "play"] as const) {
        const token = current.shareTokens[kind];
        if (!token) continue;
        transaction.set(doc(this.database, "publicShares", token), {
          schemaVersion: 1,
          kind,
          boardId: id,
          stateHash,
          title: nextEditor.config.title,
          revision,
          updatedAt: serverTimestamp(),
        });
      }
      const nextRecord: CloudRecord = {
        ...current,
        ...nextData,
        createdAt: current.createdAt,
        updatedAt: Date.now(),
      };
      return this.toSavedBoard(
        id,
        nextRecord,
        user.uid,
        user.isAnonymous ? "editor" : undefined,
      );
    });
    return saved;
  }

  public async savePresentation(id: string): Promise<SavedBoard> {
    const board = await this.load(id);
    if (!board) throw new Error("The account board no longer exists.");
    return board;
  }

  public async duplicate(id: string): Promise<SavedBoard> {
    const current = await this.load(id);
    if (!current) throw new Error("The account board no longer exists.");
    return this.create(current.editor);
  }

  public async delete(id: string): Promise<void> {
    const user = this.requireVerifiedUser();
    const current = await this.requireRecord(id);
    if (current.ownerUid !== user.uid) {
      await updateDoc(doc(this.database, "boards", id), {
        memberUids: arrayRemove(user.uid),
        [`roles.${user.uid}`]: deleteField(),
      });
      return;
    }
    const boardReference = doc(this.database, "boards", id);
    const [checkpoints, presence, editorSessions] = await Promise.all([
      getDocs(collection(boardReference, "checkpoints")),
      getDocs(collection(boardReference, "presence")),
      getDocs(collection(boardReference, "editorSessions")),
    ]);
    const references = [
      ...checkpoints.docs.map((snapshot) => snapshot.ref),
      ...presence.docs.map((snapshot) => snapshot.ref),
      ...editorSessions.docs.map((snapshot) => snapshot.ref),
    ];
    for (const token of Object.values(current.shareTokens)) {
      if (!token) continue;
      references.push(
        doc(
          this.database,
          token === current.shareTokens.invite ? "editorInvites" : "publicShares",
          token,
        ),
      );
    }
    for (let index = 0; index < references.length; index += 450) {
      const batch = writeBatch(this.database);
      for (const reference of references.slice(index, index + 450)) {
        batch.delete(reference);
      }
      await batch.commit();
    }
    await deleteDoc(boardReference);
  }

  public async listCheckpoints(id: string): Promise<readonly BoardCheckpoint[]> {
    const user = this.requireSignedInUser();
    const board = await this.requireRecord(id);
    if (!user.isAnonymous && !board.memberUids.includes(user.uid)) {
      throw new Error("Access removed.");
    }
    const snapshots = await getDocs(
      query(
        collection(this.database, "boards", id, "checkpoints"),
        orderBy("revision", "desc"),
        limit(CHECKPOINT_LIMIT),
      ),
    );
    const checkpoints = snapshots.docs.map((snapshot) => {
      const data = snapshot.data();
      return {
        revision: Number(data.revision),
        stateHash: String(data.stateHash),
        createdAt: this.toMillis(data.createdAt),
        reason: String(data.reason),
        isCurrent: Number(data.revision) === board.revision,
      };
    });
    return checkpoints.some((checkpoint) => checkpoint.revision === board.revision)
      ? checkpoints
      : [
          {
            revision: board.revision,
            stateHash: board.stateHash,
            createdAt: this.toMillis(board.updatedAt),
            reason: "Current Version",
            isCurrent: true,
          },
          ...checkpoints,
        ].slice(0, CHECKPOINT_LIMIT);
  }

  public async restore(id: string, revision: number): Promise<SavedBoard> {
    const checkpoint = await getDoc(
      doc(this.database, "boards", id, "checkpoints", String(revision)),
    );
    if (!checkpoint.exists()) throw new Error("The checkpoint no longer exists.");
    const editor = this.decodeEditor(String(checkpoint.data().stateHash));
    return this.applyOperation(
      id,
      {
        id: createOperationId(),
        type: "replace-editor",
        editor,
      },
      "Restore Checkpoint",
    );
  }

  public subscribe(
    id: string,
    listener: (board: SavedBoard | null, error?: Error) => void,
  ): Unsubscribe {
    const user = this.requireSignedInUser();
    return onSnapshot(
      doc(this.database, "boards", id),
      (snapshot) => {
        listener(
          snapshot.exists()
            ? this.toSavedBoard(
                id,
                this.parseRecord(snapshot.data()),
                user.uid,
                user.isAnonymous ? "editor" : undefined,
              )
            : null,
        );
      },
      (error) => listener(null, error),
    );
  }

  public async createPublicShare(
    boardId: string,
    kind: PublicShareKind,
    rotate = false,
  ): Promise<string> {
    const user = this.requireVerifiedUser();
    const token = this.createToken();
    const boardReference = doc(this.database, "boards", boardId);
    return runTransaction(this.database, async (transaction) => {
      const snapshot = await transaction.get(boardReference);
      if (!snapshot.exists()) throw new Error("The account board no longer exists.");
      const board = this.parseRecord(snapshot.data());
      if (board.ownerUid !== user.uid) throw new Error("Only the owner can share this board.");
      const previous = board.shareTokens[kind];
      if (previous && !rotate) {
        const previousSnapshot = await transaction.get(
          doc(this.database, "publicShares", previous),
        );
        if (previousSnapshot.exists()) return previous;
      }
      transaction.update(boardReference, {
        [`shareTokens.${kind}`]: token,
      });
      transaction.set(doc(this.database, "publicShares", token), {
        schemaVersion: 1,
        kind,
        boardId,
        stateHash: board.stateHash,
        title: board.title,
        revision: board.revision,
        updatedAt: serverTimestamp(),
      });
      if (previous) {
        transaction.delete(doc(this.database, "publicShares", previous));
      }
      return token;
    });
  }

  public async createEditorInvite(boardId: string, rotate = false): Promise<string> {
    const user = this.requireVerifiedUser();
    const token = this.createToken();
    const boardReference = doc(this.database, "boards", boardId);
    return runTransaction(this.database, async (transaction) => {
      const snapshot = await transaction.get(boardReference);
      if (!snapshot.exists()) throw new Error("The account board no longer exists.");
      const board = this.parseRecord(snapshot.data());
      if (board.ownerUid !== user.uid) throw new Error("Only the owner can invite editors.");
      const previous = board.shareTokens.invite;
      if (previous && !rotate) {
        const previousSnapshot = await transaction.get(
          doc(this.database, "editorInvites", previous),
        );
        if (previousSnapshot.exists()) {
          inviteSchema.parse(previousSnapshot.data());
          return previous;
        }
      }
      transaction.update(boardReference, { "shareTokens.invite": token });
      transaction.set(doc(this.database, "editorInvites", token), {
        schemaVersion: 1,
        boardId,
        role: "editor",
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      });
      if (previous) {
        transaction.delete(doc(this.database, "editorInvites", previous));
      }
      return token;
    });
  }

  public async revokeShare(
    boardId: string,
    kind: PublicShareKind | "invite",
  ): Promise<void> {
    const user = this.requireVerifiedUser();
    const boardReference = doc(this.database, "boards", boardId);
    await runTransaction(this.database, async (transaction) => {
      const snapshot = await transaction.get(boardReference);
      if (!snapshot.exists()) return;
      const board = this.parseRecord(snapshot.data());
      if (board.ownerUid !== user.uid) throw new Error("Only the owner can revoke sharing.");
      const token = board.shareTokens[kind];
      if (!token) return;
      transaction.update(boardReference, {
        [`shareTokens.${kind}`]: deleteField(),
      });
      transaction.delete(
        doc(
          this.database,
          kind === "invite" ? "editorInvites" : "publicShares",
          token,
        ),
      );
    });
  }

  public async loadPublicShare(token: string): Promise<PublicShare | null> {
    const snapshot = await getDoc(doc(this.database, "publicShares", token));
    if (!snapshot.exists()) return null;
    const share = publicShareSchema.parse(snapshot.data());
    return {
      kind: share.kind,
      boardId: share.boardId,
      editor: this.decodeEditor(share.stateHash),
      title: share.title,
      revision: share.revision,
    };
  }

  public subscribePublicShare(
    token: string,
    listener: (share: PublicShare | null, error?: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      doc(this.database, "publicShares", token),
      (snapshot) => {
        if (!snapshot.exists()) {
          listener(null);
          return;
        }
        const share = publicShareSchema.parse(snapshot.data());
        listener({
          kind: share.kind,
          boardId: share.boardId,
          editor: this.decodeEditor(share.stateHash),
          title: share.title,
          revision: share.revision,
        });
      },
      (error) => listener(null, error),
    );
  }

  public async acceptInvite(token: string): Promise<string> {
    const user = this.requireSignedInUser();
    const inviteSnapshot = await getDoc(
      doc(this.database, "editorInvites", token),
    );
    if (!inviteSnapshot.exists()) throw new Error("This editor link is no longer active.");
    const invite = inviteSchema.parse(inviteSnapshot.data());
    const boardReference = doc(this.database, "boards", invite.boardId);
    if (user.isAnonymous) {
      await setDoc(doc(boardReference, "editorSessions", user.uid), {
        schemaVersion: 1,
        inviteToken: token,
        createdAt: serverTimestamp(),
      });
      return invite.boardId;
    }
    if (await this.canReadBoardAsMember(boardReference, user.uid)) {
      return invite.boardId;
    }
    try {
      await updateDoc(boardReference, {
        memberUids: arrayUnion(user.uid),
        [`roles.${user.uid}`]: "editor",
        lastAcceptedInvite: token,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    } catch (error) {
      if (
        !this.isPermissionDenied(error) ||
        !(await this.canReadBoardAsMember(boardReference, user.uid))
      ) {
        throw error;
      }
    }
    return invite.boardId;
  }

  public async removeMember(boardId: string, uid: string): Promise<void> {
    const user = this.requireVerifiedUser();
    const board = await this.requireRecord(boardId);
    if (board.ownerUid !== user.uid) throw new Error("Only the owner can remove editors.");
    if (uid === user.uid) throw new Error("Transfer ownership before removing the owner.");
    await updateDoc(doc(this.database, "boards", boardId), {
      memberUids: arrayRemove(uid),
      [`roles.${uid}`]: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  }

  public async transferOwnership(boardId: string, uid: string): Promise<void> {
    const user = this.requireVerifiedUser();
    const board = await this.requireRecord(boardId);
    if (board.ownerUid !== user.uid) throw new Error("Only the owner can transfer ownership.");
    if (board.roles[uid] !== "editor") throw new Error("The new owner must already be an editor.");
    await updateDoc(doc(this.database, "boards", boardId), {
      ownerUid: uid,
      [`roles.${uid}`]: "owner",
      [`roles.${user.uid}`]: "editor",
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  }

  public async heartbeatPresence(boardId: string, sessionId: string): Promise<void> {
    const user = this.requireSignedInUser();
    await setDoc(doc(this.database, "boards", boardId, "presence", sessionId), {
      uid: user.uid,
      displayName: user.displayName,
      lastSeen: serverTimestamp(),
    });
  }

  public async clearPresence(boardId: string, sessionId: string): Promise<void> {
    await deleteDoc(doc(this.database, "boards", boardId, "presence", sessionId));
  }

  public subscribePresence(
    boardId: string,
    listener: (presence: readonly BoardPresence[]) => void,
  ): Unsubscribe {
    this.requireSignedInUser();
    let entries: BoardPresence[] = [];
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const publish = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = null;
      const now = Date.now();
      const active = activeBoardPresence(entries, now);
      listener(active);
      const nextExpiry = active.reduce(
        (earliest, entry) => Math.min(earliest, entry.lastSeen + PRESENCE_TTL_MS + 1),
        Number.POSITIVE_INFINITY,
      );
      if (Number.isFinite(nextExpiry)) {
        expiryTimer = setTimeout(publish, Math.max(1, nextExpiry - now));
      }
    };
    const unsubscribe = onSnapshot(
      query(
        collection(this.database, "boards", boardId, "presence"),
        where("lastSeen", ">=", Timestamp.fromMillis(Date.now() - PRESENCE_TTL_MS)),
      ),
      (snapshot) => {
        entries = snapshot.docs.map((entry) => ({
            uid: String(entry.data().uid),
            displayName: String(entry.data().displayName),
            lastSeen: this.toMillis(entry.data().lastSeen),
        }));
        publish();
      },
      () => {
        entries = [];
        if (expiryTimer) clearTimeout(expiryTimer);
        expiryTimer = null;
        listener([]);
      },
    );
    return () => {
      unsubscribe();
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }

  /** Deletes a bounded stale-presence page without delaying board interaction. */
  public async cleanupStalePresence(boardId: string): Promise<void> {
    const stale = await getDocs(
      query(
        collection(this.database, "boards", boardId, "presence"),
        where("lastSeen", "<", Timestamp.fromMillis(Date.now() - PRESENCE_TTL_MS)),
        limit(100),
      ),
    );
    if (stale.empty) return;
    const batch = writeBatch(this.database);
    for (const snapshot of stale.docs) batch.delete(snapshot.ref);
    await batch.commit();
  }

  private async requireRecord(id: string): Promise<CloudRecord> {
    const snapshot = await getDoc(doc(this.database, "boards", id));
    if (!snapshot.exists()) throw new Error("The account board no longer exists.");
    return this.parseRecord(snapshot.data());
  }

  /** Treats a readable board membership as successful prior invite acceptance. */
  private async canReadBoardAsMember(
    reference: ReturnType<typeof doc>,
    uid: string,
  ): Promise<boolean> {
    try {
      const snapshot = await getDoc(reference);
      return snapshot.exists() && this.parseRecord(snapshot.data()).memberUids.includes(uid);
    } catch (error) {
      if (this.isPermissionDenied(error)) return false;
      throw error;
    }
  }

  private isPermissionDenied(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "permission-denied",
    );
  }

  private parseRecord(data: DocumentData): CloudRecord {
    return cloudRecordSchema.parse(data);
  }

  private decodeEditor(hash: string): EditorState {
    const decoded = this.codec.decode(hash);
    if (decoded?.mode !== "edit") {
      throw new Error("The cloud board contains invalid editor state.");
    }
    return decoded;
  }

  private encodeWithinLimit(editor: EditorState): string {
    const stateHash = this.codec.encode(editorStateSchema.parse(editor));
    if (new TextEncoder().encode(stateHash).byteLength > MAX_PAYLOAD_BYTES) {
      throw new CloudPayloadTooLargeError();
    }
    return stateHash;
  }

  private toSummary(id: string, record: CloudRecord, uid: string): BoardSummary {
    return {
      id,
      title: record.title,
      storageKind: "cloud",
      permission: record.roles[uid] ?? "viewer",
      revision: record.revision,
      updatedAt: this.toMillis(record.updatedAt),
    };
  }

  private toSavedBoard(
    id: string,
    record: CloudRecord,
    uid: string,
    permissionOverride?: BoardPermission,
  ): SavedBoard {
    const permission = permissionOverride ?? record.roles[uid] ?? "viewer";
    return {
      ...this.toSummary(id, record, uid),
      permission,
      editor: this.decodeEditor(record.stateHash),
      cloudAccess: permission === "owner"
        ? {
            shareTokens: { ...record.shareTokens },
            members: { ...record.roles },
          }
        : undefined,
      createdAt: this.toMillis(record.createdAt),
      recentOperationIds: record.recentOperationIds,
      lastOperationTargets: record.lastOperation?.targets,
      lastEditorUid: record.lastOperation?.uid,
    };
  }

  private requireVerifiedUser(): AuthUser {
    const user = this.getUser();
    if (!user) throw new Error("Sign in to use account storage.");
    if (!user.emailVerified) throw new Error("Verify your email before using account storage.");
    return user;
  }

  private requireSignedInUser(): AuthUser {
    const user = this.getUser();
    if (!user) throw new Error("Open an active editor link or sign in to continue.");
    return user;
  }

  private toMillis(value: unknown): number {
    if (value instanceof Timestamp) return value.toMillis();
    if (value && typeof value === "object" && "toMillis" in value) {
      return (value as { toMillis(): number }).toMillis();
    }
    return typeof value === "number" ? value : Date.now();
  }

  private createToken(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }
}

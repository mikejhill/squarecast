import { z } from "zod";
import type {
  BoardCheckpoint,
  BoardRepository,
  BoardSummary,
  SavedBoard,
} from "../lib/board-repository";
import {
  applyEditorOperation,
  editorOperationSchema,
  type EditorOperation,
} from "../lib/editor-operation";
import type { EditorStateService } from "../lib/editor-state";
import type { StateCodec } from "../lib/codec";
import { editorStateSchema, type EditorState } from "../lib/model";

const checkpointSchema = z.object({
  revision: z.number().int().positive(),
  stateHash: z.string().startsWith("#sq1:"),
  createdAt: z.number().nonnegative(),
  reason: z.string(),
});

const deviceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(8),
  title: z.string(),
  stateHash: z.string().startsWith("#sq1:"),
  revision: z.number().int().positive(),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  checkpoints: z.array(checkpointSchema).max(25),
});

type DeviceRecord = z.infer<typeof deviceRecordSchema>;

const pendingOperationSchema = z.object({
  key: z.string(),
  uid: z.string(),
  boardId: z.string(),
  operation: editorOperationSchema,
  checkpointReason: z.string().optional(),
  createdAt: z.number(),
});

export type PendingCloudOperation = z.infer<typeof pendingOperationSchema>;

type DeviceRepositoryOptions = {
  databaseName?: string;
  indexedDB?: IDBFactory;
};

const BOARD_STORE = "boards";
const PENDING_STORE = "pending-cloud";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

/** Stores private device boards and pending cloud operations in IndexedDB. */
export class DeviceBoardRepository implements BoardRepository {
  private readonly databaseName: string;
  private readonly factory: IDBFactory | null;
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly channel: BroadcastChannel | null;

  public constructor(
    private readonly codec: StateCodec,
    private readonly editorState: EditorStateService,
    options: DeviceRepositoryOptions = {},
  ) {
    this.databaseName = options.databaseName ?? "squarecast";
    this.factory = options.indexedDB ??
      (typeof window === "undefined" ? null : window.indexedDB);
    this.channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(`${this.databaseName}:boards`);
    this.channel?.addEventListener("message", () => this.emit());
  }

  public get available(): boolean {
    return this.factory !== null;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async list(): Promise<readonly BoardSummary[]> {
    const database = await this.open();
    const transaction = database.transaction(BOARD_STORE, "readonly");
    const records = await requestResult(
      transaction.objectStore(BOARD_STORE).getAll(),
    );
    await transactionDone(transaction);
    return records
      .map((record) => this.parseRecord(record))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((record) => this.toSummary(record));
  }

  public async load(id: string): Promise<SavedBoard | null> {
    const record = await this.getRecord(id);
    return record ? this.toSavedBoard(record) : null;
  }

  public async create(editor: EditorState): Promise<SavedBoard> {
    const parsed = editorStateSchema.parse(editor);
    const now = Date.now();
    const record: DeviceRecord = {
      schemaVersion: 1,
      id: this.createId(),
      title: parsed.config.title,
      stateHash: this.codec.encode(parsed),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      checkpoints: [
        {
          revision: 1,
          stateHash: this.codec.encode(parsed),
          createdAt: now,
          reason: "Board Created",
        },
      ],
    };
    await this.putRecord(record);
    return this.toSavedBoard(record);
  }

  public async applyOperation(
    id: string,
    operation: EditorOperation,
    checkpointReason?: string,
  ): Promise<SavedBoard> {
    const parsedOperation = editorOperationSchema.parse(operation);
    const database = await this.open();
    const transaction = database.transaction(BOARD_STORE, "readwrite");
    const store = transaction.objectStore(BOARD_STORE);
    const raw = await requestResult(store.get(id));
    if (raw === undefined) {
      transaction.abort();
      throw new Error("The device board no longer exists.");
    }
    const current = this.parseRecord(raw);
    const editor = this.decodeEditor(current.stateHash);
    const nextEditor = applyEditorOperation(
      this.editorState,
      editor,
      parsedOperation,
    );
    const revision = current.revision + 1;
    const now = Date.now();
    const earlierCheckpoint =
      checkpointReason && current.checkpoints.length === 0
        ? [{
            revision: current.revision,
            stateHash: current.stateHash,
            createdAt: current.updatedAt,
            reason: `Before ${checkpointReason}`,
          }]
        : [];
    const checkpoints = checkpointReason
      ? [
          ...current.checkpoints,
          ...earlierCheckpoint,
          {
            revision,
            stateHash: this.codec.encode(nextEditor),
            createdAt: now,
            reason: checkpointReason,
          },
        ].slice(-25)
      : current.checkpoints;
    const next: DeviceRecord = {
      ...current,
      title: nextEditor.config.title,
      stateHash: this.codec.encode(nextEditor),
      revision,
      updatedAt: now,
      checkpoints,
    };
    store.put(next);
    await transactionDone(transaction);
    this.changed();
    return this.toSavedBoard(next);
  }

  public async savePresentation(
    id: string,
    editor: EditorState,
  ): Promise<SavedBoard> {
    const current = await this.requireRecord(id);
    const parsed = editorStateSchema.parse(editor);
    const next: DeviceRecord = {
      ...current,
      title: parsed.config.title,
      stateHash: this.codec.encode(parsed),
      updatedAt: Date.now(),
    };
    await this.putRecord(next);
    return this.toSavedBoard(next);
  }

  public async duplicate(id: string): Promise<SavedBoard> {
    const current = await this.load(id);
    if (!current) throw new Error("The device board no longer exists.");
    return this.create(current.editor);
  }

  public async delete(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(BOARD_STORE, "readwrite");
    transaction.objectStore(BOARD_STORE).delete(id);
    await transactionDone(transaction);
    this.changed();
  }

  public async listCheckpoints(id: string): Promise<readonly BoardCheckpoint[]> {
    const current = await this.requireRecord(id);
    const checkpoints = current.checkpoints
      .slice()
      .reverse()
      .map((checkpoint) => ({
        ...checkpoint,
        isCurrent: checkpoint.revision === current.revision,
      }));
    return checkpoints.some((checkpoint) => checkpoint.revision === current.revision)
      ? checkpoints
      : [
          {
            revision: current.revision,
            stateHash: current.stateHash,
            createdAt: current.updatedAt,
            reason: "Current Version",
            isCurrent: true,
          },
          ...checkpoints,
        ].slice(0, 25);
  }

  public async restore(id: string, revision: number): Promise<SavedBoard> {
    const current = await this.requireRecord(id);
    const checkpoint = current.checkpoints.find(
      (candidate) => candidate.revision === revision,
    );
    if (!checkpoint) throw new Error("The saved checkpoint no longer exists.");
    const editor = this.decodeEditor(checkpoint.stateHash);
    return this.applyOperation(
      id,
      {
        id: this.createId(),
        type: "replace-editor",
        editor,
      },
      "Restore Checkpoint",
    );
  }

  public async putPendingCloudOperation(
    uid: string,
    boardId: string,
    operation: EditorOperation,
    checkpointReason?: string,
  ): Promise<void> {
    const record: PendingCloudOperation = {
      key: `${uid}:${boardId}:${operation.id}`,
      uid,
      boardId,
      operation: editorOperationSchema.parse(operation),
      checkpointReason,
      createdAt: Date.now(),
    };
    const database = await this.open();
    const transaction = database.transaction(PENDING_STORE, "readwrite");
    transaction.objectStore(PENDING_STORE).put(record);
    await transactionDone(transaction);
  }

  public async removePendingCloudOperation(key: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PENDING_STORE, "readwrite");
    transaction.objectStore(PENDING_STORE).delete(key);
    await transactionDone(transaction);
  }

  public async listPendingCloudOperations(
    uid: string,
    boardId: string,
  ): Promise<readonly PendingCloudOperation[]> {
    const database = await this.open();
    const transaction = database.transaction(PENDING_STORE, "readonly");
    const raw = await requestResult(
      transaction.objectStore(PENDING_STORE).getAll(),
    );
    await transactionDone(transaction);
    return raw
      .map((value) => pendingOperationSchema.parse(value))
      .filter((record) => record.uid === uid && record.boardId === boardId)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  public close(): void {
    this.channel?.close();
    void this.databasePromise?.then((database) => database.close());
    this.databasePromise = null;
  }

  private async open(): Promise<IDBDatabase> {
    if (!this.factory) throw new Error("IndexedDB is unavailable in this browser.");
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.factory!.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(BOARD_STORE)) {
          database.createObjectStore(BOARD_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(PENDING_STORE)) {
          database.createObjectStore(PENDING_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB could not open."));
      request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked by another tab."));
    });
    return this.databasePromise;
  }

  private async getRecord(id: string): Promise<DeviceRecord | null> {
    const database = await this.open();
    const transaction = database.transaction(BOARD_STORE, "readonly");
    const raw = await requestResult(transaction.objectStore(BOARD_STORE).get(id));
    await transactionDone(transaction);
    return raw === undefined ? null : this.parseRecord(raw);
  }

  private async requireRecord(id: string): Promise<DeviceRecord> {
    const record = await this.getRecord(id);
    if (!record) throw new Error("The device board no longer exists.");
    return record;
  }

  private async putRecord(record: DeviceRecord): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(BOARD_STORE, "readwrite");
    transaction.objectStore(BOARD_STORE).put(deviceRecordSchema.parse(record));
    await transactionDone(transaction);
    this.changed();
  }

  private parseRecord(value: unknown): DeviceRecord {
    return deviceRecordSchema.parse(value);
  }

  private decodeEditor(hash: string): EditorState {
    const decoded = this.codec.decode(hash);
    if (decoded?.mode !== "edit") {
      throw new Error("The saved device board contains invalid editor state.");
    }
    return decoded;
  }

  private toSummary(record: DeviceRecord): BoardSummary {
    return {
      id: record.id,
      title: record.title,
      storageKind: "device",
      permission: "owner",
      revision: record.revision,
      updatedAt: record.updatedAt,
    };
  }

  private toSavedBoard(record: DeviceRecord): SavedBoard {
    return {
      ...this.toSummary(record),
      editor: this.decodeEditor(record.stateHash),
      createdAt: record.createdAt,
    };
  }

  private createId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }

  private changed(): void {
    this.channel?.postMessage("changed");
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

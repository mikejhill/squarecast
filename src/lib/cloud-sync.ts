import type { SavedBoard, SyncStatus } from "./board-repository";
import {
  EditorConflictError,
  coalesceEditorOperations,
  editorOperationCoalescingKey,
  type EditorOperation,
} from "./editor-operation";
import type { CloudBoardRepository } from "../services/cloud-board-repository";
import type {
  DeviceBoardRepository,
  PendingCloudOperation,
} from "../services/device-board-repository";

type QueuedOperation = {
  operation: EditorOperation;
  checkpointReason?: string;
  persisted: Promise<void>;
};

type CloudSyncCallbacks = {
  onSaved(board: SavedBoard): void;
  onStatus(status: SyncStatus, message?: string): void;
};

export const CLOUD_EDIT_IDLE_DELAY_MS = 1_500;
export const CLOUD_EDIT_MAX_DELAY_MS = 5_000;

/**
 * Coalesces routine cloud edits, serializes transactions, and persists only
 * unacknowledged operations so a network interruption cannot discard work.
 */
export class CloudSyncCoordinator {
  private readonly queued = new Map<string, QueuedOperation>();
  private readonly immediate: QueuedOperation[] = [];
  private inFlight: QueuedOperation | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;
  private disposed = false;

  public constructor(
    private readonly repository: CloudBoardRepository,
    private readonly pendingStore: DeviceBoardRepository,
    private readonly uid: string,
    private readonly boardId: string,
    private readonly callbacks: CloudSyncCallbacks,
  ) {}

  public get hasPending(): boolean {
    return this.queued.size > 0 || this.immediate.length > 0 || this.flushPromise !== null;
  }

  public get pendingOperations(): readonly EditorOperation[] {
    return [
      ...(this.inFlight ? [this.inFlight.operation] : []),
      ...this.immediate.map((entry) => entry.operation),
      ...Array.from(this.queued.values(), (entry) => entry.operation),
    ];
  }

  public async restorePending(): Promise<void> {
    const records = await this.pendingStore.listPendingCloudOperations(
      this.uid,
      this.boardId,
    );
    for (const record of records) {
      this.immediate.push(this.fromPending(record));
    }
    if (records.length) {
      this.callbacks.onStatus("offline", "Recovering pending changes.");
      await this.flush();
    }
  }

  public enqueue(
    operation: EditorOperation,
    checkpointReason?: string,
  ): void {
    if (this.disposed) return;
    const persisted = this.pendingStore.putPendingCloudOperation(
      this.uid,
      this.boardId,
      operation,
      checkpointReason,
    );
    const entry = { operation, checkpointReason, persisted };
    this.callbacks.onStatus("saving");
    const key = checkpointReason ? null : editorOperationCoalescingKey(operation);
    if (!key) {
      this.immediate.push(entry);
      void this.flush();
      return;
    }
    const previous = this.queued.get(key);
    if (previous) {
      void previous.persisted.then(() =>
        this.pendingStore.removePendingCloudOperation(
          `${this.uid}:${this.boardId}:${previous.operation.id}`,
        ),
      );
      this.queued.set(key, {
        operation: coalesceEditorOperations(previous.operation, operation),
        persisted,
      });
    } else {
      this.queued.set(key, entry);
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, CLOUD_EDIT_IDLE_DELAY_MS);
    this.maxTimer ??= setTimeout(() => {
      this.maxTimer = null;
      void this.flush();
    }, CLOUD_EDIT_MAX_DELAY_MS);
  }

  public async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.flushPromise) return this.flushPromise;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    this.flushPromise = this.flushQueuedOperations();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async flushQueuedOperations(): Promise<void> {
    while (!this.disposed) {
      const next = this.immediate.shift() ?? this.takeCoalesced();
      if (!next) break;
      this.inFlight = next;
      try {
        await next.persisted;
        const saved = await this.repository.applyOperation(
          this.boardId,
          next.operation,
          next.checkpointReason,
        );
        await this.pendingStore.removePendingCloudOperation(
          `${this.uid}:${this.boardId}:${next.operation.id}`,
        );
        this.inFlight = null;
        this.callbacks.onSaved(saved);
      } catch (error) {
        this.inFlight = null;
        this.immediate.unshift(next);
        if (error instanceof EditorConflictError) {
          await this.pendingStore.removePendingCloudOperation(
            `${this.uid}:${this.boardId}:${next.operation.id}`,
          );
          this.immediate.shift();
          this.callbacks.onStatus("conflict", error.message);
        } else {
          this.callbacks.onStatus(
            this.isOfflineFailure(error)
              ? "offline"
              : "unavailable",
            error instanceof Error ? error.message : "Cloud save failed.",
          );
          break;
        }
      }
    }
    if (!this.hasQueuedWork()) this.callbacks.onStatus("saved");
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.maxTimer = null;
  }

  private takeCoalesced(): QueuedOperation | undefined {
    const first = this.queued.entries().next();
    if (first.done) return undefined;
    const [key, value] = first.value;
    this.queued.delete(key);
    return value;
  }

  private hasQueuedWork(): boolean {
    return this.immediate.length > 0 || this.queued.size > 0;
  }

  private isOfflineFailure(error: unknown): boolean {
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      return false;
    }
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    return code.includes("unavailable") || code.includes("network");
  }

  private fromPending(record: PendingCloudOperation): QueuedOperation {
    return {
      operation: record.operation,
      checkpointReason: record.checkpointReason,
      persisted: Promise.resolve(),
    };
  }
}

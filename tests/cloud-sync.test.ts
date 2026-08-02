import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSyncCoordinator } from "../src/lib/cloud-sync";
import { EditorConflictError } from "../src/lib/editor-operation";
import { BoardModel } from "../src/lib/model";
import type { CloudBoardRepository } from "../src/services/cloud-board-repository";
import type { DeviceBoardRepository } from "../src/services/device-board-repository";

const coordinators: CloudSyncCoordinator[] = [];
const editor = BoardModel.createDefaultEditor();

function saved(revision: number) {
  return {
    id: "board",
    title: editor.config.title,
    storageKind: "cloud" as const,
    permission: "owner" as const,
    revision,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    editor,
  };
}

function createHarness() {
  const repository = {
    applyOperation: vi.fn(async () => saved(2)),
  } as unknown as CloudBoardRepository;
  const pendingStore = {
    putPendingCloudOperation: vi.fn(async () => undefined),
    removePendingCloudOperation: vi.fn(async () => undefined),
    listPendingCloudOperations: vi.fn(async () => []),
  } as unknown as DeviceBoardRepository;
  const callbacks = {
    onSaved: vi.fn(),
    onStatus: vi.fn(),
  };
  const coordinator = new CloudSyncCoordinator(
    repository,
    pendingStore,
    "user",
    "board",
    callbacks,
  );
  coordinators.push(coordinator);
  return { coordinator, repository, pendingStore, callbacks };
}

afterEach(() => {
  for (const coordinator of coordinators.splice(0)) coordinator.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("cloud sync coordinator", () => {
  it("commits major operations immediately and reports saved state", async () => {
    const { coordinator, repository, pendingStore, callbacks } = createHarness();
    const operation = { id: "delete", type: "delete-card" as const, cardId: "card" };
    coordinator.enqueue(operation, "Delete Card");
    await coordinator.flush();
    expect(repository.applyOperation).toHaveBeenCalledWith(
      "board",
      operation,
      "Delete Card",
    );
    expect(pendingStore.putPendingCloudOperation).toHaveBeenCalled();
    expect(pendingStore.removePendingCloudOperation).toHaveBeenCalled();
    expect(callbacks.onSaved).toHaveBeenCalled();
    expect(callbacks.onStatus).toHaveBeenLastCalledWith("saved");
    expect(coordinator.hasPending).toBe(false);
  });

  it("coalesces routine edits before flushing", async () => {
    const { coordinator, repository, pendingStore } = createHarness();
    coordinator.enqueue({
      id: "one",
      type: "update-card",
      cardId: "card",
      patch: { text: "A" },
    });
    coordinator.enqueue({
      id: "two",
      type: "update-card",
      cardId: "card",
      patch: { text: "AB" },
    });
    expect(coordinator.pendingOperations).toHaveLength(1);
    await coordinator.flush();
    expect(repository.applyOperation).toHaveBeenCalledTimes(1);
    expect(repository.applyOperation).toHaveBeenCalledWith(
      "board",
      expect.objectContaining({ id: "two", patch: { text: "AB" } }),
      undefined,
    );
    expect(pendingStore.removePendingCloudOperation).toHaveBeenCalledWith(
      "user:board:one",
    );
  });

  it("flushes coalesced edits after the debounce interval", async () => {
    vi.useFakeTimers();
    const { coordinator, repository } = createHarness();
    coordinator.enqueue({
      id: "timed",
      type: "update-card",
      cardId: "card",
      patch: { text: "Later" },
    });
    await vi.advanceTimersByTimeAsync(750);
    expect(repository.applyOperation).toHaveBeenCalledTimes(1);
  });

  it("exposes restored immediate operations while replay is active", async () => {
    const { coordinator, repository, pendingStore } = createHarness();
    const releases: Array<() => void> = [];
    vi.mocked(repository.applyOperation).mockImplementation(
      () => new Promise((resolve) => {
        releases.push(() => resolve(saved(2)));
      }),
    );
    const records = ["first", "second"].map((id, index) => ({
      key: `user:board:${id}`,
      uid: "user",
      boardId: "board",
      operation: {
        id,
        type: "patch-config" as const,
        patch: { title: id },
      },
      createdAt: index,
    }));
    vi.mocked(pendingStore.listPendingCloudOperations).mockResolvedValue(records);
    const restoring = coordinator.restorePending();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    expect(coordinator.pendingOperations).toEqual([
      expect.objectContaining({ id: "second" }),
    ]);
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await restoring;
  });

  it("does nothing when no pending work exists or after disposal", async () => {
    const { coordinator, repository, callbacks } = createHarness();
    await coordinator.restorePending();
    coordinator.dispose();
    coordinator.enqueue({
      id: "ignored",
      type: "patch-config",
      patch: { title: "Ignored" },
    });
    await coordinator.flush();
    expect(repository.applyOperation).not.toHaveBeenCalled();
    expect(callbacks.onStatus).not.toHaveBeenCalled();
  });

  it("restores queued operations and reports conflicts", async () => {
    const { coordinator, repository, pendingStore, callbacks } = createHarness();
    const operation = {
      id: "restored",
      type: "update-card" as const,
      cardId: "missing",
      patch: { text: "Recovered" },
    };
    vi.mocked(pendingStore.listPendingCloudOperations).mockResolvedValue([
      {
        key: "user:board:restored",
        uid: "user",
        boardId: "board",
        operation,
        createdAt: 1,
      },
    ]);
    vi.mocked(repository.applyOperation).mockRejectedValue(
      new EditorConflictError(operation),
    );
    await coordinator.restorePending();
    expect(callbacks.onStatus).toHaveBeenCalledWith(
      "conflict",
      expect.stringContaining("no longer exists"),
    );
    expect(pendingStore.removePendingCloudOperation).toHaveBeenCalled();
  });

  it("retains operations and reports unavailable service failures", async () => {
    const { coordinator, repository, callbacks } = createHarness();
    vi.mocked(repository.applyOperation).mockRejectedValue(new Error("quota"));
    coordinator.enqueue({
      id: "failed",
      type: "patch-config",
      patch: { title: "Pending" },
    }, "Board Change");
    await coordinator.flush();
    expect(callbacks.onStatus).toHaveBeenCalledWith("unavailable", "quota");
    expect(coordinator.hasPending).toBe(true);
    coordinator.dispose();
    await coordinator.flush();
  });

  it("reports explicit network failures as offline with a safe fallback message", async () => {
    const { coordinator, repository, callbacks } = createHarness();
    vi.stubGlobal("navigator", { onLine: false });
    vi.mocked(repository.applyOperation).mockRejectedValue({
      code: "firestore/unavailable",
    });
    coordinator.enqueue({
      id: "offline",
      type: "delete-card",
      cardId: "card",
    }, "Delete Card");
    await coordinator.flush();
    expect(callbacks.onStatus).toHaveBeenCalledWith(
      "offline",
      "Cloud save failed.",
    );
  });
});

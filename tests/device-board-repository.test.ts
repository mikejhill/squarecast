import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StateCodec } from "../src/lib/codec";
import { EditorStateService } from "../src/lib/editor-state";
import { BoardModel } from "../src/lib/model";
import { AnswerPoolSorter } from "../src/lib/sorting";
import { DeviceBoardRepository } from "../src/services/device-board-repository";

const repositories: DeviceBoardRepository[] = [];

function createRepository() {
  const repository = new DeviceBoardRepository(
    new StateCodec(),
    new EditorStateService(new AnswerPoolSorter()),
    {
      databaseName: `squarecast-test-${crypto.randomUUID()}`,
      indexedDB: new IDBFactory(),
    },
  );
  repositories.push(repository);
  return repository;
}

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
});

describe("device board repository", () => {
  it("creates, lists, updates, checkpoints, restores, and deletes boards", async () => {
    const repository = createRepository();
    const changed = vi.fn();
    const unsubscribe = repository.subscribe(changed);
    const created = await repository.create(BoardModel.createDefaultEditor());
    expect((await repository.list())[0]?.id).toBe(created.id);
    expect((await repository.load(created.id))?.editor.config.title).toBe(
      "Weekend Adventure Bingo",
    );

    const updated = await repository.applyOperation(
      created.id,
      {
        id: "rename",
        type: "patch-config",
        patch: { title: "Stored Board" },
      },
      "Rename Board",
    );
    expect(updated.revision).toBe(2);
    expect(updated.editor.config.title).toBe("Stored Board");
    expect(await repository.listCheckpoints(created.id)).toHaveLength(2);
    expect((await repository.listCheckpoints(created.id))[1]?.reason).toBe("Board Created");

    const presentation = {
      ...updated.editor,
      setupCollapsed: true,
    };
    await repository.savePresentation(created.id, presentation);
    expect((await repository.load(created.id))?.editor.setupCollapsed).toBe(true);

    const restored = await repository.restore(created.id, 2);
    expect(restored.revision).toBe(3);
    const duplicate = await repository.duplicate(created.id);
    expect(duplicate.id).not.toBe(created.id);
    expect(await repository.list()).toHaveLength(2);
    await repository.delete(created.id);
    expect(await repository.load(created.id)).toBeNull();
    expect(changed).toHaveBeenCalled();
    unsubscribe();
  });

  it("persists and removes pending cloud operations", async () => {
    const repository = createRepository();
    const operation = {
      id: "pending-operation",
      type: "patch-config" as const,
      patch: { title: "Pending" },
    };
    await repository.putPendingCloudOperation("user", "board", operation, "Checkpoint");
    const pending = await repository.listPendingCloudOperations("user", "board");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.operation).toEqual(operation);
    await repository.removePendingCloudOperation(pending[0]!.key);
    expect(await repository.listPendingCloudOperations("user", "board")).toEqual([]);
  });

  it("announces cross-tab changes and keeps only the latest 25 checkpoints", async () => {
    const factory = new IDBFactory();
    const databaseName = `squarecast-shared-${crypto.randomUUID()}`;
    const createShared = () => {
      const repository = new DeviceBoardRepository(
        new StateCodec(),
        new EditorStateService(new AnswerPoolSorter()),
        { databaseName, indexedDB: factory },
      );
      repositories.push(repository);
      return repository;
    };
    const first = createShared();
    const second = createShared();
    const changed = vi.fn();
    second.subscribe(changed);
    const board = await first.create(BoardModel.createDefaultEditor());
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect((await second.load(board.id))?.revision).toBe(1);

    for (let index = 0; index < 26; index += 1) {
      await first.applyOperation(
        board.id,
        {
          id: `checkpoint-${index}`,
          type: "patch-config",
          patch: { title: `Revision ${index}` },
        },
        `Checkpoint ${index}`,
      );
    }
    const checkpoints = await second.listCheckpoints(board.id);
    expect(checkpoints).toHaveLength(25);
    expect(checkpoints[0]?.revision).toBe(27);
    expect(checkpoints.at(-1)?.revision).toBe(3);
    await expect(second.restore(board.id, 2)).rejects.toThrow(
      "checkpoint no longer exists",
    );
  });

  it("reports unavailable storage and missing records", async () => {
    const repository = new DeviceBoardRepository(
      new StateCodec(),
      new EditorStateService(new AnswerPoolSorter()),
      { indexedDB: undefined },
    );
    repositories.push(repository);
    expect(repository.available).toBe(false);
    await expect(repository.list()).rejects.toThrow("IndexedDB is unavailable");

    const available = createRepository();
    await expect(
      available.applyOperation("missing", {
        id: "missing-op",
        type: "delete-card",
        cardId: "card",
      }),
    ).rejects.toThrow("no longer exists");
    await expect(available.duplicate("missing")).rejects.toThrow("no longer exists");
    await expect(available.restore("missing", 1)).rejects.toThrow("no longer exists");
  });
});

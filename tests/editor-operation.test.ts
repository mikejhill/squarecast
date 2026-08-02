import { describe, expect, it, vi } from "vitest";
import {
  EditorConflictError,
  applyEditorOperation,
  coalesceEditorOperations,
  createOperationId,
  editorOperationCoalescingKey,
  editorOperationTargetKeys,
  editorOperationTargetsOverlap,
  editorOperationSchema,
} from "../src/lib/editor-operation";
import { EditorStateService } from "../src/lib/editor-state";
import { BoardModel } from "../src/lib/model";
import { AnswerPoolSorter } from "../src/lib/sorting";

const service = new EditorStateService(new AnswerPoolSorter());

describe("editor operations", () => {
  it("replays every durable mutation against the latest editor", () => {
    const editor = BoardModel.createDefaultEditor();
    const added = { id: "added-card", text: "Added", placement: { kind: "any" as const } };
    const patched = applyEditorOperation(service, editor, {
      id: "patch",
      type: "patch-config",
      patch: { title: "Changed" },
    });
    const withCard = applyEditorOperation(service, patched, {
      id: "add",
      type: "add-cards",
      cards: [added],
    });
    const updated = applyEditorOperation(service, withCard, {
      id: "update",
      type: "update-card",
      cardId: added.id,
      patch: { text: "Updated" },
    });
    const sorted = applyEditorOperation(service, updated, {
      id: "sort",
      type: "sort-cards",
      mode: "reverse",
    });
    const deleted = applyEditorOperation(service, sorted, {
      id: "delete",
      type: "delete-card",
      cardId: added.id,
    });
    const replaced = applyEditorOperation(service, deleted, {
      id: "replace",
      type: "replace-editor",
      editor,
    });

    expect(patched.config.title).toBe("Changed");
    expect(withCard.answers).toContainEqual(added);
    expect(updated.answers.find((card) => card.id === added.id)?.text).toBe("Updated");
    expect(sorted.config.sortMode).toBe("reverse");
    expect(deleted.answers.some((card) => card.id === added.id)).toBe(false);
    expect(replaced).toEqual(editor);
  });

  it("rejects updates to cards deleted by another editor", () => {
    const operation = {
      id: "missing",
      type: "update-card" as const,
      cardId: "missing-card",
      patch: { text: "Lost text" },
    };
    expect(() => applyEditorOperation(service, BoardModel.createDefaultEditor(), operation))
      .toThrow(EditorConflictError);
    const conflict = new EditorConflictError(operation);
    expect(conflict.name).toBe("EditorConflictError");
    expect(conflict.operation).toEqual(operation);
  });

  it("coalesces routine field and card typing without merging major actions", () => {
    const firstConfig = {
      id: "one",
      type: "patch-config" as const,
      patch: { title: "A" },
    };
    const nextConfig = {
      id: "two",
      type: "patch-config" as const,
      patch: { title: "AB" },
    };
    const firstCard = {
      id: "three",
      type: "update-card" as const,
      cardId: "card",
      patch: { text: "A" },
    };
    const nextCard = {
      id: "four",
      type: "update-card" as const,
      cardId: "card",
      patch: { text: "AB", placement: { kind: "row" as const, index: 1 } },
    };
    const deletion = {
      id: "five",
      type: "delete-card" as const,
      cardId: "card",
    };

    expect(editorOperationCoalescingKey(firstConfig)).toBe("config:title");
    expect(editorOperationCoalescingKey(firstCard)).toBe("card:card");
    expect(editorOperationCoalescingKey(deletion)).toBeNull();
    expect(coalesceEditorOperations(firstConfig, nextConfig)).toEqual(nextConfig);
    expect(coalesceEditorOperations(firstCard, nextCard)).toEqual(nextCard);
    expect(coalesceEditorOperations(deletion, nextConfig)).toEqual(nextConfig);
  });

  it("creates operation IDs with and without randomUUID and validates schemas", () => {
    expect(createOperationId()).toBeTruthy();
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {});
    expect(createOperationId()).toContain("-");
    vi.stubGlobal("crypto", originalCrypto);
    expect(
      editorOperationSchema.safeParse({ id: "x", type: "delete-card", cardId: "c" }).success,
    ).toBe(true);
  });

  it("identifies semantic targets for last-write collaboration notices", () => {
    const cardUpdate = {
      id: "card",
      type: "update-card" as const,
      cardId: "one",
      patch: { text: "Changed" },
    };
    expect(editorOperationTargetKeys({
      id: "config",
      type: "patch-config",
      patch: { title: "Title", free: false },
    })).toEqual(["config:title", "config:free"]);
    expect(editorOperationTargetKeys(cardUpdate)).toEqual(["card:one"]);
    expect(editorOperationTargetKeys({
      id: "delete",
      type: "delete-card",
      cardId: "one",
    })).toEqual(["card:one"]);
    expect(editorOperationTargetKeys({
      id: "add",
      type: "add-cards",
      cards: [],
    })).toEqual(["pool"]);
    expect(editorOperationTargetKeys({
      id: "sort",
      type: "sort-cards",
      mode: "manual",
    })).toEqual(["pool"]);
    expect(editorOperationTargetKeys({
      id: "replace",
      type: "replace-editor",
      editor: BoardModel.createDefaultEditor(),
    })).toEqual(["board"]);
    expect(editorOperationTargetsOverlap(cardUpdate, ["card:one"])).toBe(true);
    expect(editorOperationTargetsOverlap(cardUpdate, ["board"])).toBe(true);
    expect(editorOperationTargetsOverlap(cardUpdate, ["config:title"])).toBe(false);
    expect(editorOperationTargetsOverlap({
      id: "replace",
      type: "replace-editor",
      editor: BoardModel.createDefaultEditor(),
    }, ["config:title"])).toBe(true);
  });
});

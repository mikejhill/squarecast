import { describe, expect, it } from "vitest";
import { EditorStateService } from "../src/lib/editor-state";
import { BoardModel } from "../src/lib/model";
import { AnswerPoolSorter } from "../src/lib/sorting";

describe("editor state service", () => {
  const service = new EditorStateService(new AnswerPoolSorter());

  it("patches routine configuration without a history checkpoint", () => {
    const editor = BoardModel.createDefaultEditor();
    const mutation = service.patchConfig(editor, { title: "Updated" });

    expect(mutation.historyMode).toBe("replace");
    expect(mutation.state.config.title).toBe("Updated");
    expect(editor.config.title).not.toBe("Updated");
  });

  it("creates a checkpoint and clears placements invalidated by geometry", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers[0]!.placement = { kind: "cell", index: 24 };
    editor.answers[1]!.placement = { kind: "row", index: 4 };
    editor.answers[2]!.placement = { kind: "column", index: 4 };
    editor.answers[3]!.placement = { kind: "cell", index: 0 };

    const mutation = service.patchConfig(editor, { size: 3, free: false });

    expect(mutation.historyMode).toBe("push");
    expect(mutation.state.answers.slice(0, 3).every(
      (answer) => answer.placement.kind === "any",
    )).toBe(true);
    expect(mutation.state.answers[3]?.placement).toEqual({
      kind: "cell",
      index: 0,
    });
  });

  it("clears an exact placement when a new free square occupies it", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.free = false;
    editor.answers[0]!.placement = { kind: "cell", index: 12 };

    const mutation = service.patchConfig(editor, { free: true });

    expect(mutation.state.answers[0]?.placement).toEqual({ kind: "any" });
  });

  it("adds trimmed cards, rejects blanks, and preserves selected sorting", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers = [];

    expect(service.addCard(editor, "   ")).toBe(editor);
    const withZulu = service.addCard(editor, "  Zulu  ");
    const withAlpha = service.addCard(withZulu, "Alpha");

    expect(withAlpha.answers.map((answer) => answer.text)).toEqual([
      "Alpha",
      "Zulu",
    ]);
  });

  it("supports insertion requests, card updates, and deletion", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.sortMode = "shuffle";
    editor.answers = editor.answers.slice(0, 2);
    const target = editor.answers[0]!;

    const added = service.addCard(editor, "Inserted", target.id);
    const inserted = added.answers.find((answer) => answer.text === "Inserted")!;
    const updated = service.updateCard(added, inserted.id, {
      text: "Updated",
    });
    const untouched = service.updateCard(updated, "missing", {
      text: "Ignored",
    });
    const deleted = service.deleteCard(untouched, inserted.id);

    expect(updated.answers.some((answer) => answer.text === "Updated")).toBe(
      true,
    );
    expect(untouched.answers.some((answer) => answer.text === "Ignored")).toBe(
      false,
    );
    expect(deleted.answers.some((answer) => answer.id === inserted.id)).toBe(
      false,
    );
  });

  it("appends imports and changes the persistent sort mode", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers = [];

    expect(service.appendCards(editor, [])).toBe(editor);
    const imported = service.appendCards(editor, ["Beta", "Alpha"]);
    const reversed = service.sortCards(imported, "reverse");

    expect(imported.answers.map((answer) => answer.text)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(reversed.config.sortMode).toBe("reverse");
    expect(reversed.answers.map((answer) => answer.text)).toEqual([
      "Beta",
      "Alpha",
    ]);
  });
});

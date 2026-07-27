import { describe, expect, it } from "vitest";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";

describe("board generator", () => {
  const generator = new BoardGenerator();

  it("fills every square and keeps the free square centered", () => {
    const editor = BoardModel.createDefaultEditor();
    const play = generator.generate(editor, "stable-seed");
    const center = BoardModel.freeCellIndex(5, true)!;
    expect(play.cells).toHaveLength(25);
    expect(play.cells[center]?.free).toBe(true);
    expect(
      new Set(play.cells.filter((cell) => !cell.free).map((cell) => cell.id)).size,
    ).toBe(24);
  });

  it("keeps the editable source attached so play testing can return to editing", () => {
    const editor = BoardModel.createDefaultEditor();
    const play = generator.generate(editor, "first-play");

    const editedSource = {
      ...play.source,
      config: {
        ...play.source.config,
        title: "Adjusted After Play Testing",
      },
    };
    const replay = generator.generate(editedSource, "second-play");

    expect(replay.title).toBe("Adjusted After Play Testing");
    expect(replay.source).toEqual(editedSource);
  });

  it("honors exact-cell, row, and column constraints", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers[0]!.placement = { kind: "cell", index: 0 };
    editor.answers[1]!.placement = { kind: "row", index: 1 };
    editor.answers[2]!.placement = { kind: "column", index: 4 };
    const play = generator.generate(editor, "constraints");
    expect(play.cells[0]?.id).toBe(editor.answers[0]?.id);
    expect(
      Math.floor(
        play.cells.findIndex((cell) => cell.id === editor.answers[1]?.id) / 5,
      ),
    ).toBe(1);
    expect(
      play.cells.findIndex((cell) => cell.id === editor.answers[2]?.id) % 5,
    ).toBe(4);
  });

  it("detects conflicting placement rules", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers[0]!.placement = { kind: "cell", index: 0 };
    editor.answers[1]!.placement = { kind: "cell", index: 0 };
    expect(generator.validate(editor).valid).toBe(false);
  });

  it("detects complete winning lines", () => {
    const play = generator.generate(BoardModel.createDefaultEditor(), "win");
    play.checked = [0, 1, 2, 3, 4];
    expect([...generator.winningCells(play)]).toEqual([0, 1, 2, 3, 4]);
  });

  it("reports missing title, insufficient cards, and duplicate content", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.title = " ";
    editor.answers = [
      { id: "1", text: "Same", placement: { kind: "any" } },
      { id: "2", text: "same", placement: { kind: "any" } },
    ];
    const result = generator.validate(editor);
    expect(result.errors).toContain("Add a board title.");
    expect(result.errors.some((error) => error.startsWith("Add 22 more"))).toBe(
      true,
    );
    expect(result.warnings).toContain(
      "Duplicate card text will appear as separate squares.",
    );
  });

  it("fills a board without a free square", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.size = 3;
    editor.config.free = false;
    const play = generator.generate(editor, "no-free");
    expect(play.cells).toHaveLength(9);
    expect(play.cells.some((cell) => cell.free)).toBe(false);
    expect(play.checked).toEqual([]);
  });

  it("rejects more constrained cards than available squares", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.size = 3;
    editor.config.free = true;
    editor.answers = editor.answers.slice(0, 9).map((answer, index) => ({
      ...answer,
      placement: { kind: "cell" as const, index },
    }));
    expect(generator.validate(editor).errors).toContain(
      "Only 8 constrained cards can fit on this board.",
    );
  });

  it("warns when a valid board creates an unusually long URL", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.answers = editor.answers.map((answer, index) => ({
      ...answer,
      text: `${index}-${"long card ".repeat(400)}`,
    }));
    expect(generator.validate(editor).warnings).toContain(
      "This board creates a long URL that some messaging apps may truncate.",
    );
  });
});

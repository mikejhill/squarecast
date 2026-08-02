import { describe, expect, it } from "vitest";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";

describe("board generator", () => {
  const generator = new BoardGenerator();

  it("fills every square and applies the predetermined multi-free pattern", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.free = 4;
    const play = generator.generate(editor, "stable-seed");
    const freeIndexes = BoardModel.freeCellIndexes(5, 4);
    expect(play.cells).toHaveLength(25);
    expect(
      play.cells.flatMap((cell, index) => (cell.free ? [index] : [])),
    ).toEqual([...freeIndexes].sort((left, right) => left - right));
    expect(play.checked).toEqual(
      [...freeIndexes].sort((left, right) => left - right),
    );
    expect(
      new Set(play.cells.filter((cell) => !cell.free).map((cell) => cell.id)).size,
    ).toBe(21);
    expect(generator.winningCells(play).size).toBe(0);
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
    expect(() => generator.generate(editor, "invalid")).toThrow(
      "Add a board title.",
    );
  });

  it("fills a board without a free square", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.size = 3;
    editor.config.free = 0;
    const play = generator.generate(editor, "no-free");
    expect(play.cells).toHaveLength(9);
    expect(play.cells.some((cell) => cell.free)).toBe(false);
    expect(play.checked).toEqual([]);
  });

  it.each([3, 4, 5, 6, 7])(
    "opens a size-%d board at its maximum without an immediate win",
    (size) => {
      const editor = BoardModel.createDefaultEditor();
      editor.config.size = size;
      editor.config.free = BoardModel.maxFreeSquareCount(size);
      editor.answers = Array.from(
        { length: BoardModel.blankSquareCount(editor) },
        (_, index) => ({
          id: `card-${index}`,
          text: `Card ${index}`,
          placement: { kind: "any" as const },
        }),
      );

      const play = generator.generate(editor, `safe-${size}`);
      expect(play.checked).toEqual(
        [...BoardModel.freeCellIndexes(size, size - 1)].sort(
          (left, right) => left - right,
        ),
      );
      expect(play.cells.filter((cell) => cell.free)).toHaveLength(size - 1);
      expect(generator.winningCells(play).size).toBe(0);
    },
  );

  it("rejects a free-square count that could fill a winning line", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.size = 3;
    editor.config.free = 3;
    expect(generator.validate(editor).errors).toContain(
      "Use no more than 2 free squares on a 3 × 3 board.",
    );
    expect(() => generator.generate(editor, "too-many-free")).toThrow(
      "Use no more than 2 free squares",
    );
  });

  it("reshuffles partial previews before the board is valid", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.title = "";
    editor.answers = editor.answers.slice(0, 4);

    const first = generator
      .generatePreview(editor, "preview-one")
      .map((cell) => cell.id);
    const second = generator
      .generatePreview(editor, "preview-two")
      .map((cell) => cell.id);

    expect(first).not.toEqual(second);
    expect(first.filter((id) => !id.startsWith("placeholder"))).toHaveLength(5);
    expect(first[12]).toBe("__free__");
  });

  it("uses full generation for valid previews", () => {
    const editor = BoardModel.createDefaultEditor();

    expect(generator.generatePreview(editor, "valid-preview")).toEqual(
      generator.generate(editor, "valid-preview").cells,
    );
  });

  it("rejects more constrained cards than available squares", () => {
    const editor = BoardModel.createDefaultEditor();
    editor.config.size = 3;
    editor.config.free = 1;
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
    let seed = 0x5a17c9e3;
    const uniqueText = () => {
      let value = "";
      while (value.length < 900) {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        value += seed.toString(36);
      }
      return value;
    };
    editor.answers = editor.answers.map((answer, index) => ({
      ...answer,
      text: `${index}-${uniqueText()}`,
    }));
    expect(generator.validate(editor).warnings).toContain(
      "This board creates a long URL that some messaging apps may truncate.",
    );
  });
});

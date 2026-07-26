import { describe, expect, it } from "vitest";
import { generateBoard, validateEditor, winningCells } from "../src/lib/generator";
import { createDefaultEditor, freeCellIndex } from "../src/lib/model";

describe("board generator", () => {
  it("fills every square and keeps the free square centered", () => {
    const editor = createDefaultEditor();
    const play = generateBoard(editor, "stable-seed");
    const center = freeCellIndex(5, true)!;
    expect(play.cells).toHaveLength(25);
    expect(play.cells[center].free).toBe(true);
    expect(
      new Set(play.cells.filter((cell) => !cell.free).map((cell) => cell.id)).size,
    ).toBe(24);
  });

  it("honors exact-cell, row, and column constraints", () => {
    const editor = createDefaultEditor();
    editor.answers[0].placement = { kind: "cell", index: 0 };
    editor.answers[1].placement = { kind: "row", index: 1 };
    editor.answers[2].placement = { kind: "column", index: 4 };
    const play = generateBoard(editor, "constraints");
    expect(play.cells[0].id).toBe(editor.answers[0].id);
    expect(
      Math.floor(
        play.cells.findIndex((cell) => cell.id === editor.answers[1].id) / 5,
      ),
    ).toBe(1);
    expect(
      play.cells.findIndex((cell) => cell.id === editor.answers[2].id) % 5,
    ).toBe(4);
  });

  it("detects conflicting placement rules", () => {
    const editor = createDefaultEditor();
    editor.answers[0].placement = { kind: "cell", index: 0 };
    editor.answers[1].placement = { kind: "cell", index: 0 };
    expect(validateEditor(editor).valid).toBe(false);
  });

  it("detects complete winning lines", () => {
    const play = generateBoard(createDefaultEditor(), "win");
    play.checked = [0, 1, 2, 3, 4];
    expect([...winningCells(play)]).toEqual([0, 1, 2, 3, 4]);
  });
});

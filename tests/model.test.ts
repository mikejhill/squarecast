import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModel, IdFactory, boardConfigSchema } from "../src/lib/model";

describe("board model", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a harmless casual example with system and automatic defaults", () => {
    const editor = BoardModel.createDefaultEditor();
    expect(editor.config.title).toBe("Weekend Adventure Bingo");
    expect(editor.config.fontMode).toBe("auto");
    expect(editor.config.sortMode).toBe("manual");
    expect(editor.setupCollapsed).toBe(false);
    expect(editor.placementControlsVisible).toBe(false);
    expect(editor.answers).toHaveLength(28);
  });

  it("provides safe, deterministic free-square patterns for every board size", () => {
    const editor = BoardModel.createDefaultEditor();
    expect(BoardModel.freeCellIndexes(3, 2)).toEqual([4, 0]);
    expect(BoardModel.freeCellIndexes(4, 3)).toEqual([0, 6, 11]);
    expect(BoardModel.freeCellIndexes(5, 4)).toEqual([12, 1, 5, 19]);
    expect(BoardModel.freeCellIndexes(6, 5)).toEqual([0, 10, 13, 23, 26]);
    expect(BoardModel.freeCellIndexes(7, 6)).toEqual([24, 1, 7, 19, 34, 37]);
    expect(BoardModel.freeCellIndexes(5, 0)).toEqual([]);
    expect(BoardModel.freeCellIndexes(5, 99)).toHaveLength(4);
    expect([3, 4, 5, 6, 7].map(BoardModel.maxFreeSquareCount)).toEqual([
      2, 3, 4, 5, 6,
    ]);
    expect(BoardModel.blankSquareCount(editor)).toBe(24);
    editor.config.free = 0;
    expect(BoardModel.blankSquareCount(editor)).toBe(25);
  });

  it("keeps maximum patterns below an opening win with independent lines", () => {
    for (const size of [3, 4, 5, 6, 7]) {
      const freeIndexes = new Set(
        BoardModel.freeCellIndexes(size, BoardModel.maxFreeSquareCount(size)),
      );
      const lines = [
        ...Array.from({ length: size }, (_, row) =>
          Array.from({ length: size }, (_, column) => row * size + column),
        ),
        ...Array.from({ length: size }, (_, column) =>
          Array.from({ length: size }, (_, row) => row * size + column),
        ),
        Array.from({ length: size }, (_, index) => index * size + index),
        Array.from(
          { length: size },
          (_, index) => index * size + size - 1 - index,
        ),
      ];
      const freeCounts = lines.map(
        (line) => line.filter((index) => freeIndexes.has(index)).length,
      );

      expect(freeIndexes.size).toBe(size - 1);
      expect(Math.max(...freeCounts)).toBe(size === 3 ? 2 : 1);
      expect(freeCounts).not.toContain(size);
    }
  });

  it("migrates boolean configuration but rejects counts above the size maximum", () => {
    const config = BoardModel.createDefaultEditor().config;
    expect(boardConfigSchema.parse({ ...config, free: true }).free).toBe(1);
    expect(boardConfigSchema.parse({ ...config, free: false }).free).toBe(0);
    expect(boardConfigSchema.safeParse({ ...config, free: 5 }).success).toBe(
      false,
    );
  });

  it("creates compact identifiers and random session seeds", () => {
    expect(IdFactory.create()).toMatch(/^[a-z0-9-]{8}$/i);
    expect(IdFactory.seed()).toMatch(/^[a-z0-9]+$/i);
  });

  it("retains a non-cryptographic fallback for restricted browsers", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    expect(IdFactory.create()).toBe("i");
    expect(IdFactory.seed()).toContain("loyw3v28");
  });
});

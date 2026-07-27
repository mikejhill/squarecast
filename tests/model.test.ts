import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardModel, IdFactory } from "../src/lib/model";

describe("board model", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a harmless casual example with system and automatic defaults", () => {
    const editor = BoardModel.createDefaultEditor();
    expect(editor.config.title).toBe("Weekend Adventure Bingo");
    expect(editor.config.appearance).toBe("system");
    expect(editor.config.fontMode).toBe("auto");
    expect(editor.answers).toHaveLength(28);
  });

  it("calculates free-square placement and required card counts", () => {
    const editor = BoardModel.createDefaultEditor();
    expect(BoardModel.freeCellIndex(5, true)).toBe(12);
    expect(BoardModel.freeCellIndex(4, true)).toBe(10);
    expect(BoardModel.freeCellIndex(5, false)).toBeNull();
    expect(BoardModel.blankSquareCount(editor)).toBe(24);
    editor.config.free = false;
    expect(BoardModel.blankSquareCount(editor)).toBe(25);
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

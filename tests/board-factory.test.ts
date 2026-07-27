import { describe, expect, it } from "vitest";
import { BoardFactory } from "../src/lib/board-factory";

describe("new board factory", () => {
  const factory = new BoardFactory();

  it("creates a blank board with sensible editing defaults", () => {
    const editor = factory.createNewEditor(() => 0.25);

    expect(editor.config).toMatchObject({
      title: "",
      size: 5,
      free: true,
      freeLabel: "FREE",
      theme: "custom",
      fontMode: "auto",
      fontSize: 18,
      sortMode: "manual",
    });
    expect(editor.setupCollapsed).toBe(false);
    expect(editor.answers).toEqual([]);
  });

  it("chooses a fresh color from the supplied randomness", () => {
    const first = factory.createNewEditor(() => 0);
    const second = factory.createNewEditor(() => 0.9);

    expect(first.config.accentColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(second.config.accentColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(first.config.accentColor).not.toBe(second.config.accentColor);
  });
});

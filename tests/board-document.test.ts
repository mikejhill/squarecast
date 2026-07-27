import { describe, expect, it } from "vitest";
import { BoardDocumentService } from "../src/lib/board-document";
import { BoardModel } from "../src/lib/model";

describe("board document service", () => {
  const documents = new BoardDocumentService();

  it("round-trips the complete configuration, cards, and placements", () => {
    const source = BoardModel.createDefaultEditor();
    source.config = {
      ...source.config,
      title: "Imported Board",
      size: 6,
      free: false,
      fontMode: "fixed",
      fontSize: 21,
      sortMode: "constrained",
    };
    source.setupCollapsed = true;
    source.answers[0]!.placement = { kind: "row", index: 2 };
    const restored = documents.parse(documents.serialize(source));

    expect(restored.config).toEqual(source.config);
    expect(restored.setupCollapsed).toBe(false);
    expect(
      restored.answers.map(({ text, placement }) => ({ text, placement })),
    ).toEqual(
      source.answers.map(({ text, placement }) => ({ text, placement })),
    );
    expect(restored.answers[0]!.id).not.toBe(source.answers[0]!.id);
  });

  it("emits a recognizable, versioned portable object without session IDs", () => {
    const source = BoardModel.createDefaultEditor();
    const exported = JSON.parse(documents.serialize(source)) as Record<
      string,
      unknown
    >;

    expect(exported.format).toBe("squarecast-board");
    expect(exported.version).toBe(1);
    expect(exported).toHaveProperty("config");
    expect(exported).toHaveProperty("cards");
    expect(JSON.stringify(exported)).not.toContain(source.answers[0]!.id);
  });

  it.each([
    ["malformed JSON", "{"],
    [
      "unknown format",
      JSON.stringify({
        format: "other-board",
        version: 1,
        config: {},
        cards: [],
      }),
    ],
    [
      "unsupported version",
      JSON.stringify({
        format: "squarecast-board",
        version: 2,
        config: {},
        cards: [],
      }),
    ],
  ])("rejects %s before changing application state", (_label, input) => {
    expect(() => documents.parse(input)).toThrow();
  });

  it("creates safe JSON and CSV filenames with a stable fallback", () => {
    expect(documents.jsonFileName("  Café Night!  ")).toBe(
      "cafe-night.squarecast.json",
    );
    expect(documents.csvFileName("")).toBe(
      "squarecast-board.cards.csv",
    );
  });
});

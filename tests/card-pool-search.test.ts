import { describe, expect, it } from "vitest";
import { CardPoolSearch } from "../src/lib/card-pool-search";
import type { Answer } from "../src/lib/model";

const cards: Answer[] = [
  { id: "cafe", text: "Café walk", placement: { kind: "any" } },
  {
    id: "dessert",
    text: "Discover a new dessert",
    placement: { kind: "any" },
  },
  {
    id: "order",
    text: "Order something you cannot pronounce",
    placement: { kind: "any" },
  },
];

describe("Card Pool fuzzy search", () => {
  const search = new CardPoolSearch();

  it("matches case and accents while returning exact display ranges", () => {
    expect(search.search(cards, " CAFE ")).toEqual([
      { cardId: "cafe", ranges: [[0, 3]] },
    ]);
    expect(
      search.search(
        [{ id: "emoji", text: "Find a 🍰", placement: { kind: "any" } }],
        "🍰",
      ),
    ).toEqual([{ cardId: "emoji", ranges: [[7, 8]] }]);
  });

  it("supports ordered abbreviations and preserves Card Pool order", () => {
    const results = search.search(cards, "dscvr dsrt");

    expect(results.map((result) => result.cardId)).toEqual(["dessert"]);
    expect(results[0]?.ranges.length).toBeGreaterThan(1);
  });

  it("uses bounded typo and transposition matching", () => {
    expect(search.search(cards, "desxert").map(({ cardId }) => cardId)).toEqual([
      "dessert",
    ]);
    expect(search.search(cards, "desesrt").map(({ cardId }) => cardId)).toEqual([
      "dessert",
    ]);
  });

  it("rejects unrelated, excessively scattered, empty, and one-letter typo queries", () => {
    const scattered: Answer[] = [
      { id: "spread", text: "t........a........t", placement: { kind: "any" } },
    ];

    expect(search.search(cards, "zzq")).toEqual([]);
    expect(search.search(scattered, "tat")).toEqual([]);
    expect(search.search(cards, "")).toEqual([]);
    expect(search.search(cards, "x")).toEqual([]);
  });
});

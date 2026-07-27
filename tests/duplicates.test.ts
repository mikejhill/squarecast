import { describe, expect, it } from "vitest";
import { DuplicateCardDetector } from "../src/lib/duplicates";
import type { Answer } from "../src/lib/model";

describe("duplicate card detection", () => {
  const detector = new DuplicateCardDetector();
  const card = (id: string, text: string): Answer => ({
    id,
    text,
    placement: { kind: "any" },
  });

  it("marks every card sharing normalized text", () => {
    const duplicates = detector.findDuplicateIds([
      card("first", "Discover a new dessert"),
      card("second", "  discover A NEW dessert "),
      card("unique", "Find a hidden garden"),
    ]);

    expect([...duplicates]).toEqual(["first", "second"]);
  });

  it("does not treat blank cards as duplicates", () => {
    expect(
      detector.findDuplicateIds([card("first", " "), card("second", "")]),
    ).toEqual(new Set());
  });

  it("returns no IDs when every card is unique", () => {
    expect(
      detector.findDuplicateIds([card("first", "Alpha"), card("second", "Beta")]),
    ).toEqual(new Set());
  });
});

import { describe, expect, it } from "vitest";
import { AnswerPoolSorter } from "../src/lib/sorting";
import type { Answer } from "../src/lib/model";

describe("card pool sorting", () => {
  const sorter = new AnswerPoolSorter();
  const answers: Answer[] = [
    { id: "1", text: "Zebra", placement: { kind: "any" } },
    { id: "2", text: "apple", placement: { kind: "row", index: 0 } },
    { id: "3", text: "Museum", placement: { kind: "any" } },
  ];

  it("sorts alphabetically in either direction without mutating the source", () => {
    expect(sorter.sort(answers, "alphabetical").map((answer) => answer.id)).toEqual([
      "2",
      "3",
      "1",
    ]);
    expect(sorter.sort(answers, "reverse").map((answer) => answer.id)).toEqual([
      "1",
      "3",
      "2",
    ]);
    expect(answers.map((answer) => answer.id)).toEqual(["1", "2", "3"]);
  });

  it("moves constrained cards ahead of flexible cards", () => {
    expect(sorter.sort(answers, "constrained")[0]?.id).toBe("2");
  });

  it("supports deterministic shuffling", () => {
    expect(sorter.sort(answers, "shuffle", () => 0).map((answer) => answer.id)).toEqual([
      "2",
      "3",
      "1",
    ]);
  });
});

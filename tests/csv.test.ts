import { describe, expect, it } from "vitest";
import { parseCsvAnswers } from "../src/lib/csv";

describe("CSV answer parser", () => {
  it("accepts rows, columns, quoted commas, and escaped quotes", () => {
    expect(
      parseCsvAnswers('Alpha,Beta\n"Gamma, Inc.","Said ""hello"""'),
    ).toEqual(["Alpha", "Beta", "Gamma, Inc.", 'Said "hello"']);
  });

  it("ignores empty cells", () => {
    expect(parseCsvAnswers("Alpha,,\n  ,Beta")).toEqual(["Alpha", "Beta"]);
  });
});

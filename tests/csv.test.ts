import { describe, expect, it } from "vitest";
import { CsvAnswerParser } from "../src/lib/csv";

describe("CSV answer parser", () => {
  const parser = new CsvAnswerParser();

  it("accepts rows, columns, quoted commas, and escaped quotes", () => {
    expect(
      parser.parse('Alpha,Beta\n"Gamma, Inc.","Said ""hello"""'),
    ).toEqual(["Alpha", "Beta", "Gamma, Inc.", 'Said "hello"']);
  });

  it("ignores empty cells", () => {
    expect(parser.parse("Alpha,,\n  ,Beta")).toEqual(["Alpha", "Beta"]);
  });

  it("supports Windows line endings and a final unterminated value", () => {
    expect(parser.parse("Alpha\r\nBeta\r\nGamma")).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });
});

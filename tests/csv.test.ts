import { describe, expect, it } from "vitest";
import {
  CsvAnswerParser,
  CsvFileImporter,
  type CsvFileLike,
} from "../src/lib/csv";

describe("CSV card parser", () => {
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

describe("CSV file importer", () => {
  const importer = new CsvFileImporter(new CsvAnswerParser());

  const file = (
    name: string,
    type: string,
    content: string,
  ): CsvFileLike => ({
    name,
    type,
    text: async () => content,
  });

  it("combines multiple CSV files and ignores unrelated dropped files", async () => {
    const cards = await importer.parse([
      file("first.CSV", "", "Alpha,Beta"),
      file("notes.txt", "text/plain", "Do not import"),
      file("second", "text/csv", '"Gamma, Inc."\nDelta'),
    ]);

    expect(cards).toEqual(["Alpha", "Beta", "Gamma, Inc.", "Delta"]);
  });

  it("accepts spreadsheet CSV MIME types without a file extension", async () => {
    await expect(
      importer.parse([
        file("export", "application/vnd.ms-excel", "Alpha\nBeta"),
      ]),
    ).resolves.toEqual(["Alpha", "Beta"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  CsvAnswerParser,
  CsvAnswerSerializer,
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

  it("retains a final value when a quoted field is not closed", () => {
    expect(parser.parse('Alpha,"Beta')).toEqual(["Alpha", "Beta"]);
  });
});

describe("CSV card serializer", () => {
  const serializer = new CsvAnswerSerializer();
  const parser = new CsvAnswerParser();

  it("writes one card per row and escapes punctuation losslessly", () => {
    const cards = [
      "Alpha",
      "Gamma, Inc.",
      'Said "hello"',
      "Two\nLines",
    ];
    const output = serializer.serialize(cards);

    expect(output).toBe(
      'Alpha\r\n"Gamma, Inc."\r\n"Said ""hello"""\r\n"Two\nLines"\r\n',
    );
    expect(parser.parse(output)).toEqual(cards);
  });

  it("omits blank cards and emits an empty file for an empty pool", () => {
    expect(serializer.serialize([" Alpha ", "", "  "])).toBe("Alpha\r\n");
    expect(serializer.serialize([])).toBe("");
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

  it("surfaces browser file-read failures to the drop handler", async () => {
    const failure = new Error("read blocked");
    const unreadable: CsvFileLike = {
      name: "cards.csv",
      type: "text/csv",
      text: async () => {
        throw failure;
      },
    };

    await expect(importer.parse([unreadable])).rejects.toBe(failure);
  });
});

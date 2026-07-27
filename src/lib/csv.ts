import { RuntimeLogger } from "./logger";

const logger = new RuntimeLogger("csv-import");

/**
 * Parses the subset of RFC-style CSV needed by the card importer, including
 * quoted commas, escaped quotes, mixed line endings, and multiple columns.
 */
export class CsvAnswerParser {
  /** Converts every non-empty CSV field into one trimmed card value. */
  public parse(input: string): string[] {
    const values: string[] = [];
    let field = "";
    let quoted = false;

    const push = (): void => {
      const value = field.trim();
      if (value) values.push(value);
      field = "";
    };

    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (character === '"') {
        if (quoted && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (
        (character === "," || character === "\n" || character === "\r") &&
        !quoted
      ) {
        push();
        if (character === "\r" && input[index + 1] === "\n") index += 1;
      } else {
        field += character;
      }
    }
    push();
    if (quoted) {
      // The modal parses while the user types, so an unfinished quote is
      // diagnostic detail rather than a runtime warning.
      logger.debug("CSV input currently has an unclosed quoted field.", {
        inputLength: input.length,
      });
    }
    logger.debug("Parsed CSV card values.", {
      inputLength: input.length,
      cardCount: values.length,
    });
    return values;
  }
}

/**
 * Exports a Card Pool as one RFC-compatible CSV field per row.
 *
 * A single-column format remains easy to inspect in a spreadsheet and can be
 * fed directly back through the existing paste and drag-and-drop import paths.
 */
export class CsvAnswerSerializer {
  /** Serializes non-empty cards while preserving their displayed order. */
  public serialize(values: readonly string[]): string {
    const rows = values
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => this.escape(value));
    return rows.length > 0 ? `${rows.join("\r\n")}\r\n` : "";
  }

  /** Quotes only fields whose punctuation would otherwise change their value. */
  private escape(value: string): string {
    if (!/[",\r\n]/.test(value)) return value;
    return `"${value.replaceAll('"', '""')}"`;
  }
}

/** Minimal File contract used to keep browser file reads unit-testable. */
export interface CsvFileLike {
  readonly name: string;
  readonly type: string;
  text(): Promise<string>;
}

/** Filters dropped files and combines accepted CSV content into one card list. */
export class CsvFileImporter {
  public constructor(private readonly parser: CsvAnswerParser) {}

  /** Accepts conventional CSV extensions and the two common browser MIME types. */
  public accepts(file: CsvFileLike): boolean {
    const type = file.type.toLowerCase();
    return (
      file.name.toLowerCase().endsWith(".csv") ||
      type === "text/csv" ||
      type === "application/vnd.ms-excel"
    );
  }

  /** Reads accepted files concurrently, preserving the browser's drop order. */
  public async parse(files: readonly CsvFileLike[]): Promise<string[]> {
    const accepted = files.filter((file) => this.accepts(file));
    const ignoredCount = files.length - accepted.length;
    if (ignoredCount > 0) {
      logger.warn("Ignored non-CSV files from a Card Pool drop.", {
        ignoredCount,
      });
    }
    try {
      const contents = await Promise.all(accepted.map((file) => file.text()));
      const cards = contents.flatMap((content) => this.parser.parse(content));
      logger.info("Imported dropped CSV files.", {
        fileCount: accepted.length,
        cardCount: cards.length,
      });
      return cards;
    } catch (error) {
      logger.error("Could not read a dropped CSV file.", error, {
        fileCount: accepted.length,
      });
      throw error;
    }
  }
}

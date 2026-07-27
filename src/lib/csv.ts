export class CsvAnswerParser {
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
    return values;
  }
}

export interface CsvFileLike {
  readonly name: string;
  readonly type: string;
  text(): Promise<string>;
}

export class CsvFileImporter {
  public constructor(private readonly parser: CsvAnswerParser) {}

  public accepts(file: CsvFileLike): boolean {
    const type = file.type.toLowerCase();
    return (
      file.name.toLowerCase().endsWith(".csv") ||
      type === "text/csv" ||
      type === "application/vnd.ms-excel"
    );
  }

  public async parse(files: readonly CsvFileLike[]): Promise<string[]> {
    const contents = await Promise.all(
      files
        .filter((file) => this.accepts(file))
        .map((file) => file.text()),
    );
    return contents.flatMap((content) => this.parser.parse(content));
  }
}

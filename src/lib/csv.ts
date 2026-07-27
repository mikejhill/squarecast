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

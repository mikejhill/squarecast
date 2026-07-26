export function parseCsvAnswers(input: string): string[] {
  const values: string[] = [];
  let field = "";
  let quoted = false;

  const push = () => {
    const value = field.trim();
    if (value) values.push(value);
    field = "";
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((char === "," || char === "\n" || char === "\r") && !quoted) {
      push();
      if (char === "\r" && input[i + 1] === "\n") i += 1;
    } else {
      field += char;
    }
  }
  push();
  return values;
}

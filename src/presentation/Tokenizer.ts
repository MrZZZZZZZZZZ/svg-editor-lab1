/** Splits one CLI line without interpreting SVG values such as #ffffff. */
export class Tokenizer {
  tokenize(line: string): string[] {
    if (line.trimStart().startsWith("#")) return [];

    const tokens: string[] = [];
    let index = 0;
    while (index < line.length) {
      while (index < line.length && /\s/u.test(line[index]!)) index += 1;
      if (index === line.length) break;

      const quoted = line[index] === '"';
      if (quoted) index += 1;
      let value = "";
      let closed = !quoted;

      while (index < line.length) {
        const character = line[index]!;
        if (character === "\\" && (line[index + 1] === '"' || line[index + 1] === "\\")) {
          value += line[index + 1]!;
          index += 2;
        } else if (quoted && character === '"') {
          index += 1;
          closed = true;
          break;
        } else if (!quoted && /\s/u.test(character)) {
          break;
        } else if (!quoted && character === '"') {
          throw new Error("double quote must start a parameter");
        } else {
          value += character;
          index += 1;
        }
      }

      if (!closed) throw new Error("unterminated double quote");
      if (quoted && index < line.length && !/\s/u.test(line[index]!)) {
        throw new Error("expected whitespace after closing quote");
      }
      tokens.push(value);
    }
    return tokens;
  }
}

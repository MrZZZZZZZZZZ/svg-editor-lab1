/** XML 1.0 Char production, checked by code point so valid surrogate pairs survive. */
export class XmlCharacters {
  static assertValid(value: string): void {
    for (const character of value) {
      const codePoint = character.codePointAt(0)!;
      if (codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD ||
        (codePoint >= 0x20 && codePoint <= 0xD7FF) ||
        (codePoint >= 0xE000 && codePoint <= 0xFFFD) ||
        (codePoint >= 0x10000 && codePoint <= 0x10FFFF)) continue;
      throw new Error('invalid XML character');
    }
  }
}

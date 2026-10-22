export class CommandArgs {
  readonly #values: readonly string[];
  readonly #syntax: string;

  constructor(values: readonly string[], syntax: string) {
    this.#values = [...values];
    this.#syntax = syntax;
  }

  get length(): number { return this.#values.length; }
  at(index: number): string {
    const value = this.#values[index];
    if (value === undefined) this.invalid();
    return value;
  }
  optional(index: number): string | undefined { return this.#values[index]; }
  rest(index: number): string[] { return this.#values.slice(index); }

  number(index: number): number {
    const token = this.at(index);
    if (token.trim() === '' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) {
      throw new Error(`invalid number: ${token}`);
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error(`invalid number: ${token}`);
    return value;
  }

  expect(min: number, max = min): void {
    if (this.length < min || this.length > max) this.invalid();
  }

  invalid(): never { throw new Error(`usage: ${this.#syntax}`); }
}

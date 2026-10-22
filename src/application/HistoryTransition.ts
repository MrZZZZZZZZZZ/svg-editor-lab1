import type { SvgDocument } from '../domain/SvgDocument.js';

export class HistoryTransition {
  readonly #document: SvgDocument;
  readonly #lines: readonly string[];

  constructor(document: SvgDocument, lines: readonly string[]) {
    this.#document = document;
    this.#lines = [...lines];
  }

  get document(): SvgDocument { return this.#document; }
  get lines(): string[] { return [...this.#lines]; }
}

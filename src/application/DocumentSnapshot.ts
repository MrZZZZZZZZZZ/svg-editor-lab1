import { SvgDocument } from '../domain/SvgDocument.js';

/** Opaque memento: callers cannot mutate the stored document. */
export class DocumentSnapshot {
  readonly #document: SvgDocument;

  constructor(document: SvgDocument) {
    this.#document = document.clone();
  }

  restore(): SvgDocument {
    return this.#document.clone();
  }
}

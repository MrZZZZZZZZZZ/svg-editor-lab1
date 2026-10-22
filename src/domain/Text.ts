import { Shape } from './Shape.js';

export class Text extends Shape {
  #text: string;

  constructor(id: string, attributes: Readonly<Record<string, string>> = {}, text = '') {
    super(id, 'text', ['x', 'y'], [], ['x'], ['y'], attributes);
    this.#text = text;
  }

  override get textContent(): string { return this.#text; }

  override set(attribute: string, value: string): void {
    if (attribute === 'text') this.#text = value;
    else super.set(attribute, value);
  }

  override clone(): Text { return new Text(this.id, this.attributes, this.#text); }

  override describe(): string {
    const a = this.attributes;
    return this.descriptionWithStyle(`(${a.x},${a.y}) ${JSON.stringify(this.#text)}`);
  }
}

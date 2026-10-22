import { Shape } from './Shape.js';

export class Ellipse extends Shape {
  constructor(id: string, attributes: Readonly<Record<string, string>> = {}) {
    super(id, 'ellipse', ['cx', 'cy', 'rx', 'ry'], ['rx', 'ry'], ['cx'], ['cy'], attributes);
  }

  override clone(): Ellipse { return new Ellipse(this.id, this.attributes); }
}

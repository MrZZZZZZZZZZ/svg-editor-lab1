import { Shape } from './Shape.js';

export class Circle extends Shape {
  constructor(id: string, attributes: Readonly<Record<string, string>> = {}) {
    super(id, 'circle', ['cx', 'cy', 'r'], ['r'], ['cx'], ['cy'], attributes);
  }

  override clone(): Circle { return new Circle(this.id, this.attributes); }
}

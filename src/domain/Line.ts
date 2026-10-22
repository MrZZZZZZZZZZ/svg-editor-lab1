import { Shape } from './Shape.js';

export class Line extends Shape {
  constructor(id: string, attributes: Readonly<Record<string, string>> = {}) {
    super(id, 'line', ['x1', 'y1', 'x2', 'y2'], [], ['x1', 'x2'], ['y1', 'y2'], attributes);
  }

  override clone(): Line { return new Line(this.id, this.attributes); }

  override describe(): string {
    const a = this.attributes;
    return this.descriptionWithStyle(`(${a.x1},${a.y1}) -> (${a.x2},${a.y2})`);
  }
}

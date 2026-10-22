import { Shape } from './Shape.js';

export class Rect extends Shape {
  constructor(id: string, attributes: Readonly<Record<string, string>> = {}) {
    super(id, 'rect', ['x', 'y', 'width', 'height'], ['width', 'height'], ['x'], ['y'], attributes);
  }

  override clone(): Rect { return new Rect(this.id, this.attributes); }

  override describe(): string {
    const a = this.attributes;
    return this.descriptionWithStyle(`x=${a.x} y=${a.y} w=${a.width} h=${a.height}`);
  }
}

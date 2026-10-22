import { Shape } from './Shape.js';

/** Composite node: owns ordered child nodes and guards the parent relation. */
export abstract class ContainerShape extends Shape {
  readonly #children: Shape[] = [];

  protected constructor(id: string, type: string, attributes: Readonly<Record<string, string>> = {}) {
    super(id, type, [], [], [], [], attributes);
  }

  override get children(): readonly Shape[] { return Object.freeze([...this.#children]); }
  get allowsUngroup(): boolean { return false; }

  appendChild(shape: Shape): void { this.insertChild(shape, this.#children.length); }

  insertChild(shape: Shape, index: number): void {
    for (let ancestor: Shape | null = this; ancestor; ancestor = ancestor.parent) {
      if (ancestor === shape) throw new Error(`cannot group a container into its own descendant: ${shape.id}`);
    }
    if (shape.parent) throw new Error(`shape already has a parent: ${shape.id}`);
    if (!Number.isInteger(index) || index < 0 || index > this.#children.length) {
      throw new Error('invalid child index');
    }
    this.#children.splice(index, 0, shape);
    shape.attachTo(this);
  }

  removeChild(shape: Shape): Shape {
    const index = this.#children.indexOf(shape);
    if (index < 0) throw new Error(`no such child: ${shape.id}`);
    this.#children.splice(index, 1);
    shape.attachTo(null);
    return shape;
  }
}

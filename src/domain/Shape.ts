import type { ContainerShape } from './ContainerShape.js';

/** An addressable SVG node. Geometry and relationships are encapsulated. */
export abstract class Shape {
  readonly #id: string;
  readonly #type: string;
  #parent: ContainerShape | null = null;
  readonly #values: Record<string, string> = {};
  readonly #geometry: readonly string[];
  readonly #nonNegative: readonly string[];
  readonly #xFields: readonly string[];
  readonly #yFields: readonly string[];

  protected constructor(
    id: string,
    type: string,
    geometry: readonly string[],
    nonNegative: readonly string[],
    xFields: readonly string[],
    yFields: readonly string[],
    attributes: Readonly<Record<string, string>> = {},
  ) {
    if (!id || /[\s<>"'&=]/u.test(id)) throw new Error(`invalid id: ${id}`);
    this.#id = id;
    this.#type = type;
    this.#geometry = geometry;
    this.#nonNegative = nonNegative;
    this.#xFields = xFields;
    this.#yFields = yFields;
    for (const key of geometry) this.#values[key] = '0';
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'id') continue;
      if (geometry.includes(key) || ['fill', 'stroke', 'stroke-width'].includes(key)) {
        this.set(key, value);
      } else {
        this.#values[key] = value;
      }
    }
  }

  get id(): string { return this.#id; }
  get type(): string { return this.#type; }
  get label(): string { return `${this.type}#${this.id}`; }
  get parent(): ContainerShape | null { return this.#parent; }
  get children(): readonly Shape[] { return []; }
  get attributes(): Readonly<Record<string, string>> { return Object.freeze({ ...this.#values }); }
  get textContent(): string | undefined { return undefined; }

  /** Relationship mutation is owned by ContainerShape, not command handlers. */
  attachTo(parent: ContainerShape | null): void {
    if (this.#parent && this.#parent !== parent && this.#parent.children.includes(this)) {
      throw new Error(`shape must be detached first: ${this.id}`);
    }
    if (parent && !parent.children.includes(this)) throw new Error(`container does not own shape: ${this.id}`);
    this.#parent = parent;
  }

  move(dx: number, dy: number): void {
    this.requireFinite(dx, 'dx');
    this.requireFinite(dy, 'dy');
    this.applyGeometry((shape, key, value) =>
      value + (shape.#xFields.includes(key) ? dx : shape.#yFields.includes(key) ? dy : 0));
  }

  scale(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('scale factor must be positive');
    this.applyGeometry((_shape, _key, value) => value * factor);
  }

  set(attribute: string, value: string): void {
    if (this.#geometry.includes(attribute) || attribute === 'stroke-width') {
      const number = this.parseNumber(value, attribute);
      if ((attribute === 'stroke-width' || this.#nonNegative.includes(attribute)) && number < 0) {
        throw new Error(`${attribute} must be non-negative`);
      }
      this.#values[attribute] = String(number);
      return;
    }
    if (attribute === 'fill' || attribute === 'stroke') {
      this.#values[attribute] = value;
      return;
    }
    throw new Error(`unknown attribute: ${attribute}`);
  }

  abstract clone(): Shape;

  describe(): string {
    const geometry = this.#geometry.map(key => `${key}=${this.#values[key]}`);
    return this.descriptionWithStyle(geometry.join(' '));
  }

  protected descriptionWithStyle(geometry: string): string {
    const styles = ['fill', 'stroke', 'stroke-width']
      .filter(key => this.#values[key] !== undefined)
      .map(key => `${key}=${this.#values[key]}`);
    return [this.label, geometry, ...styles].filter(Boolean).join(' ');
  }

  protected parseNumber(value: string, name: string): number {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim())) {
      throw new Error(`invalid number for ${name}: ${value}`);
    }
    const number = Number(value);
    this.requireFinite(number, name);
    return number;
  }

  private requireFinite(value: number, name: string): void {
    if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  }

  /** Prepare every descendant's values first: overflow cannot leave a partial edit. */
  private applyGeometry(transform: (shape: Shape, key: string, value: number) => number): void {
    const changes: Array<{ shape: Shape; key: string; value: number }> = [];
    const visit = (shape: Shape): void => {
      for (const key of shape.#geometry) {
        const value = transform(shape, key, Number(shape.#values[key]));
        this.requireFinite(value, key);
        changes.push({ shape, key, value });
      }
      for (const child of shape.children) visit(child);
    };
    visit(this);
    for (const change of changes) change.shape.#values[change.key] = String(change.value);
  }
}

import { Shape } from './Shape.js';
import { Rect } from './Rect.js';
import { Circle } from './Circle.js';
import { Ellipse } from './Ellipse.js';
import { Line } from './Line.js';
import { Text } from './Text.js';
import { Group } from './Group.js';

type Definition = {
  geometry: readonly string[];
  optionalStyle?: string;
  text?: boolean;
  construct: (id: string, attributes: Readonly<Record<string, string>>, text?: string) => Shape;
};

/** The sole shape-name dispatch point; a provider registry can replace it later. */
export class ShapeFactory {
  readonly #definitions = new Map<string, Definition>([
    ['rect', { geometry: ['x', 'y', 'width', 'height'], optionalStyle: 'fill', construct: (id, a) => new Rect(id, a) }],
    ['circle', { geometry: ['cx', 'cy', 'r'], optionalStyle: 'fill', construct: (id, a) => new Circle(id, a) }],
    ['ellipse', { geometry: ['cx', 'cy', 'rx', 'ry'], optionalStyle: 'fill', construct: (id, a) => new Ellipse(id, a) }],
    ['line', { geometry: ['x1', 'y1', 'x2', 'y2'], optionalStyle: 'stroke', construct: (id, a) => new Line(id, a) }],
    ['text', { geometry: ['x', 'y'], text: true, construct: (id, a, text) => new Text(id, a, text) }],
    ['g', { geometry: [], construct: (id, a) => new Group(id, a) }],
  ]);
  readonly #presentation = new Set([
    'fill', 'stroke', 'stroke-width', 'transform', 'font-size', 'font-family',
    'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline',
    'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
    'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'clip-rule',
    'vector-effect', 'visibility', 'display', 'class',
  ]);

  create(type: string, id: string, params: string[]): Shape {
    const definition = this.definition(type);
    const required = definition.geometry.length + (definition.text ? 1 : 0);
    const maximum = required + (definition.optionalStyle ? 1 : 0);
    if (params.length < required || params.length > maximum) {
      throw new Error(`invalid parameters for ${type}: expected ${required}${maximum > required ? `-${maximum}` : ''}, got ${params.length}`);
    }
    const attributes: Record<string, string> = {};
    definition.geometry.forEach((key, index) => { attributes[key] = params[index]!; });
    if (definition.optionalStyle && params[required] !== undefined) {
      attributes[definition.optionalStyle] = params[required]!;
    }
    return definition.construct(id, attributes, definition.text ? params[definition.geometry.length] : undefined);
  }

  fromSvg(type: string, id: string, attributes: Readonly<Record<string, string>>, text?: string): Shape {
    const definition = this.definition(type);
    for (const key of Object.keys(attributes)) {
      if (key === 'id' || definition.geometry.includes(key) || this.#presentation.has(key) || /^data-[a-zA-Z0-9_.-]+$/u.test(key)) continue;
      throw new Error(`unsupported SVG attribute: ${key}`);
    }
    return definition.construct(id, attributes, text);
  }

  private definition(type: string): Definition {
    const definition = this.#definitions.get(type);
    if (!definition) throw new Error(`unknown shape type: ${type} (is the plugin loaded?)`);
    return definition;
  }
}

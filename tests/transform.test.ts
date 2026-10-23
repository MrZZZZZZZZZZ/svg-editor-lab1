import assert from 'node:assert/strict';
import test from 'node:test';
import { Editor } from '../src/application/Editor.js';
import type { SvgRepository } from '../src/application/ports/SvgRepository.js';
import type { Shape } from '../src/domain/Shape.js';
import { ShapeFactory } from '../src/domain/ShapeFactory.js';
import { SvgDocument } from '../src/domain/SvgDocument.js';
import { SvgReader } from '../src/infrastructure/svg/SvgReader.js';
import { SvgWriter } from '../src/infrastructure/svg/SvgWriter.js';
import { ShowFormatter } from '../src/presentation/ShowFormatter.js';
import { Tokenizer } from '../src/presentation/Tokenizer.js';
import { TreeFormatter } from '../src/presentation/TreeFormatter.js';

type Matrix = readonly [number, number, number, number, number, number];
type Point = readonly [number, number];

/** Independent SVG affine-matrix oracle: checks rendered points, not wrapper strings. */
class SvgMatrixProbe {
  readonly #identity: Matrix = [1, 0, 0, 1, 0, 0];

  render(shape: Shape, point: Point, stopBefore: Shape | null = null): Point {
    let result = this.#identity;
    for (let current: Shape | null = shape; current !== stopBefore && current; current = current.parent) {
      result = this.multiply(this.parse(current.attributes.transform ?? ''), result);
    }
    return [result[0] * point[0] + result[2] * point[1] + result[4],
      result[1] * point[0] + result[3] * point[1] + result[5]];
  }

  rectangle(shape: Shape, stopBefore: Shape | null = null): Point[] {
    const a = shape.attributes;
    const x = Number(a.x);
    const y = Number(a.y);
    const width = Number(a.width);
    const height = Number(a.height);
    return [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
      .map(point => this.render(shape, point as [number, number], stopBefore));
  }

  close(actual: Point, expected: Point): void {
    for (let index = 0; index < 2; index += 1) {
      assert.ok(Math.abs(actual[index]! - expected[index]!) <= 1e-9 * Math.max(1, Math.abs(expected[index]!)),
        `${JSON.stringify(actual)} should equal ${JSON.stringify(expected)}`);
    }
  }

  private parse(value: string): Matrix {
    let matrix = this.#identity;
    const operations: Readonly<Record<string, (args: number[]) => Matrix>> = {
      matrix: a => {
        assert.equal(a.length, 6);
        return [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
      },
      translate: a => [1, 0, 0, 1, a[0]!, a[1] ?? 0],
      scale: a => [a[0]!, 0, 0, a[1] ?? a[0]!, 0, 0],
      rotate: a => {
        const radians = a[0]! * Math.PI / 180;
        const rotation: Matrix = [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
        const x = a[1] ?? 0;
        const y = a[2] ?? 0;
        return this.multiply(this.multiply([1, 0, 0, 1, x, y], rotation), [1, 0, 0, 1, -x, -y]);
      },
      skewX: a => [1, 0, Math.tan(a[0]! * Math.PI / 180), 1, 0, 0],
      skewY: a => [1, Math.tan(a[0]! * Math.PI / 180), 0, 1, 0, 0],
    };
    const pattern = /([A-Za-z]+)\s*\(([^)]*)\)/gu;
    for (const match of value.matchAll(pattern)) {
      const args = match[2]!.trim().split(/[\s,]+/u).map(Number);
      const operation = operations[match[1]!];
      assert.ok(operation, `unsupported transform in test oracle: ${match[1]}`);
      matrix = this.multiply(matrix, operation(args));
    }
    assert.equal(value.replace(pattern, '').replace(/[\s,]/gu, ''), '', 'all SVG transform text was evaluated');
    return matrix;
  }

  private multiply(left: Matrix, right: Matrix): Matrix {
    const [a, b, c, d, e, f] = left;
    const [g, h, i, j, k, l] = right;
    return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j,
      a * k + c * l + e, b * k + d * l + f];
  }
}

const factory = new ShapeFactory();
const probe = new SvgMatrixProbe();

test('moving a composite preserves its geometry across mixed nested rotate, skew, matrix and scale transforms', () => {
  const document = new SvgDocument();
  document.append(factory.fromSvg('g', 'scene', { transform: 'translate(100 -50) rotate(20)' }));
  document.append(factory.fromSvg('g', 'scaled', { transform: 'scale(2 0.75) translate(3 -4)' }), 'scene');
  document.append(factory.fromSvg('g', 'rotated', { transform: 'rotate(33 2 -1) skewX(15)' }), 'scaled');
  document.append(factory.create('g', 'bare', []), 'scene');
  document.append(factory.fromSvg('rect', 'r1', { x: '1', y: '2', width: '3', height: '4', transform: 'matrix(1 0.1 -0.2 1 5 6)' }), 'rotated');
  document.append(factory.fromSvg('rect', 'r2', { x: '100', y: '20', width: '8', height: '9', transform: 'skewY(-11) translate(-7 9)' }), 'scene');
  document.append(factory.create('rect', 'r3', ['40', '50', '6', '7']), 'bare');
  const ids = ['r1', 'r2', 'r3'];
  const original = ids.map(id => probe.rectangle(document.find(id)));
  document.find('scene').move(11, -7);
  ids.forEach((id, index) => {
    probe.rectangle(document.find(id)).forEach((point, corner) => {
      const before = original[index]![corner]!;
      probe.close(point, [before[0] + 11, before[1] - 7]);
    });
  });
  assert.equal(document.find('bare').attributes.transform, undefined);
  assert.equal(document.find('r3').attributes.transform, undefined);
  assert.deepEqual(document.find('r1').attributes.width, '3');
});

test('scaling a composite also scales every inherited transform translation around the parent origin', () => {
  const document = new SvgDocument();
  document.append(factory.fromSvg('g', 'scene', { transform: 'translate(30 40) rotate(25)' }));
  document.append(factory.fromSvg('g', 'nested', { transform: 'translate(80 -15) scale(2 0.75)' }), 'scene');
  document.append(factory.fromSvg('rect', 'r1', { x: '1', y: '2', width: '3', height: '4', transform: 'rotate(-20 5 6)' }), 'nested');
  document.append(factory.create('rect', 'r2', ['100', '50', '6', '7']), 'scene');
  const ids = ['r1', 'r2'];
  const original = ids.map(id => probe.rectangle(document.find(id)));
  document.find('scene').scale(1.5);
  ids.forEach((id, index) => {
    probe.rectangle(document.find(id)).forEach((point, corner) => {
      const before = original[index]![corner]!;
      probe.close(point, [before[0] * 1.5, before[1] * 1.5]);
    });
  });
  assert.deepEqual(document.find('r1').attributes.width, '4.5');
  assert.deepEqual(document.find('r1').attributes.height, '6');
  assert.deepEqual(document.find('r2').attributes.x, '150');
});

test('every leaf type moves and scales its anchor in its parent coordinates despite its own transform', () => {
  const examples: Array<[string, Record<string, string>, string, string]> = [
    ['rect', { x: '1', y: '2', width: '3', height: '4' }, 'x', 'y'],
    ['circle', { cx: '1', cy: '2', r: '3' }, 'cx', 'cy'],
    ['ellipse', { cx: '1', cy: '2', rx: '3', ry: '4' }, 'cx', 'cy'],
    ['line', { x1: '1', y1: '2', x2: '3', y2: '4' }, 'x1', 'y1'],
    ['text', { x: '1', y: '2' }, 'x', 'y'],
  ];
  for (const [type, attributes, xKey, yKey] of examples) {
    const shape = factory.fromSvg(type, type, { ...attributes, transform: 'rotate(90) translate(4 5) scale(2 3)' }, 'Caption');
    const anchor = (): Point => probe.render(shape, [Number(shape.attributes[xKey]), Number(shape.attributes[yKey])]);
    const original = anchor();
    shape.move(10, 20);
    probe.close(anchor(), [original[0] + 10, original[1] + 20]);
    shape.scale(2);
    probe.close(anchor(), [(original[0] + 10) * 2, (original[1] + 20) * 2]);
  }
});

test('a nested selection uses its parent coordinate system and does not edit ancestors', () => {
  const document = new SvgDocument();
  document.append(factory.fromSvg('g', 'ancestor', { transform: 'rotate(90) scale(2)' }));
  document.append(factory.fromSvg('g', 'selection', { transform: 'scale(3) translate(1 2)' }), 'ancestor');
  document.append(factory.fromSvg('rect', 'r', { x: '1', y: '2', width: '3', height: '4', transform: 'rotate(-17)' }), 'selection');
  const ancestor = document.find('ancestor');
  const selection = document.find('selection');
  const shape = document.find('r');
  const parentCoordinates = probe.rectangle(shape, ancestor);
  const worldCoordinates = probe.rectangle(shape);
  selection.move(5, -3);
  probe.rectangle(shape, ancestor).forEach((point, index) => {
    const before = parentCoordinates[index]!;
    probe.close(point, [before[0] + 5, before[1] - 3]);
  });
  probe.rectangle(shape).forEach((point, index) => {
    const before = worldCoordinates[index]!;
    probe.close(point, [before[0] + 6, before[1] + 10]);
  });
  assert.equal(ancestor.attributes.transform, 'rotate(90) scale(2)');
});

test('failed numeric edits preserve both geometry and transforms throughout the subtree', () => {
  const document = new SvgDocument();
  document.append(factory.fromSvg('g', 'scene', { transform: 'translate(30 40)' }));
  document.append(factory.fromSvg('rect', 'normal', { x: '1', y: '2', width: '3', height: '4', transform: 'rotate(10)' }), 'scene');
  document.append(factory.create('circle', 'huge', ['1e308', '2', '3']), 'scene');
  const before = ['scene', 'normal', 'huge'].map(id => document.find(id).attributes);
  assert.throws(() => document.find('scene').scale(2), /finite number/u);
  assert.deepEqual(['scene', 'normal', 'huge'].map(id => document.find(id).attributes), before);
  assert.throws(() => document.find('scene').scale(Number.MIN_VALUE), /too small/u);
  assert.deepEqual(['scene', 'normal', 'huge'].map(id => document.find(id).attributes), before);
  document.find('scene').move(0, 0);
  document.find('scene').scale(1);
  assert.deepEqual(['scene', 'normal', 'huge'].map(id => document.find(id).attributes), before);
});

test('transformed CLI edits retain rendering, exact undo/redo snapshots and SVG round-trip', async () => {
  const files = new Map<string, string>([['input.svg', `
    <svg width="800" height="600">
      <g id="scene" transform="translate(30 40)">
        <g id="scaled" transform="scale(2)">
          <rect id="r1" x="1" y="2" width="3" height="4"/>
        </g>
        <rect id="r2" x="100" y="20" width="8" height="9" transform="rotate(30)"/>
      </g>
    </svg>`]]);
  const writer = new SvgWriter();
  const repository: SvgRepository = {
    async read(path) {
      const xml = files.get(path);
      if (!xml) throw new Error(`cannot read file: ${path}`);
      return new SvgReader().read(xml);
    },
    async write(path, document) { files.set(path, writer.write(document)); },
  };
  const editor = new Editor(repository, new Tokenizer(), new TreeFormatter(), new ShowFormatter());
  const snapshot = (): string => writer.write(editor.requireDocument());
  await editor.execute('read input.svg');
  const original = snapshot();
  const ids = ['r1', 'r2'];
  const originalPoints = ids.map(id => probe.rectangle(editor.requireDocument().find(id)));
  await editor.execute('move scene 10 20');
  const moved = snapshot();
  await editor.execute('scale scene 1.5');
  const scaled = snapshot();
  ids.forEach((id, index) => {
    probe.rectangle(editor.requireDocument().find(id)).forEach((point, corner) => {
      const before = originalPoints[index]![corner]!;
      probe.close(point, [(before[0] + 10) * 1.5, (before[1] + 20) * 1.5]);
    });
  });
  await editor.execute('undo');
  assert.equal(snapshot(), moved);
  await assert.rejects(editor.execute('scale scene 5e-324'), /too small/u);
  assert.equal(snapshot(), moved);
  await editor.execute('undo');
  assert.equal(snapshot(), original);
  await editor.execute('redo');
  assert.equal(snapshot(), moved);
  await editor.execute('redo');
  assert.equal(snapshot(), scaled);
  await editor.execute('save output.svg');
  await editor.execute('read output.svg');
  assert.equal(snapshot(), scaled);
});

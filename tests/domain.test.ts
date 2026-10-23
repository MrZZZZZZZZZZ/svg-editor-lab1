import test from 'node:test';
import assert from 'node:assert/strict';
import { ShapeFactory } from '../src/domain/ShapeFactory.js';
import { SvgDocument } from '../src/domain/SvgDocument.js';
import { Group } from '../src/domain/Group.js';

const factory = new ShapeFactory();

test('factory creates six polymorphic shapes, omits optional styles and rejects Phase 2 types', () => {
  const cases: Array<[string, string[], Readonly<Record<string, string>>]> = [
    ['rect', ['1', '2', '3', '4'], { x: '1', y: '2', width: '3', height: '4' }],
    ['circle', ['1', '2', '3', 'red'], { cx: '1', cy: '2', r: '3', fill: 'red' }],
    ['ellipse', ['1', '2', '3', '4'], { cx: '1', cy: '2', rx: '3', ry: '4' }],
    ['line', ['1', '2', '3', '4', 'black'], { x1: '1', y1: '2', x2: '3', y2: '4', stroke: 'black' }],
    ['text', ['1', '2', '开始'], { x: '1', y: '2' }],
    ['g', [], {}],
  ];
  for (const [type, params, attributes] of cases) {
    const shape = factory.create(type, `id-${type}`, params);
    assert.equal(shape.label, `${type}#id-${type}`);
    assert.deepEqual(shape.attributes, attributes);
    assert.deepEqual(shape.clone().attributes, attributes);
    assert.equal(shape.parent, null);
  }
  assert.equal(factory.create('text', 'caption', ['1', '2', '开始']).textContent, '开始');
  assert.throws(() => factory.create('box', 'n1', []), /unknown shape type: box \(is the plugin loaded\?\)/u);
  assert.throws(() => factory.create('toString', 'x', []), /unknown shape type/u);
  assert.throws(() => factory.create('rect', 'r1', ['1']), /invalid parameters/u);
});

test('numeric and attribute validation is strict and leaves state intact', () => {
  const shape = factory.create('rect', 'r', ['-1.5', '2e1', '0', '4']);
  assert.equal(shape.attributes.y, '20');
  for (const value of ['NaN', 'Infinity', '2px', '', '0x10', '1e309']) {
    assert.throws(() => shape.set('x', value));
  }
  assert.throws(() => shape.set('width', '-1'), /width must be non-negative/u);
  assert.throws(() => shape.set('stroke-width', '-1'), /stroke-width must be non-negative/u);
  assert.throws(() => shape.set('id', 'changed'), /unknown attribute: id/u);
  assert.throws(() => shape.set('text', 'caption'), /unknown attribute: text/u);
  for (const factor of [0, -1, NaN, Infinity]) {
    assert.throws(() => shape.scale(factor), /scale factor must be positive/u);
  }
  assert.throws(() => shape.move(Infinity, 0), /finite number/u);
  assert.deepEqual(shape.attributes, { x: '-1.5', y: '20', width: '0', height: '4' });
  const attributes = shape.attributes;
  assert.throws(() => { (attributes as Record<string, string>).x = '200'; }, TypeError);
  assert.equal(shape.id, 'r');
});

test('Composite applies move and scale once to all descendant geometry alongside existing transforms', () => {
  const document = new SvgDocument();
  const group = factory.fromSvg('g', 'outer', { transform: 'translate(30,40)' });
  document.append(group);
  document.append(factory.create('g', 'inner', []), 'outer');
  document.append(factory.create('rect', 'r', ['1', '2', '3', '4', 'red']), 'inner');
  document.append(factory.create('line', 'l', ['1', '2', '3', '4', 'black']), 'outer');
  document.append(factory.create('text', 't', ['5', '6', 'Text']), 'inner');
  group.move(10, 20);
  assert.deepEqual(document.find('r').attributes, { x: '11', y: '22', width: '3', height: '4', fill: 'red' });
  group.scale(2);
  assert.deepEqual(document.find('r').attributes, { x: '22', y: '44', width: '6', height: '8', fill: 'red' });
  assert.deepEqual(document.find('l').attributes, { x1: '22', y1: '44', x2: '26', y2: '48', stroke: 'black' });
  assert.deepEqual(document.find('t').attributes, { x: '30', y: '52' });
  assert.equal(document.find('t').textContent, 'Text');
  assert.ok(group.attributes.transform?.includes('translate(30,40)'));
  group.set('fill', 'blue');
  assert.equal(group.attributes.fill, 'blue');
  assert.equal(document.find('r').attributes.fill, 'red');
  assert.throws(() => group.set('x', '1'), /unknown attribute: x/u);
});

test('overflow cannot partially transform a composite subtree', () => {
  const group = new Group('g');
  const normal = factory.create('circle', 'a', ['1', '2', '3']);
  const huge = factory.create('rect', 'b', ['1e308', '1', '2', '3']);
  group.appendChild(normal);
  group.appendChild(huge);
  assert.throws(() => group.scale(2), /finite number/u);
  assert.equal(normal.attributes.cx, '1');
  assert.equal(huge.attributes.x, '1e+308');
});

test('document enforces IDs, container targets and subtree deletion', () => {
  const document = new SvgDocument(400, 300);
  document.append(factory.create('g', 'g1', []));
  document.append(factory.create('rect', 'r1', ['0', '0', '1', '1']), 'g1');
  assert.throws(() => document.append(factory.create('circle', 'r1', ['0', '0', '1'])), /id already exists: r1/u);
  assert.throws(() => document.append(factory.create('g', 'g2', []), 'none'), /no such container: none/u);
  assert.throws(() => document.findContainer('r1'), /not a container: r1/u);
  assert.throws(() => document.find('none'), /no such shape: none/u);
  assert.equal(document.find('r1').parent?.id, 'g1');
  const duplicateSubtree = new Group('subtree');
  duplicateSubtree.appendChild(factory.create('g', 'g1', []));
  assert.throws(() => document.append(duplicateSubtree), /id already exists: g1/u);
  assert.equal(document.elementCount, 2);
  assert.equal(document.delete('g1').children.length, 1);
  assert.equal(document.elementCount, 0);
  assert.throws(() => document.resize(-1, 1), /non-negative/u);
  assert.equal(document.width, 400);
  assert.equal(document.height, 300);
});

test('grouping follows document order instead of argument order and stays at the first selected branch', () => {
  const document = new SvgDocument();
  for (const id of ['a', 'b', 'c', 'd']) document.append(factory.create('circle', id, ['0', '0', '1']));
  const group = document.group('g', ['d', 'b']);
  assert.deepEqual(document.roots.map(shape => shape.id), ['a', 'g', 'c']);
  assert.deepEqual(group.children.map(shape => shape.id), ['b', 'd']);
  assert.equal(document.elementCount, 5);
  assert.throws(() => document.ungroup('g'), /cannot ungroup top-level container: g/u);
});

test('grouping across parents selects their nearest common container and retains leftover nodes', () => {
  const document = new SvgDocument();
  document.append(factory.create('g', 'outer', []));
  document.append(factory.create('g', 'left', []), 'outer');
  document.append(factory.create('g', 'right', []), 'outer');
  document.append(factory.create('g', 'a', []), 'left');
  document.append(factory.create('g', 'leftover', []), 'left');
  document.append(factory.create('g', 'b', []), 'right');
  const grouped = document.group('selection', ['b', 'a']);
  assert.equal(grouped.parent?.id, 'outer');
  assert.deepEqual(grouped.children.map(shape => shape.id), ['a', 'b']);
  assert.deepEqual(document.find('outer').children.map(shape => shape.id), ['selection', 'left', 'right']);
  assert.deepEqual(document.find('left').children.map(shape => shape.id), ['leftover']);
  assert.equal(document.ungroup('selection'), 2);
  assert.deepEqual(document.find('outer').children.map(shape => shape.id), ['a', 'b', 'left', 'right']);
  assert.equal(document.find('a').parent?.id, 'outer');
});

test('ancestor selection and reparenting cycles fail atomically', () => {
  const document = new SvgDocument();
  document.append(factory.create('g', 'parent', []));
  document.append(factory.create('g', 'child', []), 'parent');
  document.append(factory.create('g', 'leaf', []), 'child');
  assert.throws(() => document.group('bad', ['leaf', 'parent']), /cannot group a container into its own descendant: parent/u);
  assert.throws(() => document.addTo('leaf', 'parent'), /cannot group a container into its own descendant: parent/u);
  assert.throws(() => document.addTo('child', 'child'), /cannot group a container into its own descendant: child/u);
  assert.throws(() => document.group('bad', ['leaf', 'leaf']), /duplicate shape id: leaf/u);
  assert.equal(document.elementCount, 3);
  assert.equal(document.find('parent').parent, null);
  assert.equal(document.find('leaf').parent?.id, 'child');
  assert.throws(() => document.find('child').attachTo(null), /detached first/u);
});

test('z-order and addTo work for roots and container children', () => {
  const document = new SvgDocument();
  for (const id of ['a', 'b', 'c']) document.append(factory.create('g', id, []));
  document.front('a');
  assert.deepEqual(document.roots.map(shape => shape.id), ['b', 'c', 'a']);
  document.back('a');
  assert.deepEqual(document.roots.map(shape => shape.id), ['a', 'b', 'c']);
  document.addTo('a', 'b');
  document.addTo('a', 'c');
  document.front('b');
  assert.deepEqual(document.find('a').children.map(shape => shape.id), ['c', 'b']);
  document.back('b');
  assert.deepEqual(document.find('a').children.map(shape => shape.id), ['b', 'c']);
  document.addTo('a', 'b');
  assert.deepEqual(document.find('a').children.map(shape => shape.id), ['c', 'b']);
});

test('deep clones preserve imported presentation/text and isolate state and parent links', () => {
  const document = new SvgDocument();
  document.append(factory.fromSvg('g', 'g', { transform: 'scale(0.8)', 'data-kind': 'box' }));
  document.append(factory.fromSvg('text', 't', { x: '1', y: '2', 'font-size': '16', 'text-anchor': 'middle' }, 'A "quote" & 中文'), 'g');
  const copy = document.clone();
  copy.find('t').set('text', 'new text');
  copy.find('g').move(10, 20);
  assert.equal(document.find('t').textContent, 'A "quote" & 中文');
  assert.equal(document.find('t').attributes.x, '1');
  assert.equal(copy.find('t').parent, copy.find('g'));
  assert.notEqual(copy.find('g'), document.find('g'));
  assert.equal(document.find('g').attributes.transform, 'scale(0.8)');
  assert.notEqual(copy.find('g').attributes.transform, document.find('g').attributes.transform);
  assert.equal(copy.find('t').attributes['font-size'], '16');
  assert.match(document.find('t').describe(), /^text#t \(1,2\) "A \\"quote\\" & 中文"$/u);
  assert.throws(() => copy.find('t').set('font-size', '20'), /unknown attribute: font-size/u);
  assert.throws(() => factory.fromSvg('text', 'bad', { onload: 'alert(1)' }), /unsupported SVG attribute: onload/u);
});

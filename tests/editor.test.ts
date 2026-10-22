import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Editor } from '../src/application/Editor.js';
import { FileSvgRepository } from '../src/infrastructure/FileSvgRepository.js';
import { SvgWriter } from '../src/infrastructure/svg/SvgWriter.js';
import { ShowFormatter } from '../src/presentation/ShowFormatter.js';
import { Tokenizer } from '../src/presentation/Tokenizer.js';
import { TreeFormatter } from '../src/presentation/TreeFormatter.js';

class EditorFixture {
  readonly editor = new Editor(new FileSvgRepository(), new Tokenizer(), new TreeFormatter(), new ShowFormatter());

  async run(...lines: string[]): Promise<void> {
    for (const line of lines) await this.editor.execute(line);
  }

  snapshot(): string { return new SvgWriter().write(this.editor.requireDocument()); }

  order(id?: string): string[] {
    const document = this.editor.requireDocument();
    return (id === undefined ? document.roots : document.find(id).children).map(shape => shape.id);
  }

  attribute(id: string, name: string): string | undefined {
    return this.editor.requireDocument().find(id).attributes[name];
  }
}

test('commands require an initialized document, while help and comments work before init', async () => {
  const fixture = new EditorFixture();
  for (const command of [
    'save a.svg', 'canvas', 'create g g', 'delete g', 'move g 1 2', 'scale g 2',
    'set g fill red', 'group g r', 'ungroup g', 'addto g r', 'front g', 'back g',
    'tree', 'show g', 'undo', 'redo',
  ]) {
    await assert.rejects(fixture.editor.execute(command), {
      message: "no document. use 'init' or 'read' first",
    });
  }
  assert.deepEqual(await fixture.editor.execute('  # create g ignored'), []);
  assert.deepEqual(await fixture.editor.execute('   '), []);
  const help = (await fixture.editor.execute('help')).join('\n');
  for (const command of ['init', 'read', 'save', 'canvas', 'create', 'delete', 'move', 'scale',
    'set', 'group', 'ungroup', 'addto', 'front', 'back', 'tree', 'show', 'help', 'undo', 'redo']) {
    assert.match(help, new RegExp(`(?:^|\\n)${command}(?:\\s|$)`));
  }
});

test('CLI creates all six built-in types, parent relations, IDs, floats, text and default styles', async () => {
  const fixture = new EditorFixture();
  assert.deepEqual(await fixture.editor.execute('init'), ['canvas 800x600 created']);
  await fixture.run(
    'create g scene',
    'create rect r -1.5 2.25 3.5 4 #eeeeee in scene',
    'create circle c 20 30 5 red in scene',
    'create ellipse e 40 50 6 7 in scene',
    'create line l 1 2 3 4 black in scene',
    'create text t 10 20 "中文 text with spaces" in scene',
  );
  const document = fixture.editor.requireDocument();
  assert.equal(document.elementCount, 6);
  assert.deepEqual(fixture.order(), ['scene']);
  assert.deepEqual(fixture.order('scene'), ['r', 'c', 'e', 'l', 't']);
  assert.equal(fixture.attribute('r', 'x'), '-1.5');
  assert.equal(fixture.attribute('e', 'fill'), undefined);
  assert.equal(fixture.attribute('t', 'stroke'), undefined);
  assert.equal(document.find('t').textContent, '中文 text with spaces');
  const show = (await fixture.editor.execute('show c')).join('\n');
  assert.match(show, /circle#c  parent=g#scene/);
  assert.match(show, /cx=20 cy=30 r=5/);
  assert.match(show, /fill=red/);
  const subtree = (await fixture.editor.execute('tree scene')).join('\n');
  assert.match(subtree, /^g#scene\n/);
  assert.match(subtree, /rect#r.*x=-1\.5 y=2\.25 w=3\.5 h=4/);
  assert.match(subtree, /text#t.*中文 text with spaces/);
});

test('container move/scale edit every descendant and set retains the documented whitelist', async () => {
  const fixture = new EditorFixture();
  await fixture.run('init 800 600', 'create g root', 'create g nested in root',
    'create rect r 1 2 3 4 in nested', 'create circle c 10 20 5 in root',
    'create ellipse e 4 6 2 3 in root', 'create line l 1 2 3 4 in root',
    'create text t 5 6 "hello" in nested');
  const before = fixture.snapshot();
  await fixture.run('move root 2 3', 'scale root 2');
  assert.equal(fixture.attribute('r', 'x'), '6');
  assert.equal(fixture.attribute('r', 'y'), '10');
  assert.equal(fixture.attribute('r', 'width'), '6');
  assert.equal(fixture.attribute('r', 'height'), '8');
  assert.equal(fixture.attribute('c', 'cx'), '24');
  assert.equal(fixture.attribute('c', 'cy'), '46');
  assert.equal(fixture.attribute('c', 'r'), '10');
  assert.equal(fixture.attribute('e', 'rx'), '4');
  assert.equal(fixture.attribute('e', 'ry'), '6');
  assert.equal(fixture.attribute('l', 'x1'), '6');
  assert.equal(fixture.attribute('l', 'y2'), '14');
  assert.equal(fixture.attribute('t', 'x'), '14');
  assert.equal(fixture.attribute('t', 'y'), '18');
  await fixture.run('undo', 'undo');
  assert.equal(fixture.snapshot(), before);
  await fixture.run('set root fill blue', 'set r stroke red', 'set r stroke-width 2.5',
    'set r width 8', 'set t text "hello v2"');
  assert.equal(fixture.attribute('root', 'fill'), 'blue');
  assert.equal(fixture.attribute('r', 'fill'), undefined);
  assert.equal(fixture.attribute('r', 'stroke-width'), '2.5');
  assert.equal(fixture.attribute('r', 'width'), '8');
  assert.equal(fixture.editor.requireDocument().find('t').textContent, 'hello v2');
  for (const command of ['set r id new', 'set r label title', 'set root x 10', 'set r text nope']) {
    const stable = fixture.snapshot();
    await assert.rejects(fixture.editor.execute(command), /unknown attribute:/);
    assert.equal(fixture.snapshot(), stable);
  }
});

test('display commands and ignored lines do not enter history or clear pending redo', async () => {
  const fixture = new EditorFixture();
  await fixture.run('init', 'create rect r 0 0 10 20', 'move r 5 6', 'undo');
  const baseline = fixture.snapshot();
  for (const command of ['canvas', 'tree', 'tree r', 'show r', 'help', '', '# ignored']) {
    await fixture.editor.execute(command);
    assert.equal(fixture.snapshot(), baseline);
  }
  await fixture.run('redo');
  assert.equal(fixture.attribute('r', 'x'), '5');
  assert.equal(fixture.attribute('r', 'y'), '6');
  await fixture.run('undo', 'undo');
  assert.equal(fixture.editor.requireDocument().elementCount, 0);
});

test('new successful editing after undo clears redo, but a failed edit preserves it', async () => {
  const fixture = new EditorFixture();
  await fixture.run('init', 'create rect r 0 0 10 20', 'move r 5 6', 'undo');
  const baseline = fixture.snapshot();
  await assert.rejects(fixture.editor.execute('create rect r 1 2 3 4'), { message: 'id already exists: r' });
  assert.equal(fixture.snapshot(), baseline);
  await fixture.run('redo');
  assert.equal(fixture.attribute('r', 'x'), '5');
  await fixture.run('undo', 'set r fill red');
  await assert.rejects(fixture.editor.execute('redo'), { message: 'nothing to redo' });
  await fixture.run('undo');
  assert.equal(fixture.snapshot(), baseline);
});

test('failed commands preserve document and both history stacks, including failed IO', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-editor-failure-'));
  try {
    const fixture = new EditorFixture();
    const malformedPath = join(directory, 'malformed.svg');
    await writeFile(malformedPath, '<svg width="100" height="100"><g>', 'utf8');
    await fixture.run('init', 'create g parent', 'create rect r 0 0 10 20 in parent', 'move r 5 6', 'undo');
    const baseline = fixture.snapshot();
    const failures: Array<[string, RegExp]> = [
      ['create hexagon h', /unknown shape type: hexagon/],
      ['create box b 0 0 10 20 "phase2"', /unknown shape type: box/],
      ['create g parent', /id already exists: parent/],
      ['create g new in missing', /no such container: missing/],
      ['create g new in r', /not a container: r/],
      ['delete missing', /no such shape: missing/],
      ['move r nope 0', /invalid number/],
      ['scale parent 0', /scale factor must be positive/],
      ['scale r -1', /scale factor must be positive/],
      ['set r width -1', /must be non-negative/],
      ['group cycle r parent', /cannot group a container into its own descendant: parent/],
      ['addto parent parent', /cannot group a container into its own descendant: parent/],
      ['ungroup parent', /cannot ungroup top-level container: parent/],
      ['canvas -1 20', /canvas dimensions/],
      ['init invalid 20', /invalid number/],
      [`read "${malformedPath}"`, /invalid SVG/],
      [`read "${join(directory, 'missing.svg')}"`, /cannot read file:/],
      [`save "${directory}"`, /cannot write file:/],
      ['create text broken 0 0 "unterminated', /unterminated double quote/],
      ['unknown-command', /unknown command/],
    ];
    for (const [command, error] of failures) {
      await assert.rejects(fixture.editor.execute(command), error, command);
      assert.equal(fixture.snapshot(), baseline, command);
      await fixture.run('redo');
      assert.equal(fixture.attribute('r', 'x'), '5', command);
      await fixture.run('undo');
      assert.equal(fixture.snapshot(), baseline, command);
    }
    await fixture.run('undo');
    assert.throws(() => fixture.editor.requireDocument().find('r'), /no such shape: r/);
    assert.deepEqual(fixture.order(), ['parent']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('successful init, read, save and canvas resize impose an undo/redo barrier until next edit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-editor-barriers-'));
  try {
    const fixture = new EditorFixture();
    const path = join(directory, 'canvas.svg');
    await writeFile(path, '<svg width="100" height="200"><g id="from-file"/></svg>', 'utf8');
    await fixture.run('init');
    for (const barrier of ['init 640 480', `read "${path}"`, `save "${path}"`, 'canvas 300 400']) {
      await fixture.run('create rect before 1 2 3 4', 'move before 5 6', 'undo');
      await fixture.run(barrier);
      const baseline = fixture.snapshot();
      for (const action of ['undo', 'redo']) {
        await assert.rejects(fixture.editor.execute(action), { message: 'undo not allowed after io command' });
        assert.equal(fixture.snapshot(), baseline);
      }
      await fixture.run('create g after', 'undo');
      assert.equal(fixture.snapshot(), baseline);
      await fixture.run('redo', 'delete after');
      if (fixture.order().includes('before')) await fixture.run('delete before');
    }
    assert.equal(fixture.editor.requireDocument().width, 300);
    assert.equal(fixture.editor.requireDocument().height, 400);
    await fixture.run('save');
    assert.match(await readFile(path, 'utf8'), /width="300" height="400"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('group preserves document order across parents and restores each original location in one undo', async () => {
  const fixture = new EditorFixture();
  await fixture.run('init', 'create g left', 'create rect a 0 0 1 1 in left',
    'create circle b 2 3 1 in left', 'create g right', 'create text c 0 0 "C" in right',
    'create ellipse d 0 0 1 2 in right', 'create g untouched');
  const before = fixture.snapshot();
  await fixture.run('group gathered d b');
  assert.deepEqual(fixture.order('gathered'), ['b', 'd']);
  assert.deepEqual(fixture.order('left'), ['a']);
  assert.deepEqual(fixture.order('right'), ['c']);
  assert.equal(fixture.editor.requireDocument().find('gathered').parent, null);
  const grouped = fixture.snapshot();
  await fixture.run('undo');
  assert.equal(fixture.snapshot(), before);
  await fixture.run('redo');
  assert.equal(fixture.snapshot(), grouped);
  await assert.rejects(fixture.editor.execute('group illegal left a'), {
    message: 'cannot group a container into its own descendant: left',
  });
  assert.equal(fixture.snapshot(), grouped);
});

test('ungroup occupies the original nested slot; addto and z-order retain exact multi-step history', async () => {
  const fixture = new EditorFixture();
  await fixture.run('init', 'create g parent', 'create rect a 0 0 1 1 in parent',
    'create circle b 0 0 1 in parent', 'create text c 0 0 "C" in parent',
    'create ellipse d 0 0 1 2 in parent', 'create g target');
  const states = [fixture.snapshot()];
  const commands = ['group pair c b', 'ungroup pair', 'front a', 'back d', 'addto target b', 'delete target'];
  const expectedOrders = [
    ['a', 'pair', 'd'], ['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a'],
    ['d', 'b', 'c', 'a'], ['d', 'c', 'a'], ['d', 'c', 'a'],
  ];
  for (const [index, command] of commands.entries()) {
    await fixture.run(command);
    assert.deepEqual(fixture.order('parent'), expectedOrders[index]);
    states.push(fixture.snapshot());
  }
  assert.throws(() => fixture.editor.requireDocument().find('b'), /no such shape: b/);
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    await fixture.run('undo');
    assert.equal(fixture.snapshot(), states[index]);
  }
  for (let index = 1; index < states.length; index += 1) {
    await fixture.run('redo');
    assert.equal(fixture.snapshot(), states[index]);
  }
});

test('deleting a container removes all descendants, and undo restores IDs, styles and original order', async () => {
  const fixture = new EditorFixture();
  await fixture.run('init', 'create g first', 'create g scene', 'create g nested in scene',
    'create rect r 1 2 3 4 red in nested', 'create text t 5 6 "内容" in scene', 'create g last');
  const before = fixture.snapshot();
  await fixture.run('delete scene');
  assert.deepEqual(fixture.order(), ['first', 'last']);
  for (const id of ['scene', 'nested', 'r', 't']) {
    assert.throws(() => fixture.editor.requireDocument().find(id), new RegExp(`no such shape: ${id}`));
  }
  await fixture.run('undo');
  assert.equal(fixture.snapshot(), before);
  await fixture.run('redo', 'create circle r 0 0 10');
  assert.equal(fixture.editor.requireDocument().find('r').type, 'circle');
});

test('attachment section 6 transcript runs against actual XML files and expected imported warnings', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-editor-transcript-'));
  try {
    const fixture = new EditorFixture();
    const savedPath = join(directory, 'demo.svg');
    const otherPath = join(directory, 'other.svg');
    await writeFile(otherPath, await readFile(new URL('../../examples/other.svg', import.meta.url), 'utf8'));
    await fixture.run('init 800 600', 'create rect bg 0 0 800 600 #ffffff',
      'create text title 20 40 "My Diagram"', 'create circle c1 100 100 20 red',
      'create rect box 200 80 60 60 #3366ff', 'group markers c1 box');
    assert.deepEqual(fixture.order(), ['bg', 'title', 'markers']);
    assert.deepEqual(fixture.order('markers'), ['c1', 'box']);
    await fixture.run('move c1 30 0');
    assert.equal(fixture.attribute('c1', 'cx'), '130');
    await fixture.run('undo');
    assert.equal(fixture.attribute('c1', 'cx'), '100');
    await fixture.run('redo', 'set title text "My Diagram v2"', 'undo');
    assert.equal(fixture.editor.requireDocument().find('title').textContent, 'My Diagram');
    const stable = fixture.snapshot();
    await assert.rejects(fixture.editor.execute('group bad c1 markers'), {
      message: 'cannot group a container into its own descendant: markers',
    });
    assert.equal(fixture.snapshot(), stable);
    await fixture.run('delete box');
    assert.equal(fixture.editor.requireDocument().elementCount, 4);
    assert.deepEqual(await fixture.editor.execute('undo'), ['rect#box restored into g#markers']);
    assert.deepEqual(await fixture.editor.execute(`save "${savedPath}"`), [`saved to ${savedPath} (5 elements)`]);
    await assert.rejects(fixture.editor.execute('undo'), { message: 'undo not allowed after io command' });
    assert.match(await readFile(savedPath, 'utf8'), /<g id="markers">/);
    assert.deepEqual(await fixture.editor.execute(`read "${otherPath}"`), [
      'warning: assigned id rect1 to unnamed <rect>', `read ${otherPath} (7 elements)`,
    ]);
    assert.deepEqual(fixture.order(), ['rect1', 't1', 'c1', 'g1', 'e1']);
    assert.deepEqual(fixture.order('g1'), ['r2', 'c2']);
    assert.equal(fixture.editor.requireDocument().width, 400);
    assert.equal(fixture.editor.requireDocument().height, 300);
    const tree = (await fixture.editor.execute('tree')).join('\n');
    assert.match(tree, /^svg \(400x300\)/);
    assert.match(tree, /rect#rect1.*w=400 h=300 fill=#ffffff/);
    assert.match(tree, /ellipse#e1.*cx=1 cy=2 rx=3 ry=4/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('attachment section 6.1 version A creates, moves, undoes and saves the eight-element flowchart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-editor-flowchart-'));
  try {
    const fixture = new EditorFixture();
    const path = join(directory, 'flowchart.svg');
    await fixture.run('init 800 600', 'create g flowchart', 'create g node1 in flowchart',
      'create rect start 120 100 160 60 #4a90d9 in node1',
      'create text start-label 155 135 "开始" in node1', 'create g node2 in flowchart',
      'create rect process 520 100 160 60 #f5a623 in node2',
      'create text process-label 545 135 "处理数据" in node2',
      'create line arrow1 280 130 520 130 black in flowchart');
    assert.deepEqual(fixture.order('flowchart'), ['node1', 'node2', 'arrow1']);
    assert.deepEqual(fixture.order('node1'), ['start', 'start-label']);
    assert.deepEqual(fixture.order('node2'), ['process', 'process-label']);
    const before = fixture.snapshot();
    await fixture.run('move node2 0 100');
    assert.equal(fixture.attribute('process', 'y'), '200');
    assert.equal(fixture.attribute('process-label', 'y'), '235');
    assert.equal(fixture.attribute('start', 'y'), '100');
    assert.equal(fixture.attribute('arrow1', 'y1'), '130');
    await fixture.run('undo');
    assert.equal(fixture.snapshot(), before);
    await fixture.run('set process-label text "处理数据 v2"');
    const edited = fixture.snapshot();
    assert.deepEqual(await fixture.editor.execute(`save "${path}"`), [`saved to ${path} (8 elements)`]);
    const xml = await readFile(path, 'utf8');
    assert.match(xml, />开始<\/text>/);
    assert.match(xml, />处理数据 v2<\/text>/);
    await fixture.run(`read "${path}"`);
    assert.equal(fixture.snapshot(), edited);
    assert.equal(fixture.editor.requireDocument().elementCount, 8);
    await assert.rejects(fixture.editor.execute('redo'), { message: 'undo not allowed after io command' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI zero-sized canvas can be saved and read back without loss', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-editor-zero-'));
  try {
    const fixture = new EditorFixture();
    const path = join(directory, 'zero.svg');
    await fixture.run('init 0 0', `save "${path}"`, `read "${path}"`);
    assert.equal(fixture.editor.requireDocument().width, 0);
    assert.equal(fixture.editor.requireDocument().height, 0);
    await fixture.run('canvas 0 100', 'save', `read "${path}"`);
    assert.equal(fixture.editor.requireDocument().width, 0);
    assert.equal(fixture.editor.requireDocument().height, 100);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

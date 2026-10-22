import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from '../src/application/Editor.js';
import type { SvgRepository } from '../src/application/ports/SvgRepository.js';
import type { Shape } from '../src/domain/Shape.js';
import type { SvgDocument } from '../src/domain/SvgDocument.js';
import { SvgWriter } from '../src/infrastructure/svg/SvgWriter.js';
import { Tokenizer } from '../src/presentation/Tokenizer.js';
import { TreeFormatter } from '../src/presentation/TreeFormatter.js';
import { ShowFormatter } from '../src/presentation/ShowFormatter.js';

/** A deterministic, filesystem-free fixture exercising the actual command path. */
class SeededHistoryFixture {
  readonly editor: Editor;
  readonly states: string[] = [];
  readonly commands: string[] = [];
  #seed: number;

  constructor(seed: number) {
    this.#seed = seed >>> 0;
    const files = new Map<string, SvgDocument>();
    const repository: SvgRepository = {
      async read(path) {
        const document = files.get(path);
        if (!document) throw new Error(`cannot read file: ${path}`);
        return { document: document.clone(), warnings: [] };
      },
      async write(path, document) { files.set(path, document.clone()); },
    };
    this.editor = new Editor(repository, new Tokenizer(), new TreeFormatter(), new ShowFormatter());
  }

  snapshot(): string { return new SvgWriter().write(this.editor.requireDocument()); }

  async init(): Promise<void> {
    await this.editor.execute('init 800 600');
    this.states.push(this.snapshot());
  }

  async edit(command: string): Promise<void> {
    await this.editor.execute(command);
    this.commands.push(command);
    this.states.push(this.snapshot());
    this.assertTreeInvariants();
  }

  nodes(): Shape[] {
    const nodes: Shape[] = [];
    const stack = [...this.editor.requireDocument().roots].reverse();
    while (stack.length) {
      const node = stack.pop()!;
      nodes.push(node);
      stack.push(...[...node.children].reverse());
    }
    return nodes;
  }

  generatedCommand(step: number): string {
    const nodes = this.nodes();
    const containers = nodes.filter(node => node.type === 'g');
    const geometric = nodes.filter(node => node.type !== 'g');
    const target = this.pick(nodes);
    const commands: Array<() => string> = [
      () => `move ${target.id} ${this.integer(21) - 10} ${this.integer(21) - 10}`,
      () => `scale ${target.id} ${this.pick([0.5, 1.25, 2])}`,
      () => `set ${target.id} fill ${this.pick(['#4a90d9', '#f5a623', 'none', 'red'])}`,
      () => `set ${target.id} stroke-width ${this.integer(8) / 2}`,
      () => {
        const shape = this.pick(geometric);
        const numericKeys = Object.keys(shape.attributes).filter(key =>
          key !== 'stroke-width' && Number.isFinite(Number(shape.attributes[key])));
        return `set ${shape.id} ${this.pick(numericKeys)} ${this.integer(50) / 2}`;
      },
      () => `set t text ${JSON.stringify(`step ${step} 中文 <&> "quoted" \\ path`)}`,
      () => `front ${target.id}`,
      () => `back ${target.id}`,
      () => {
        const container = this.pick(containers);
        const ancestors = new Set<Shape>();
        for (let node: Shape | null = container; node; node = node.parent) ancestors.add(node);
        const shape = this.pick(nodes.filter(node => !ancestors.has(node)));
        return `addto ${container.id} ${shape.id}`;
      },
      () => {
        const first = this.pick(geometric);
        const second = this.pick(geometric.filter(shape => shape !== first));
        return `group generated-${step} ${second.id} ${first.id}`;
      },
      () => {
        const nested = containers.filter(container => container.parent !== null);
        return nested.length
          ? `ungroup ${this.pick(nested).id}`
          : `create g generated-${step} in world`;
      },
    ];
    return commands[step % commands.length]!();
  }

  assertTreeInvariants(): void {
    const document = this.editor.requireDocument();
    const nodes = this.nodes();
    assert.equal(new Set(nodes.map(node => node.id)).size, nodes.length, 'every ID is globally unique');
    assert.equal(document.elementCount, nodes.length);
    for (const root of document.roots) assert.equal(root.parent, null);
    for (const node of nodes) {
      for (const child of node.children) assert.equal(child.parent, node);
      assert.equal(document.find(node.id), node);
    }
  }

  private integer(limit: number): number {
    this.#seed = (Math.imul(this.#seed, 1664525) + 1013904223) >>> 0;
    return this.#seed % limit;
  }

  private pick<T>(values: readonly T[]): T {
    assert.ok(values.length > 0, 'the deterministic generator must have a valid candidate');
    return values[this.integer(values.length)]!;
  }
}

for (const seed of [0x13579bdf, 0xc0ffee]) {
  test(`seed ${seed}: mixed edits undo to init and redo to byte-identical SVG at every step`, async () => {
    const fixture = new SeededHistoryFixture(seed);
    await fixture.init();
    for (const command of [
      'create g world', 'create g left in world', 'create g right in world',
      'create rect r 10 20 30 40 red in left',
      'create circle c 50 60 8 in left',
      'create ellipse e 70 80 9 10 in right',
      'create line l 10 20 50 60 black in right',
      'create text t 15 25 "initial 中文 <&>" in left',
    ]) await fixture.edit(command);
    for (let step = 0; step < 121; step += 1) {
      await fixture.edit(fixture.generatedCommand(step));
      if (step % 9 === 0) {
        const stable = fixture.snapshot();
        await fixture.editor.execute('tree');
        await fixture.editor.execute('show t');
        await fixture.editor.execute('canvas');
        await fixture.editor.execute('# generated replay checkpoint');
        assert.equal(fixture.snapshot(), stable, 'display commands do not edit the document');
      }
    }
    const final = fixture.snapshot();
    for (let index = fixture.commands.length - 1; index >= 0; index -= 1) {
      await fixture.editor.execute('undo');
      assert.equal(fixture.snapshot(), fixture.states[index], `undo: ${fixture.commands[index]}`);
      fixture.assertTreeInvariants();
    }
    assert.equal(fixture.editor.requireDocument().elementCount, 0);
    await assert.rejects(fixture.editor.execute('undo'), { message: 'nothing to undo' });
    for (let index = 0; index < fixture.commands.length; index += 1) {
      await fixture.editor.execute('redo');
      assert.equal(fixture.snapshot(), fixture.states[index + 1], `redo: ${fixture.commands[index]}`);
      fixture.assertTreeInvariants();
    }
    assert.equal(fixture.snapshot(), final);
    await assert.rejects(fixture.editor.execute('redo'), { message: 'nothing to redo' });
  });
}

test('overflow and unknown attributes preserve a pending redo and the preceding undo stack', async () => {
  const fixture = new SeededHistoryFixture(42);
  await fixture.init();
  for (const command of [
    'create g world', 'create rect normal 1 2 3 4 in world',
    'create circle huge 1e308 2 3 in world', 'move normal 5 6',
  ]) await fixture.edit(command);
  const moved = fixture.snapshot();
  await fixture.editor.execute('undo');
  const stable = fixture.snapshot();
  for (const command of ['scale world 2', 'set normal transform nope']) {
    await assert.rejects(fixture.editor.execute(command), /finite number|unknown attribute/u);
    assert.equal(fixture.snapshot(), stable, command);
    await fixture.editor.execute('redo');
    assert.equal(fixture.snapshot(), moved, `redo survives ${command}`);
    await fixture.editor.execute('undo');
    assert.equal(fixture.snapshot(), stable, `undo survives ${command}`);
  }
  await fixture.editor.execute('undo');
  assert.throws(() => fixture.editor.requireDocument().find('huge'), /no such shape: huge/u);
  assert.equal(fixture.editor.requireDocument().find('normal').attributes.x, '1');
  await fixture.editor.execute('redo');
  assert.equal(fixture.snapshot(), stable);
  await fixture.editor.execute('redo');
  assert.equal(fixture.snapshot(), moved);
});

test('deleted subtree IDs can be reused and undo/redo restores mutually exclusive identities', async () => {
  const fixture = new SeededHistoryFixture(7);
  await fixture.init();
  for (const command of [
    'create g before', 'create g scene', 'create g nested in scene',
    'create rect reusable 1 2 3 4 red in nested', 'create text caption 5 6 "original" in scene',
    'create g after',
  ]) await fixture.edit(command);
  const original = fixture.snapshot();
  await fixture.edit('delete scene');
  const deleted = fixture.snapshot();
  await fixture.edit('create circle reusable 20 30 5 blue');
  const reused = fixture.snapshot();
  assert.equal(fixture.editor.requireDocument().find('reusable').type, 'circle');
  await fixture.editor.execute('undo');
  assert.equal(fixture.snapshot(), deleted);
  assert.throws(() => fixture.editor.requireDocument().find('reusable'), /no such shape/u);
  await fixture.editor.execute('undo');
  assert.equal(fixture.snapshot(), original);
  assert.equal(fixture.editor.requireDocument().find('reusable').type, 'rect');
  fixture.assertTreeInvariants();
  await assert.rejects(fixture.editor.execute('create g reusable'), { message: 'id already exists: reusable' });
  assert.equal(fixture.snapshot(), original);
  await fixture.editor.execute('redo');
  assert.equal(fixture.snapshot(), deleted);
  await fixture.editor.execute('redo');
  assert.equal(fixture.snapshot(), reused);
  fixture.assertTreeInvariants();
});

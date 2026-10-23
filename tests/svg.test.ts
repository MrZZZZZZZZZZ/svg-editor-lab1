import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileSvgRepository } from '../src/infrastructure/FileSvgRepository.js';
import { SvgReader } from '../src/infrastructure/svg/SvgReader.js';
import { SvgWriter } from '../src/infrastructure/svg/SvgWriter.js';

class SvgFixture {
  static wrap(content: string, attributes = ''): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" ${attributes}>${content}</svg>`;
  }
}

test('SVG reads all six types, group hierarchy, omitted styles, and counts group IDs', () => {
  const result = new SvgReader().read(SvgFixture.wrap(`
    <!-- comment ignored -->
    <g id="scene" transform="translate(10,20)">
      <rect id="rect" x="1" y="2" width="3" height="4"/>
      <circle id="circle" cx="10" cy="20" r="5" fill="red"/>
      <ellipse id="ellipse" cx="1" cy="2" rx="3" ry="4"/>
      <line id="line" x1="1" y1="2" x2="3" y2="4" stroke="black"/>
      <text id="text" x="0" y="0" font-size="16" text-anchor="middle">开始</text>
    </g>`));
  assert.equal(result.document.elementCount, 6);
  assert.equal(result.document.find('rect').parent?.id, 'scene');
  assert.equal(result.document.find('scene').attributes.transform, 'translate(10,20)');
  assert.equal(result.document.find('text').attributes['font-size'], '16');
  assert.deepEqual(result.warnings, []);
  const xml = new SvgWriter().write(result.document);
  assert.match(xml, /<rect id="rect" x="1" y="2" width="3" height="4"\/>/);
  assert.equal(new SvgReader().read(xml).document.elementCount, 6);
});

test('missing IDs reserve every explicit ID before assignment, including later descendants', () => {
  const result = new SvgReader().read(SvgFixture.wrap(`
    <rect x="0" y="0" width="1" height="1"/>
    <g><rect id="rect1" x="2" y="3" width="4" height="5"/></g>
    <g id="g1"/><rect x="0" y="0" width="1" height="1"/>`));
  assert.deepEqual(result.warnings, [
    'warning: assigned id rect2 to unnamed <rect>',
    'warning: assigned id g2 to unnamed <g>',
    'warning: assigned id rect3 to unnamed <rect>',
  ]);
  assert.equal(result.document.find('rect1').parent?.id, 'g2');
  assert.equal(result.document.find('rect2').parent, null);
});

test('SVG preserves Chinese, XML entities, whitespace, and presentation attributes on round-trip', () => {
  const reader = new SvgReader();
  const first = reader.read(SvgFixture.wrap(`
    <text id="t" x="10" y="20" fill="red" transform="translate(1,2) scale(0.8)" font-size="16" text-anchor="middle">中文 &amp; &lt; &gt; &quot; &apos;&#10;&#9;第二行</text>`)).document;
  const second = reader.read(new SvgWriter().write(first)).document;
  assert.equal(second.find('t').textContent, '中文 & < > " \'\n\t第二行');
  assert.deepEqual(second.find('t').attributes, first.find('t').attributes);
  second.find('t').move(5, 6);
  const moved = reader.read(new SvgWriter().write(second)).document;
  assert.deepEqual(moved.find('t').attributes, second.find('t').attributes);
  assert.equal(second.find('t').attributes.x, '15');
});

test('SVG rejects duplicate IDs before automatic assignment and unknown types', () => {
  const reader = new SvgReader();
  assert.throws(() => reader.read(SvgFixture.wrap('<g id="same"><g id="same"/></g>')), /id already exists: same/);
  assert.throws(() => reader.read(SvgFixture.wrap('<path id="p" d="M0 0"/>')), /unknown shape type: path \(is the plugin loaded\?\)/);
  assert.throws(() => reader.read(SvgFixture.wrap('<rect id="r" x="0" y="0" width="1" height="1"><g id="g"/></rect>')), /not a container: r/);
});

test('SVG rejects malformed XML, declarations, invalid dimensions, and lossy root settings', () => {
  const reader = new SvgReader();
  for (const xml of [
    SvgFixture.wrap('<g id="bad">'),
    SvgFixture.wrap('<g id=bad/>'),
    SvgFixture.wrap('<g id="a" id="b"/>'),
    SvgFixture.wrap('<text id="t" x="0" y="0">&missing;</text>'),
    SvgFixture.wrap('<g id="a"/>') + '<g/>',
    SvgFixture.wrap('<g id="a"/>') + 'trailing',
    SvgFixture.wrap('<g id="a"/>') + '\u0000',
    '<!DOCTYPE svg [<!ENTITY content "unsafe">]>' + SvgFixture.wrap(''),
    '<svg width="-1" height="300"/>',
    '<svg width="400" height="300" viewBox="10 10 400 300"/>',
    SvgFixture.wrap('', 'style="fill:red"'),
    SvgFixture.wrap('unexpected text'),
    '<html/>',
  ]) {
    assert.throws(() => reader.read(xml), /invalid SVG/);
  }
});

test('comments and CDATA are accepted without treating their content as declarations', () => {
  const document = new SvgReader().read(SvgFixture.wrap(`
    <!-- <!DOCTYPE example> -->
    <text id="t" x="0" y="0"><![CDATA[<!DOCTYPE text> & 中文]]></text>`)).document;
  assert.equal(document.find('t').textContent, '<!DOCTYPE text> & 中文');
});

test('zero-sized SVG canvases round-trip consistently with the document model', () => {
  const reader = new SvgReader();
  const first = reader.read('<svg width="0" height="0"/>').document;
  const second = reader.read(new SvgWriter().write(first)).document;
  assert.equal(second.width, 0);
  assert.equal(second.height, 0);
});

test('file repository saves and reads atomically without leaving temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-lab-test-'));
  try {
    const repository = new FileSvgRepository();
    const path = join(directory, 'diagram.svg');
    const document = new SvgReader().read(SvgFixture.wrap('<g id="g"/>')).document;
    await writeFile(path, 'old content', 'utf8');
    await repository.write(path, document);
    assert.equal((await repository.read(path)).document.elementCount, 1);
    assert.match(await readFile(path, 'utf8'), /<g id="g"\/>/);
    assert.deepEqual(await readdir(directory), ['diagram.svg']);
    const missingPath = join(directory, 'missing', 'diagram.svg');
    await assert.rejects(repository.read(missingPath), { message: `cannot read file: ${missingPath}` });
    await assert.rejects(repository.write(missingPath, document), { message: `cannot write file: ${missingPath}` });
    assert.match(await readFile(path, 'utf8'), /<g id="g"\/>/);
    assert.deepEqual(await readdir(directory), ['diagram.svg']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

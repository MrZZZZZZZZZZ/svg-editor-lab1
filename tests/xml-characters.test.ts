import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Editor } from '../src/application/Editor.js';
import type { SvgDocument } from '../src/domain/SvgDocument.js';
import { Text } from '../src/domain/Text.js';
import { XmlCharacters } from '../src/domain/XmlCharacters.js';
import { FileSvgRepository } from '../src/infrastructure/FileSvgRepository.js';
import { SvgReader } from '../src/infrastructure/svg/SvgReader.js';
import { SvgWriter } from '../src/infrastructure/svg/SvgWriter.js';
import { ShowFormatter } from '../src/presentation/ShowFormatter.js';
import { Tokenizer } from '../src/presentation/Tokenizer.js';
import { TreeFormatter } from '../src/presentation/TreeFormatter.js';

class XmlFixture {
  static editor(): Editor {
    return new Editor(new FileSvgRepository(), new Tokenizer(), new TreeFormatter(), new ShowFormatter());
  }

  static svg(content: string, attributes = ''): string {
    return `<svg width="100" height="100" ${attributes}>${content}</svg>`;
  }

  static snapshot(editor: Editor): string { return new SvgWriter().write(editor.requireDocument()); }
}

test('XML Char validation admits exact XML 1.0 ranges, whitespace, Chinese and supplementary characters', () => {
  for (const codePoint of [0x9, 0xA, 0xD, 0x20, 0xD7FF, 0xE000, 0xFFFD, 0x10000, 0x1F600, 0x10FFFF]) {
    assert.doesNotThrow(() => XmlCharacters.assertValid(String.fromCodePoint(codePoint)));
  }
  assert.doesNotThrow(() => XmlCharacters.assertValid('中文\t\n\r😀🚀'));
  assert.doesNotThrow(() => XmlCharacters.assertValid(''));
  for (const codePoint of [0, 1, 8, 0xB, 0xC, 0xE, 0x1F, 0xD800, 0xDBFF, 0xDC00, 0xDFFF, 0xFFFE, 0xFFFF]) {
    assert.throws(() => XmlCharacters.assertValid(String.fromCodePoint(codePoint)), { message: 'invalid XML character' });
  }
});

test('Text rejects invalid construction and text edits before mutation; unknown attributes retain their own error', () => {
  assert.throws(() => new Text('t', {}, 'a\0b'), { message: 'invalid XML character' });
  const shape = new Text('t', {}, 'original 😀');
  assert.throws(() => shape.set('text', '\uD800'), { message: 'invalid XML character' });
  assert.equal(shape.textContent, 'original 😀');
  assert.throws(() => shape.set('unknown', '\0'), { message: 'unknown attribute: unknown' });
  assert.equal(shape.textContent, 'original 😀');
});

test('SVG rejects invalid numeric references before xmldom can truncate them or decode forbidden characters', () => {
  const reader = new SvgReader();
  const references = ['&#0;', '&#1;', '&#8;', '&#11;', '&#12;', '&#31;', '&#xD800;', '&#xDFFF;',
    '&#xFFFE;', '&#xFFFF;', '&#x110000;', '&#x210000;', '&#1114112;', '&#999999999999999999999999999999999999999999999999999999999999;'];
  for (const reference of references) {
    for (const xml of [
      XmlFixture.svg(`<text id="t" x="0" y="0">${reference}</text>`),
      XmlFixture.svg(`<g id="g" fill="${reference}"/>`),
      XmlFixture.svg(`<g id="${reference}"/>`),
      XmlFixture.svg('', `version="${reference}"`),
      XmlFixture.svg(reference),
    ]) {
      assert.throws(() => reader.read(xml), /invalid XML character/, xml);
    }
  }
});

test('numeric references in comments, CDATA, processing instructions and escaped literal text are not decoded twice', () => {
  const reader = new SvgReader();
  const literal = '&#0; &#x110000;';
  const source = `<?review ${literal}?>` + XmlFixture.svg(`
    <!-- ${literal} -->
    <text id="t" x="0" y="0"><![CDATA[${literal}]]> &amp;#0; &amp;#x110000;</text>`);
  const document = reader.read(source).document;
  assert.equal(document.find('t').textContent, `${literal} ${literal}`);
  assert.equal(reader.read(new SvgWriter().write(document)).document.find('t').textContent, `${literal} ${literal}`);
});

test('valid numeric references including emoji and XML whitespace round-trip without changing their characters', () => {
  const reader = new SvgReader();
  const document = reader.read(XmlFixture.svg('<text id="t" x="0" y="0">&#9;&#10;&#13;&#x20;&#xD7FF;&#xE000;&#xFFFD;&#x1F600;&#x10FFFF;</text>')).document;
  const expected = '\t\n\r \uD7FF\uE000\uFFFD😀' + String.fromCodePoint(0x10FFFF);
  assert.equal(document.find('t').textContent, expected);
  assert.equal(reader.read(new SvgWriter().write(document)).document.find('t').textContent, expected);
});

test('writer defends the serialization boundary against invalid ID, attribute and text from an external model', () => {
  for (const field of ['id', 'attribute', 'text']) {
    // A future provider can violate the runtime contract even when TypeScript types compile.
    const document = {
      width: 100, height: 100,
      roots: [{
        type: 'text', id: field === 'id' ? 'bad\0id' : 't', children: [],
        attributes: { x: '0', y: '0', fill: field === 'attribute' ? 'red\0' : 'red' },
        textContent: field === 'text' ? 'bad\0text' : 'valid',
      }],
    } as unknown as SvgDocument;
    assert.throws(() => new SvgWriter().write(document), { message: 'invalid XML character' });
  }
});

test('invalid CLI text, style and ID edits preserve the document and pending redo', async () => {
  const editor = XmlFixture.editor();
  await editor.execute('init');
  await editor.execute('create rect r 0 0 10 20');
  await editor.execute('create text t 0 0 "original"');
  await editor.execute('move r 5 6');
  await editor.execute('undo');
  const before = XmlFixture.snapshot(editor);
  for (const command of [
    'create text invalid 0 0 "bad\0text"',
    'set t text "bad\uD800text"',
    'set r fill "red\0"',
    'set r stroke "bad\uFFFF"',
    'create rect bad-style 0 0 1 1 "red\u0001"',
    'create g bad\0id',
    'create g bad\uD800id',
  ]) {
    await assert.rejects(editor.execute(command), { message: 'invalid XML character' });
    assert.equal(XmlFixture.snapshot(editor), before);
    await editor.execute('redo');
    assert.equal(editor.requireDocument().find('r').attributes.x, '5');
    await editor.execute('undo');
    assert.equal(XmlFixture.snapshot(editor), before);
  }
});

test('failed reads with invalid references preserve document, current path and history; legal emoji survives file IO', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-xml-characters-'));
  try {
    const editor = XmlFixture.editor();
    const goodPath = join(directory, 'good.svg');
    const badPath = join(directory, 'bad.svg');
    await editor.execute('init');
    await editor.execute('create text t 1 2 "中文 😀 & < >"');
    await editor.execute(`save "${goodPath}"`);
    await editor.execute('move t 5 6');
    await editor.execute('undo');
    const before = XmlFixture.snapshot(editor);
    for (const xml of [
      XmlFixture.svg('<text id="t" x="0" y="0">&#x110000;</text>'),
      XmlFixture.svg('<g id="g" fill="&#0;"/>'),
      XmlFixture.svg('<g id="bad&#xD800;"/>'),
      XmlFixture.svg('', 'version="&#0;"'),
    ]) {
      await writeFile(badPath, xml, 'utf8');
      await assert.rejects(editor.execute(`read "${badPath}"`), /invalid XML character/);
      assert.equal(XmlFixture.snapshot(editor), before);
      await editor.execute('redo');
      assert.equal(editor.requireDocument().find('t').attributes.x, '6');
      await editor.execute('undo');
    }
    assert.deepEqual(await editor.execute('save'), [`saved to ${goodPath} (1 elements)`]);
    await editor.execute(`read "${goodPath}"`);
    assert.equal(XmlFixture.snapshot(editor), before);
    assert.equal(editor.requireDocument().find('t').textContent, '中文 😀 & < >');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

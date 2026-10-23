import assert from 'node:assert/strict';
import test from 'node:test';
import { Editor } from '../src/application/Editor.js';
import { FileSvgRepository } from '../src/infrastructure/FileSvgRepository.js';
import { ShowFormatter } from '../src/presentation/ShowFormatter.js';
import { Tokenizer } from '../src/presentation/Tokenizer.js';
import { TreeFormatter } from '../src/presentation/TreeFormatter.js';
import { SvgWriter } from '../src/infrastructure/svg/SvgWriter.js';

test('canvas accepts its optional width and keeps the current height, with the IO history barrier', async () => {
  const editor = new Editor(new FileSvgRepository(), new Tokenizer(), new TreeFormatter(), new ShowFormatter());
  await editor.execute('init 800 450');
  await editor.execute('create g scene');
  assert.deepEqual(await editor.execute('canvas 320'), ['canvas resized to 320x450']);
  assert.equal(editor.requireDocument().width, 320);
  assert.equal(editor.requireDocument().height, 450);
  await assert.rejects(editor.execute('undo'), { message: 'undo not allowed after io command' });
  await editor.execute('create g next');
  await editor.execute('undo');
  await assert.rejects(editor.execute('canvas 1 2 3'), /usage: canvas/);
  await editor.execute('redo');
  assert.equal(editor.requireDocument().find('next').id, 'next');
});

test('missing ordinary IDs and create-in targets use their distinct specified error messages', async () => {
  const editor = new Editor(new FileSvgRepository(), new Tokenizer(), new TreeFormatter(), new ShowFormatter());
  await editor.execute('init');
  await editor.execute('create g scene');
  await editor.execute('create rect r 0 0 10 10');
  await editor.execute('move r 1 0');
  await editor.execute('undo');
  const stable = new SvgWriter().write(editor.requireDocument());
  for (const command of ['ungroup missing', 'addto missing r', 'addto scene missing']) {
    await assert.rejects(editor.execute(command), { message: 'no such shape: missing' });
    assert.equal(new SvgWriter().write(editor.requireDocument()), stable);
  }
  await assert.rejects(editor.execute('create g child in missing'), { message: 'no such container: missing' });
  await assert.rejects(editor.execute('ungroup r'), { message: 'not a container: r' });
  await editor.execute('redo');
  assert.equal(editor.requireDocument().find('r').attributes.x, '1');
});

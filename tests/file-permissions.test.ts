import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Editor } from '../src/application/Editor.js';
import { Rect } from '../src/domain/Rect.js';
import { SvgDocument } from '../src/domain/SvgDocument.js';
import { FileSvgRepository } from '../src/infrastructure/FileSvgRepository.js';
import { SvgWriter } from '../src/infrastructure/svg/SvgWriter.js';
import { ShowFormatter } from '../src/presentation/ShowFormatter.js';
import { Tokenizer } from '../src/presentation/Tokenizer.js';
import { TreeFormatter } from '../src/presentation/TreeFormatter.js';

test('saving to a read-only file rejects without changing content, mode, or leaving temporary files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-readonly-'));
  try {
    const path = join(directory, 'readonly.svg');
    const original = '<svg width="200" height="100"><g id="original"/></svg>';
    await writeFile(path, original, 'utf8');
    await chmod(path, 0o444);
    const document = new SvgDocument(800, 600);
    await assert.rejects(new FileSvgRepository().write(path, document), {
      message: `cannot write file: ${path}`,
    });
    assert.equal(await readFile(path, 'utf8'), original);
    assert.equal((await stat(path)).mode & 0o7777, 0o444);
    assert.deepEqual(await readdir(directory), ['readonly.svg']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('atomic overwrite preserves an existing writable file mode', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-preserve-mode-'));
  try {
    const path = join(directory, 'diagram.svg');
    await writeFile(path, 'old content', 'utf8');
    await chmod(path, 0o640);
    const document = new SvgDocument(320, 200);
    document.append(new Rect('updated', { x: '1', y: '2', width: '3', height: '4' }));
    const repository = new FileSvgRepository();
    await repository.write(path, document);
    assert.equal((await stat(path)).mode & 0o7777, 0o640);
    assert.equal(await readFile(path, 'utf8'), new SvgWriter().write(document));
    assert.equal((await repository.read(path)).document.find('updated').type, 'rect');
    assert.deepEqual(await readdir(directory), ['diagram.svg']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('new files use normal creation permissions and missing parents report the required error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-new-file-mode-'));
  try {
    const repository = new FileSvgRepository();
    const document = new SvgDocument();
    const path = join(directory, 'new.svg');
    await repository.write(path, document);
    assert.equal((await stat(path)).mode & 0o777, 0o666 & ~process.umask());
    const original = await readFile(path, 'utf8');
    const missingPath = join(directory, 'missing', 'diagram.svg');
    await assert.rejects(repository.write(missingPath, document), {
      message: `cannot write file: ${missingPath}`,
    });
    const nonDirectoryPath = join(path, 'diagram.svg');
    await assert.rejects(repository.write(nonDirectoryPath, document), {
      message: `cannot write file: ${nonDirectoryPath}`,
    });
    assert.equal(await readFile(path, 'utf8'), original);
    assert.deepEqual(await readdir(directory), ['new.svg']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a failed real save preserves the document, default path, and both history stacks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'svg-save-state-'));
  try {
    const currentPath = join(directory, 'current.svg');
    const blockedPath = join(directory, 'blocked.svg');
    const blockedContents = '<svg width="100" height="100"><g id="keep"/></svg>';
    await writeFile(blockedPath, blockedContents, 'utf8');
    await chmod(blockedPath, 0o444);
    const editor = new Editor(new FileSvgRepository(), new Tokenizer(), new TreeFormatter(), new ShowFormatter());
    await editor.execute('init 320 200');
    await editor.execute('create rect r 0 0 10 20');
    await editor.execute(`save "${currentPath}"`);
    await editor.execute('move r 5 0');
    await editor.execute('move r 7 0');
    await editor.execute('undo');
    const snapshot = new SvgWriter().write(editor.requireDocument());

    await assert.rejects(editor.execute(`save "${blockedPath}"`), {
      message: `cannot write file: ${blockedPath}`,
    });
    assert.equal(new SvgWriter().write(editor.requireDocument()), snapshot);
    await editor.execute('redo');
    assert.equal(editor.requireDocument().find('r').attributes.x, '12');
    await editor.execute('undo');
    assert.equal(new SvgWriter().write(editor.requireDocument()), snapshot);
    await editor.execute('undo');
    assert.equal(editor.requireDocument().find('r').attributes.x, '0');
    await editor.execute('redo');
    assert.equal(new SvgWriter().write(editor.requireDocument()), snapshot);

    assert.deepEqual(await editor.execute('save'), [`saved to ${currentPath} (1 elements)`]);
    assert.equal(await readFile(currentPath, 'utf8'), snapshot);
    assert.equal(await readFile(blockedPath, 'utf8'), blockedContents);
    assert.equal((await stat(blockedPath)).mode & 0o7777, 0o444);
    assert.deepEqual((await readdir(directory)).sort(), ['blocked.svg', 'current.svg']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

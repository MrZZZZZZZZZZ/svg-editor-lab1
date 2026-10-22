import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { SvgReadResult, SvgRepository } from '../application/ports/SvgRepository.js';
import type { SvgDocument } from '../domain/SvgDocument.js';
import { SvgReader } from './svg/SvgReader.js';
import { SvgWriter } from './svg/SvgWriter.js';

export class FileSvgRepository implements SvgRepository {
  constructor(
    private readonly reader = new SvgReader(),
    private readonly writer = new SvgWriter(),
  ) {}

  async read(filePath: string): Promise<SvgReadResult> {
    let contents: string;
    try { contents = await readFile(filePath, 'utf8'); }
    catch { throw new Error(`cannot read file: ${filePath}`); }
    return this.reader.read(contents);
  }

  async write(filePath: string, document: SvgDocument): Promise<void> {
    const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, this.writer.write(document), { encoding: 'utf8', flag: 'wx' });
      await rename(temporaryPath, filePath);
    } catch {
      throw new Error(`cannot write file: ${filePath}`);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}

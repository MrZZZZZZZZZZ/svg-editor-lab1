import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
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
      const mode = await this.writableMode(filePath);
      await writeFile(temporaryPath, this.writer.write(document), {
        encoding: 'utf8', flag: 'wx', mode: mode ?? 0o666,
      });
      // Creation applies umask. Restore the existing target's exact permission bits
      // before replacing it, without ever changing the original file's permissions.
      if (mode !== undefined) await chmod(temporaryPath, mode);
      await rename(temporaryPath, filePath);
    } catch {
      throw new Error(`cannot write file: ${filePath}`);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  private async writableMode(filePath: string): Promise<number | undefined> {
    let target;
    try { target = await stat(filePath); }
    catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    }
    // Atomic rename only needs directory permission; explicitly honor the target's
    // read-only mode even when this process could bypass it (for example as root).
    if ((target.mode & 0o222) === 0) throw new Error('target file is read-only');
    await access(filePath, constants.W_OK);
    return target.mode & 0o7777;
  }
}

import type { SvgDocument } from '../../domain/SvgDocument.js';

export interface SvgReadResult {
  readonly document: SvgDocument;
  readonly warnings: string[];
}

/** The application depends on this port rather than filesystem or XML APIs. */
export interface SvgRepository {
  read(filePath: string): Promise<SvgReadResult>;
  write(filePath: string, document: SvgDocument): Promise<void>;
}

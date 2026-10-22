import type { SvgDocument } from '../../domain/SvgDocument.js';

export interface TreeView {
  format(document: SvgDocument, id?: string): string;
}

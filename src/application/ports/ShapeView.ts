import type { SvgDocument } from '../../domain/SvgDocument.js';

export interface ShapeView {
  format(document: SvgDocument, id: string): string;
}

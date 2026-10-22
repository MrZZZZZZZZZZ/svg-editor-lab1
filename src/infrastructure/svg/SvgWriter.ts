import type { Shape } from '../../domain/Shape.js';
import type { SvgDocument } from '../../domain/SvgDocument.js';

/** Serializes the common Shape contract; new shape types do not need IO dispatch. */
export class SvgWriter {
  write(document: SvgDocument): string {
    const width = String(document.width);
    const height = String(document.height);
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ];
    for (const shape of document.roots) {
      lines.push(this.writeShape(shape, 1));
    }
    lines.push('</svg>', '');
    return lines.join('\n');
  }

  private writeShape(shape: Shape, depth: number): string {
    const indentation = '  '.repeat(depth);
    const attributes = [
      `id="${this.escape(shape.id)}"`,
      ...Object.entries(shape.attributes).map(([name, value]) => `${name}="${this.escape(value)}"`),
    ].join(' ');
    const opening = `${indentation}<${shape.type} ${attributes}`;
    if (shape.textContent !== undefined) {
      return `${opening}>${this.escape(shape.textContent)}</${shape.type}>`;
    }
    if (shape.children.length === 0) {
      return `${opening}/>`;
    }
    return [
      `${opening}>`,
      ...shape.children.map((child) => this.writeShape(child, depth + 1)),
      `${indentation}</${shape.type}>`,
    ].join('\n');
  }

  private escape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
  }
}

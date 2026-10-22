import type { Shape } from "../domain/Shape.js";
import type { SvgDocument } from "../domain/SvgDocument.js";

/** Formats a Composite tree using the descriptions supplied by each shape. */
export class TreeFormatter {
  format(document: SvgDocument, id?: string): string {
    const lines: string[] = [];
    if (id !== undefined) {
      const root = document.find(id);
      lines.push(root.describe());
      this.appendChildren(root.children, "", lines);
    } else {
      lines.push(`svg (${document.width}x${document.height})`);
      this.appendChildren(document.roots, "", lines);
    }
    return lines.join("\n");
  }

  private appendChildren(children: readonly Shape[], prefix: string, lines: string[]): void {
    children.forEach((child, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${child.describe()}`);
      this.appendChildren(child.children, `${prefix}${last ? "    " : "│   "}`, lines);
    });
  }
}

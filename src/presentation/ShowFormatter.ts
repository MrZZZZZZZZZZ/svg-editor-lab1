import type { SvgDocument } from "../domain/SvgDocument.js";

/** Displays model attributes without dispatching on a shape's type. */
export class ShowFormatter {
  private readonly appearanceAttributes = new Set(["fill", "stroke", "stroke-width"]);

  format(document: SvgDocument, id: string): string {
    const shape = document.find(id);
    const lines = [`${shape.label}  parent=${shape.parent?.label ?? "svg"}`];
    const geometry: string[] = [];
    const appearance: string[] = [];
    for (const [attribute, value] of Object.entries(shape.attributes)) {
      const destination = this.appearanceAttributes.has(attribute) ? appearance : geometry;
      destination.push(`${attribute}=${value}`);
    }
    if (geometry.length > 0) lines.push(`  ${geometry.join(" ")}`);
    if (shape.textContent !== undefined) lines.push(`  text=${JSON.stringify(shape.textContent)}`);
    if (appearance.length > 0) lines.push(`  ${appearance.join(" ")}`);
    return lines.join("\n");
  }
}

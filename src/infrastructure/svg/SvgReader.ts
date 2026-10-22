import { DOMParser, type Element, type Node } from '@xmldom/xmldom';
import type { SvgReadResult } from '../../application/ports/SvgRepository.js';
import { ShapeFactory } from '../../domain/ShapeFactory.js';
import { SvgDocument } from '../../domain/SvgDocument.js';

/** Strict XML input adapter. No browser DOM, script execution, DTD, or network IO. */
export class SvgReader {
  private readonly factory: ShapeFactory;

  constructor(factory: ShapeFactory = new ShapeFactory()) {
    this.factory = factory;
  }

  read(xml: string): SvgReadResult {
    const root = this.parse(xml);
    if (this.directText(root).trim()) throw new Error('invalid SVG: unexpected text in <svg>');
    const width = this.readDimension(root, 'width');
    const height = this.readDimension(root, 'height');
    this.validateRootAttributes(root, width, height);
    const document = new SvgDocument(width, height);
    const reservedIds = new Set<string>();
    this.reserveExplicitIds(root, reservedIds);
    const warnings: string[] = [];
    const counters = new Map<string, number>();
    for (const child of this.elementChildren(root)) {
      this.appendElement(child, document, undefined, reservedIds, counters, warnings);
    }
    return { document, warnings };
  }

  private parse(xml: string): Element {
    const declarations = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(declarations)) {
      throw new Error('invalid SVG: DOCTYPE and entity declarations are not supported');
    }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\p{Cs}]/u.test(xml)) {
      throw new Error('invalid SVG: invalid XML character');
    }
    let root: Element | null;
    try {
      const parsed = new DOMParser({
        onError: (_level, message) => { throw new Error(message); },
      }).parseFromString(xml, 'application/xml');
      root = parsed.documentElement;
      for (let node = parsed.firstChild; node; node = node.nextSibling) {
        if (node !== root && node.nodeType !== 8 && node.nodeType !== 7 &&
          !(node.nodeType === 3 && !node.nodeValue?.trim())) {
          throw new Error('unexpected content outside <svg>');
        }
      }
    } catch {
      throw new Error('invalid SVG: malformed XML');
    }
    if (!root || root.localName !== 'svg' || !this.isSvgNamespace(root)) {
      throw new Error('invalid SVG: root element must be <svg>');
    }
    return root;
  }

  private readDimension(root: Element, name: string): number {
    const value = root.getAttribute(name);
    if (value === null || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/.test(value.trim())) {
      throw new Error(`invalid SVG: ${name} must be a non-negative number in px`);
    }
    const number = Number(value.trim().replace(/px$/, ''));
    if (!Number.isFinite(number) || number < 0) {
      throw new Error(`invalid SVG: ${name} must be a non-negative number in px`);
    }
    return number;
  }

  private validateRootAttributes(root: Element, width: number, height: number): void {
    for (let index = 0; index < root.attributes.length; index += 1) {
      const attribute = root.attributes.item(index)!;
      if (!['width', 'height', 'viewBox', 'version'].includes(attribute.name) &&
        attribute.name !== 'xmlns' && !attribute.name.startsWith('xmlns:')) {
        throw new Error(`invalid SVG: unsupported root attribute: ${attribute.name}`);
      }
    }
    if (root.hasAttribute('viewBox')) {
      const box = root.getAttribute('viewBox')!.trim().split(/[\s,]+/).map(Number);
      if (box.length !== 4 || box.some((value) => !Number.isFinite(value)) ||
        box[0] !== 0 || box[1] !== 0 || box[2] !== width || box[3] !== height) {
        throw new Error('invalid SVG: viewBox must match 0 0 width height');
      }
    }
  }

  private reserveExplicitIds(element: Element, ids: Set<string>): void {
    for (const child of this.elementChildren(element)) {
      if (child.hasAttribute('id')) {
        const id = child.getAttribute('id')!;
        if (!id.trim()) throw new Error('invalid SVG: id must not be empty');
        if (ids.has(id)) throw new Error(`id already exists: ${id}`);
        ids.add(id);
      }
      this.reserveExplicitIds(child, ids);
    }
  }

  private appendElement(
    element: Element,
    document: SvgDocument,
    parentId: string | undefined,
    ids: Set<string>,
    counters: Map<string, number>,
    warnings: string[],
  ): void {
    const type = element.localName ?? element.tagName;
    if (!this.isSvgNamespace(element)) {
      throw new Error(`unknown shape type: ${element.tagName} (is the plugin loaded?)`);
    }
    let id = element.getAttribute('id');
    if (id === null) {
      let counter = counters.get(type) ?? 0;
      do { counter += 1; id = `${type}${counter}`; } while (ids.has(id));
      counters.set(type, counter);
      ids.add(id);
      warnings.push(`warning: assigned id ${id} to unnamed <${type}>`);
    }
    const attributes: Record<string, string> = {};
    for (let index = 0; index < element.attributes.length; index += 1) {
      const attribute = element.attributes.item(index)!;
      if (attribute.name !== 'id' && attribute.name !== 'xmlns' && !attribute.name.startsWith('xmlns:')) {
        attributes[attribute.name] = attribute.value;
      }
    }
    const children = this.elementChildren(element);
    const text = this.directText(element);
    const shape = this.factory.fromSvg(type, id, attributes, text);
    if (shape.textContent === undefined && text.trim()) {
      throw new Error(`invalid SVG: unexpected text in <${type}>`);
    }
    document.append(shape, parentId);
    for (const child of children) {
      this.appendElement(child, document, id, ids, counters, warnings);
    }
  }

  private elementChildren(element: Element): Element[] {
    const children: Element[] = [];
    for (let node = element.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 1) children.push(node as Element);
      else if (![3, 4, 8].includes(node.nodeType)) {
        throw new Error(`invalid SVG: unsupported content in <${element.localName}>`);
      }
    }
    return children;
  }

  private directText(element: Element): string {
    let text = '';
    for (let node: Node | null = element.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === 3 || node.nodeType === 4) text += node.nodeValue ?? '';
    }
    return text;
  }

  private isSvgNamespace(element: Element): boolean {
    return !element.namespaceURI || element.namespaceURI === 'http://www.w3.org/2000/svg';
  }
}

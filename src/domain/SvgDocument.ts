import { Shape } from './Shape.js';
import { ContainerShape } from './ContainerShape.js';
import { Group } from './Group.js';

/** Aggregate root: preserves identity, order and parent/child invariants. */
export class SvgDocument {
  #width: number;
  #height: number;
  readonly #roots: Shape[] = [];

  constructor(width = 800, height = 600) {
    this.validateDimensions(width, height);
    this.#width = width;
    this.#height = height;
  }

  get width(): number { return this.#width; }
  get height(): number { return this.#height; }
  get roots(): readonly Shape[] { return Object.freeze([...this.#roots]); }
  get elementCount(): number { return this.preorder().length; }

  resize(width: number, height: number): void {
    this.validateDimensions(width, height);
    this.#width = width;
    this.#height = height;
  }

  find(id: string): Shape {
    const shape = this.preorder().find(node => node.id === id);
    if (!shape) throw new Error(`no such shape: ${id}`);
    return shape;
  }

  findContainer(id: string): ContainerShape {
    const shape = this.preorder().find(node => node.id === id);
    if (!shape) throw new Error(`no such container: ${id}`);
    if (!(shape instanceof ContainerShape)) throw new Error(`not a container: ${id}`);
    return shape;
  }

  append(shape: Shape, containerId?: string): void {
    const parent = containerId === undefined ? null : this.findContainer(containerId);
    const occupied = new Set(this.preorder().map(node => node.id));
    for (const node of this.preorder([shape])) {
      if (occupied.has(node.id)) throw new Error(`id already exists: ${node.id}`);
      occupied.add(node.id);
    }
    if (shape.parent) throw new Error(`shape already has a parent: ${shape.id}`);
    this.insert(shape, parent, parent ? parent.children.length : this.#roots.length);
  }

  delete(id: string): Shape {
    const shape = this.find(id);
    this.detach(shape);
    return shape;
  }

  group(newId: string, ids: string[]): Group {
    const group = new Group(newId);
    if (this.preorder().some(shape => shape.id === newId)) throw new Error(`id already exists: ${newId}`);
    if (ids.length === 0) throw new Error('group requires at least one shape');
    const selected = new Set<Shape>();
    for (const id of ids) {
      const shape = this.find(id);
      if (selected.has(shape)) throw new Error(`duplicate shape id: ${id}`);
      selected.add(shape);
    }
    for (const shape of selected) {
      for (let ancestor = shape.parent; ancestor; ancestor = ancestor.parent) {
        if (selected.has(ancestor)) {
          throw new Error(`cannot group a container into its own descendant: ${ancestor.id}`);
        }
      }
    }
    const ordered = this.preorder().filter(shape => selected.has(shape));
    const parent = this.commonParent(ordered);
    const siblings = parent ? parent.children : this.#roots;
    const insertionIndex = Math.min(...ordered.map(shape => {
      let branch = shape;
      while (branch.parent !== parent) branch = branch.parent!;
      return siblings.indexOf(branch);
    }));
    for (const shape of ordered) this.detach(shape);
    this.insert(group, parent, insertionIndex);
    for (const shape of ordered) group.appendChild(shape);
    return group;
  }

  ungroup(id: string): number {
    const group = this.findContainer(id);
    if (!group.allowsUngroup) throw new Error(`cannot ungroup composite shape: ${id}`);
    const parent = group.parent;
    if (!parent) throw new Error(`cannot ungroup top-level container: ${id}`);
    const index = parent.children.indexOf(group);
    const children = [...group.children];
    parent.removeChild(group);
    for (const [offset, child] of children.entries()) {
      group.removeChild(child);
      parent.insertChild(child, index + offset);
    }
    return children.length;
  }

  addTo(groupId: string, id: string): void {
    const target = this.findContainer(groupId);
    const shape = this.find(id);
    for (let ancestor: Shape | null = target; ancestor; ancestor = ancestor.parent) {
      if (ancestor === shape) throw new Error(`cannot group a container into its own descendant: ${shape.id}`);
    }
    this.detach(shape);
    target.appendChild(shape);
  }

  front(id: string): void { this.reorder(id, true); }
  back(id: string): void { this.reorder(id, false); }

  clone(): SvgDocument {
    const document = new SvgDocument(this.width, this.height);
    for (const root of this.#roots) document.append(root.clone());
    return document;
  }

  private preorder(roots: readonly Shape[] = this.#roots): Shape[] {
    const nodes: Shape[] = [];
    for (const root of roots) {
      nodes.push(root, ...this.preorder(root.children));
    }
    return nodes;
  }

  private commonParent(shapes: readonly Shape[]): ContainerShape | null {
    let candidate = shapes[0]!.parent;
    while (candidate) {
      const current = candidate;
      const containsAll = shapes.every(shape => {
        for (let ancestor = shape.parent; ancestor; ancestor = ancestor.parent) {
          if (ancestor === current) return true;
        }
        return false;
      });
      if (containsAll) return current;
      candidate = candidate.parent;
    }
    return null;
  }

  private detach(shape: Shape): void {
    if (shape.parent) shape.parent.removeChild(shape);
    else {
      const index = this.#roots.indexOf(shape);
      if (index < 0) throw new Error(`no such shape: ${shape.id}`);
      this.#roots.splice(index, 1);
    }
  }

  private insert(shape: Shape, parent: ContainerShape | null, index: number): void {
    if (parent) parent.insertChild(shape, index);
    else this.#roots.splice(index, 0, shape);
  }

  private reorder(id: string, front: boolean): void {
    const shape = this.find(id);
    const parent = shape.parent;
    this.detach(shape);
    this.insert(shape, parent, front ? (parent ? parent.children.length : this.#roots.length) : 0);
  }

  private validateDimensions(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
      throw new Error('canvas dimensions must be finite and non-negative');
    }
  }
}

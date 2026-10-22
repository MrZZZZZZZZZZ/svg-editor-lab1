import { ContainerShape } from './ContainerShape.js';

export class Group extends ContainerShape {
  constructor(id: string, attributes: Readonly<Record<string, string>> = {}) {
    super(id, 'g', attributes);
  }

  override get allowsUngroup(): boolean { return true; }

  override clone(): Group {
    const group = new Group(this.id, this.attributes);
    for (const child of this.children) group.appendChild(child.clone());
    return group;
  }
}

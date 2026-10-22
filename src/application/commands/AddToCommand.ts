import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class AddToCommand extends UndoableCommand {
  readonly #gid: string;
  readonly #id: string;
  constructor(args: CommandArgs) { super(); args.expect(2); this.#gid = args.at(0); this.#id = args.at(1); }
  override apply(document: SvgDocument): string[] {
    document.addTo(this.#gid, this.#id);
    return [`${document.find(this.#id).label} added to g#${this.#gid}`];
  }
  protected override undoMessage(document: SvgDocument): string[] {
    const shape = document.find(this.#id);
    return [`${shape.label} restored into ${shape.parent?.label ?? 'svg'}`];
  }
}

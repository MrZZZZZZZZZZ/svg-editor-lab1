import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class DeleteCommand extends UndoableCommand {
  readonly #id: string;
  constructor(args: CommandArgs) { super(); args.expect(1); this.#id = args.at(0); }
  override apply(document: SvgDocument): string[] { return [`${document.delete(this.#id).label} deleted`]; }
  protected override undoMessage(document: SvgDocument): string[] {
    const shape = document.find(this.#id);
    return [`${shape.label} restored into ${shape.parent?.label ?? 'svg'}`];
  }
}

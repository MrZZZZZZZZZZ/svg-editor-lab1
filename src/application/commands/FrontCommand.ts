import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class FrontCommand extends UndoableCommand {
  readonly #id: string;
  constructor(args: CommandArgs) { super(); args.expect(1); this.#id = args.at(0); }
  override apply(document: SvgDocument): string[] {
    document.front(this.#id);
    return [`${document.find(this.#id).label} moved to front`];
  }
  protected override undoMessage(document: SvgDocument): string[] {
    return [`${document.find(this.#id).label} order restored`];
  }
}

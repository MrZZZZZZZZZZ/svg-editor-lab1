import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class BackCommand extends UndoableCommand {
  readonly #id: string;
  constructor(args: CommandArgs) { super(); args.expect(1); this.#id = args.at(0); }
  override apply(document: SvgDocument): string[] {
    document.back(this.#id);
    return [`${document.find(this.#id).label} moved to back`];
  }
  protected override undoMessage(document: SvgDocument): string[] {
    return [`${document.find(this.#id).label} order restored`];
  }
}

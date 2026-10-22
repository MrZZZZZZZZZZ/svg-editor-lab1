import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class UngroupCommand extends UndoableCommand {
  readonly #id: string;
  constructor(args: CommandArgs) { super(); args.expect(1); this.#id = args.at(0); }
  override apply(document: SvgDocument): string[] {
    const count = document.ungroup(this.#id);
    return [`g#${this.#id} ungrouped (${count} children promoted)`];
  }
  protected override undoMessage(): string[] { return [`g#${this.#id} restored with its children`]; }
}

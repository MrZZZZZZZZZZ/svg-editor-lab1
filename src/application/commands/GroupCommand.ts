import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class GroupCommand extends UndoableCommand {
  readonly #id: string;
  readonly #children: string[];
  constructor(args: CommandArgs) {
    super(); args.expect(2, Number.MAX_SAFE_INTEGER); this.#id = args.at(0); this.#children = args.rest(1);
  }
  override apply(document: SvgDocument): string[] {
    const group = document.group(this.#id, this.#children);
    return [`${group.label} created with ${group.children.length} children`];
  }
  protected override undoMessage(): string[] { return [`g#${this.#id} removed; children restored`]; }
}

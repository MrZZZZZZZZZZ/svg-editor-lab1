import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class SetCommand extends UndoableCommand {
  readonly #id: string;
  readonly #attribute: string;
  readonly #value: string;
  constructor(args: CommandArgs) {
    super(); args.expect(3); this.#id = args.at(0); this.#attribute = args.at(1); this.#value = args.at(2);
  }
  override apply(document: SvgDocument): string[] {
    const shape = document.find(this.#id);
    shape.set(this.#attribute, this.#value);
    return [`${shape.label} updated: ${this.#attribute}=${JSON.stringify(this.#value)}`];
  }
  protected override undoMessage(document: SvgDocument): string[] {
    return [`${document.find(this.#id).label} restored: ${this.#attribute}`];
  }
}

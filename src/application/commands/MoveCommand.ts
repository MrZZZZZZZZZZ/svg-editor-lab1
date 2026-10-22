import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class MoveCommand extends UndoableCommand {
  readonly #id: string;
  readonly #dx: number;
  readonly #dy: number;
  constructor(args: CommandArgs) {
    super(); args.expect(3); this.#id = args.at(0); this.#dx = args.number(1); this.#dy = args.number(2);
  }
  override apply(document: SvgDocument): string[] {
    const shape = document.find(this.#id);
    shape.move(this.#dx, this.#dy);
    return [`${shape.label} moved by (${this.#dx},${this.#dy})`];
  }
  protected override undoMessage(document: SvgDocument): string[] {
    return [`${document.find(this.#id).label} moved back by (${-this.#dx},${-this.#dy})`];
  }
}

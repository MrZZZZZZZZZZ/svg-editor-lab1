import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class ScaleCommand extends UndoableCommand {
  readonly #id: string;
  readonly #factor: number;
  constructor(args: CommandArgs) {
    super(); args.expect(2); this.#id = args.at(0); this.#factor = args.number(1);
    if (this.#factor <= 0) throw new Error('scale factor must be positive');
  }
  override apply(document: SvgDocument): string[] {
    const shape = document.find(this.#id);
    shape.scale(this.#factor);
    return [`${shape.label} scaled by ${this.#factor}`];
  }
  protected override undoMessage(document: SvgDocument): string[] {
    return [`${document.find(this.#id).label} scale restored`];
  }
}

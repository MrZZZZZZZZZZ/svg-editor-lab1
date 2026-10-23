import type { Editor } from '../Editor.js';
import type { CommandArgs } from '../CommandArgs.js';
import { Command } from './Command.js';

export class CanvasCommand extends Command {
  readonly #args: CommandArgs;
  constructor(args: CommandArgs) {
    super();
    args.expect(0, 2);
    this.#args = args;
  }
  override async execute(editor: Editor): Promise<string[]> {
    return this.#args.length === 0 ? editor.canvas() : editor.canvas(
      this.#args.number(0), this.#args.length === 2 ? this.#args.number(1) : undefined,
    );
  }
}

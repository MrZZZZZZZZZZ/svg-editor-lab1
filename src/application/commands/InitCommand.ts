import type { Editor } from '../Editor.js';
import type { CommandArgs } from '../CommandArgs.js';
import { Command } from './Command.js';

export class InitCommand extends Command {
  readonly #args: CommandArgs;
  constructor(args: CommandArgs) {
    super();
    args.expect(0, 2);
    this.#args = args;
  }
  override async execute(editor: Editor): Promise<string[]> {
    return editor.init(this.#args.length > 0 ? this.#args.number(0) : 800, this.#args.length > 1 ? this.#args.number(1) : 600);
  }
}

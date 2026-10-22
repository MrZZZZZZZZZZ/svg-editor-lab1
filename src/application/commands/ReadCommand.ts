import type { Editor } from '../Editor.js';
import type { CommandArgs } from '../CommandArgs.js';
import { Command } from './Command.js';

export class ReadCommand extends Command {
  readonly #args: CommandArgs;
  constructor(args: CommandArgs) {
    super();
    args.expect(1);
    this.#args = args;
  }
  override async execute(editor: Editor): Promise<string[]> {
    return editor.read(this.#args.at(0));
  }
}

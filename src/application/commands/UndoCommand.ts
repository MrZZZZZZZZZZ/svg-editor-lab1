import type { Editor } from '../Editor.js';
import type { CommandArgs } from '../CommandArgs.js';
import { Command } from './Command.js';

export class UndoCommand extends Command {
  readonly #args: CommandArgs;
  constructor(args: CommandArgs) {
    super();
    args.expect(0);
    this.#args = args;
  }
  override async execute(editor: Editor): Promise<string[]> {
    return editor.undo();
  }
}

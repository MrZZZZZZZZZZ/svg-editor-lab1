import type { Editor } from '../Editor.js';

export abstract class Command {
  abstract execute(editor: Editor): Promise<string[]>;
}

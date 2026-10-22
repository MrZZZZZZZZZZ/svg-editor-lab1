import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { Editor } from '../Editor.js';
import { DocumentSnapshot } from '../DocumentSnapshot.js';
import { HistoryTransition } from '../HistoryTransition.js';
import { Command } from './Command.js';

export abstract class UndoableCommand extends Command {
  #before?: DocumentSnapshot;
  #after?: DocumentSnapshot;
  #output: string[] = [];

  override async execute(editor: Editor): Promise<string[]> {
    return editor.edit(this);
  }

  abstract apply(document: SvgDocument): string[];
  protected abstract undoMessage(document: SvgDocument): string[];

  remember(before: DocumentSnapshot, after: DocumentSnapshot, output: string[]): void {
    this.#before = before;
    this.#after = after;
    this.#output = [...output];
  }

  undo(): HistoryTransition {
    if (!this.#before) throw new Error('command has not been executed');
    const document = this.#before.restore();
    return new HistoryTransition(document, this.undoMessage(document));
  }

  redo(): HistoryTransition {
    if (!this.#after) throw new Error('command has not been executed');
    return new HistoryTransition(this.#after.restore(), this.#output);
  }
}

import type { SvgDocument } from '../domain/SvgDocument.js';
import { DocumentSnapshot } from './DocumentSnapshot.js';
import { HistoryTransition } from './HistoryTransition.js';
import type { UndoableCommand } from './commands/UndoableCommand.js';

export class CommandHistory {
  #undo: UndoableCommand[] = [];
  #redo: UndoableCommand[] = [];
  #blocked = true;

  execute(command: UndoableCommand, document: SvgDocument): HistoryTransition {
    // Copy-on-write: a failed command cannot touch the current document or stacks.
    const working = document.clone();
    const before = new DocumentSnapshot(document);
    const lines = command.apply(working);
    const after = new DocumentSnapshot(working);
    command.remember(before, after, lines);
    this.#undo.push(command);
    this.#redo = [];
    this.#blocked = false;
    return new HistoryTransition(working, lines);
  }

  barrier(): void {
    this.#undo = [];
    this.#redo = [];
    this.#blocked = true;
  }

  undo(): HistoryTransition {
    this.assertAllowed();
    const command = this.#undo.at(-1);
    if (!command) throw new Error('nothing to undo');
    const transition = command.undo();
    this.#undo.pop();
    this.#redo.push(command);
    return transition;
  }

  redo(): HistoryTransition {
    this.assertAllowed();
    const command = this.#redo.at(-1);
    if (!command) throw new Error('nothing to redo');
    const transition = command.redo();
    this.#redo.pop();
    this.#undo.push(command);
    return transition;
  }

  private assertAllowed(): void {
    if (this.#blocked) throw new Error('undo not allowed after io command');
  }
}

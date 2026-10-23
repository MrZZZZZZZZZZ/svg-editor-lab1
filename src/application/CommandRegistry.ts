import { CommandArgs } from './CommandArgs.js';
import type { Command } from './commands/Command.js';
import { InitCommand } from './commands/InitCommand.js';
import { ReadCommand } from './commands/ReadCommand.js';
import { SaveCommand } from './commands/SaveCommand.js';
import { CanvasCommand } from './commands/CanvasCommand.js';
import { CreateCommand } from './commands/CreateCommand.js';
import { DeleteCommand } from './commands/DeleteCommand.js';
import { MoveCommand } from './commands/MoveCommand.js';
import { ScaleCommand } from './commands/ScaleCommand.js';
import { SetCommand } from './commands/SetCommand.js';
import { GroupCommand } from './commands/GroupCommand.js';
import { UngroupCommand } from './commands/UngroupCommand.js';
import { AddToCommand } from './commands/AddToCommand.js';
import { FrontCommand } from './commands/FrontCommand.js';
import { BackCommand } from './commands/BackCommand.js';
import { TreeCommand } from './commands/TreeCommand.js';
import { ShowCommand } from './commands/ShowCommand.js';
import { HelpCommand } from './commands/HelpCommand.js';
import { UndoCommand } from './commands/UndoCommand.js';
import { RedoCommand } from './commands/RedoCommand.js';

export class CommandRegistry {
  // The single command-name dispatch point. Replace static registration in a later plugin phase.
  readonly #commands = new Map<string, readonly [string, new (args: CommandArgs) => Command]>([
    ['init', ['init [w] [h]', InitCommand]],
    ['read', ['read <file.svg>', ReadCommand]],
    ['save', ['save [file.svg]', SaveCommand]],
    ['canvas', ['canvas [w] [h]', CanvasCommand]],
    ['create', ['create <type> <id> [params...] [in <containerId>]', CreateCommand]],
    ['delete', ['delete <id>', DeleteCommand]],
    ['move', ['move <id> <dx> <dy>', MoveCommand]],
    ['scale', ['scale <id> <factor>', ScaleCommand]],
    ['set', ['set <id> <attr> <value>', SetCommand]],
    ['group', ['group <newGid> <id1> [id2...]', GroupCommand]],
    ['ungroup', ['ungroup <gid>', UngroupCommand]],
    ['addto', ['addto <gid> <id>', AddToCommand]],
    ['front', ['front <id>', FrontCommand]],
    ['back', ['back <id>', BackCommand]],
    ['tree', ['tree [id]', TreeCommand]],
    ['show', ['show <id>', ShowCommand]],
    ['help', ['help', HelpCommand]],
    ['undo', ['undo', UndoCommand]],
    ['redo', ['redo', RedoCommand]],
  ]);

  create(tokens: readonly string[]): Command {
    const name = tokens[0] ?? '';
    const definition = this.#commands.get(name);
    if (!definition) throw new Error(`unknown command: ${name}`);
    const [syntax, Constructor] = definition;
    return new Constructor(new CommandArgs(tokens.slice(1), syntax));
  }

  help(): string[] {
    return [
      ...[...this.#commands.values()].map(([syntax]) => syntax),
      'Types: rect <x> <y> <w> <h> [fill]; circle <cx> <cy> <r> [fill];',
      '       ellipse <cx> <cy> <rx> <ry> [fill]; line <x1> <y1> <x2> <y2> [stroke];',
      '       text <x> <y> "content"; g',
      'Blank lines and lines starting with # are ignored. End input with Ctrl-D.',
    ];
  }
}

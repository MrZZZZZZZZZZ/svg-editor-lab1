import { ShapeFactory } from '../../domain/ShapeFactory.js';
import type { SvgDocument } from '../../domain/SvgDocument.js';
import type { CommandArgs } from '../CommandArgs.js';
import { UndoableCommand } from './UndoableCommand.js';

export class CreateCommand extends UndoableCommand {
  readonly #type: string;
  readonly #id: string;
  readonly #parameters: string[];
  readonly #containerId?: string;

  constructor(args: CommandArgs) {
    super();
    args.expect(2, Number.MAX_SAFE_INTEGER);
    this.#type = args.at(0);
    this.#id = args.at(1);
    const parameters = args.rest(2);
    if (parameters.length >= 2 && parameters.at(-2) === 'in') {
      this.#containerId = parameters.pop()!;
      parameters.pop();
    }
    this.#parameters = parameters;
  }

  override apply(document: SvgDocument): string[] {
    const shape = new ShapeFactory().create(this.#type, this.#id, this.#parameters);
    document.append(shape, this.#containerId);
    const parent = this.#containerId ? ` in ${document.findContainer(this.#containerId).label}` : '';
    return [`${shape.label} created${parent}`];
  }

  protected override undoMessage(): string[] { return [`${this.#type}#${this.#id} deleted`]; }
}

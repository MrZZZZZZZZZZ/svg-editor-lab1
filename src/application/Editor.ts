import { SvgDocument } from '../domain/SvgDocument.js';
import { CommandRegistry } from './CommandRegistry.js';
import { CommandHistory } from './CommandHistory.js';
import type { UndoableCommand } from './commands/UndoableCommand.js';
import type { SvgRepository } from './ports/SvgRepository.js';
import type { LineTokenizer } from './ports/LineTokenizer.js';
import type { TreeView } from './ports/TreeView.js';
import type { ShapeView } from './ports/ShapeView.js';

export class Editor {
  #document?: SvgDocument;
  #filePath?: string;
  readonly #history = new CommandHistory();
  readonly #registry = new CommandRegistry();
  readonly #repository: SvgRepository;
  readonly #tokenizer: LineTokenizer;
  readonly #tree: TreeView;
  readonly #show: ShapeView;

  constructor(repository: SvgRepository, tokenizer: LineTokenizer, tree: TreeView, show: ShapeView) {
    this.#repository = repository;
    this.#tokenizer = tokenizer;
    this.#tree = tree;
    this.#show = show;
  }

  async execute(line: string): Promise<string[]> {
    const tokens = this.#tokenizer.tokenize(line);
    if (tokens.length === 0) return [];
    return this.#registry.create(tokens).execute(this);
  }

  requireDocument(): SvgDocument {
    if (!this.#document) throw new Error("no document. use 'init' or 'read' first");
    return this.#document;
  }

  edit(command: UndoableCommand): string[] {
    const transition = this.#history.execute(command, this.requireDocument());
    this.#document = transition.document;
    return transition.lines;
  }

  init(width: number, height: number): string[] {
    const document = new SvgDocument(width, height);
    this.#document = document;
    this.#filePath = undefined;
    this.#history.barrier();
    return [`canvas ${width}x${height} created`];
  }

  async read(path: string): Promise<string[]> {
    const result = await this.#repository.read(path);
    this.#document = result.document;
    this.#filePath = path;
    this.#history.barrier();
    return [...result.warnings, `read ${path} (${result.document.elementCount} elements)`];
  }

  async save(path?: string): Promise<string[]> {
    const document = this.requireDocument();
    const target = path ?? this.#filePath;
    if (!target) throw new Error("no file path. use 'save <file.svg>' first");
    await this.#repository.write(target, document);
    this.#filePath = target;
    this.#history.barrier();
    return [`saved to ${target} (${document.elementCount} elements)`];
  }

  canvas(width?: number, height?: number): string[] {
    const document = this.requireDocument();
    if (width === undefined && height === undefined) return [`canvas ${document.width}x${document.height}`];
    const next = document.clone();
    next.resize(width ?? document.width, height ?? document.height);
    this.#document = next;
    this.#history.barrier();
    return [`canvas resized to ${next.width}x${next.height}`];
  }

  tree(id?: string): string[] { return [this.#tree.format(this.requireDocument(), id)]; }
  show(id: string): string[] { return [this.#show.format(this.requireDocument(), id)]; }
  help(): string[] {
    this.requireDocument();
    return this.#registry.help();
  }

  undo(): string[] {
    this.requireDocument();
    const transition = this.#history.undo();
    this.#document = transition.document;
    return transition.lines;
  }

  redo(): string[] {
    this.requireDocument();
    const transition = this.#history.redo();
    this.#document = transition.document;
    return transition.lines;
  }
}

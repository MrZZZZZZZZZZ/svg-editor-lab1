import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { Editor } from "../application/Editor.js";

/** Owns terminal IO; the application only receives lines and returns messages. */
export class Repl {
  constructor(
    private readonly editor: Pick<Editor, "execute">,
    private readonly input: Readable = process.stdin,
    private readonly output: Writable = process.stdout,
    private readonly errorOutput: Writable = process.stderr,
  ) {}

  async run(): Promise<void> {
    const interactive = "isTTY" in this.input && this.input.isTTY === true;
    const reader = createInterface({ input: this.input, output: this.output, terminal: interactive });
    this.output.write("svg-editor 0.1 — type 'help' for commands\n");
    if (interactive) {
      reader.setPrompt("svg> ");
      reader.prompt();
    }
    try {
      for await (const line of reader) {
        try {
          for (const message of await this.editor.execute(line)) this.output.write(`${message}\n`);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.errorOutput.write(`error: ${message.replace(/\s*[\r\n]+\s*/gu, " ")}\n`);
        }
        if (interactive) reader.prompt();
      }
    } finally {
      reader.close();
    }
  }
}

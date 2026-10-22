import assert from "node:assert/strict";
import { PassThrough, Readable } from "node:stream";
import { test } from "node:test";
import { Circle } from "../src/domain/Circle.js";
import { Group } from "../src/domain/Group.js";
import { Rect } from "../src/domain/Rect.js";
import { SvgDocument } from "../src/domain/SvgDocument.js";
import { Text } from "../src/domain/Text.js";
import { Repl } from "../src/presentation/Repl.js";
import { ShowFormatter } from "../src/presentation/ShowFormatter.js";
import { Tokenizer } from "../src/presentation/Tokenizer.js";
import { TreeFormatter } from "../src/presentation/TreeFormatter.js";

test("tokenizer handles quoted content, empty text, colors, and whole-line comments", () => {
  const tokenizer = new Tokenizer();
  assert.deepEqual(tokenizer.tokenize(' create text t1 20 40 "My Diagram" '), [
    "create", "text", "t1", "20", "40", "My Diagram",
  ]);
  assert.deepEqual(tokenizer.tokenize('set t1 text ""'), ["set", "t1", "text", ""]);
  assert.deepEqual(tokenizer.tokenize("create rect r1 0 0 20 30 #ffffff"), [
    "create", "rect", "r1", "0", "0", "20", "30", "#ffffff",
  ]);
  assert.deepEqual(tokenizer.tokenize("  # comments are ignored"), []);
  assert.deepEqual(tokenizer.tokenize("\t \n"), []);
  assert.deepEqual(tokenizer.tokenize('set t1 text "# content"'), ["set", "t1", "text", "# content"]);
});

test("tokenizer supports escaped quotes and backslashes without rewriting unknown escapes", () => {
  const tokenizer = new Tokenizer();
  assert.deepEqual(tokenizer.tokenize(String.raw`set t1 text "say \"hi\" \\ end"`), [
    "set", "t1", "text", 'say "hi" \\ end',
  ]);
  assert.deepEqual(tokenizer.tokenize(String.raw`read "C:\documents\diagram.svg"`), [
    "read", String.raw`C:\documents\diagram.svg`,
  ]);
});

test("tokenizer rejects malformed quoting instead of silently changing parameters", () => {
  const tokenizer = new Tokenizer();
  assert.throws(() => tokenizer.tokenize('set t1 text "unfinished'), /unterminated double quote/u);
  assert.throws(() => tokenizer.tokenize('set t1 text "hello"tail'), /expected whitespace/u);
  assert.throws(() => tokenizer.tokenize('set t1 text hello"tail"'), /double quote must start/u);
  assert.throws(() => tokenizer.tokenize('set t1 text "one""two"'), /expected whitespace/u);
});

test("tree formatter shows geometry and preserves nested tree continuation characters", () => {
  const document = new SvgDocument(400, 300);
  document.append(new Group("scene"));
  document.append(new Rect("r1", { x: "10", y: "20", width: "100", height: "50", fill: "red" }), "scene");
  document.append(new Group("nested"), "scene");
  document.append(new Circle("c1", { cx: "5", cy: "6", r: "2" }), "nested");
  document.append(new Text("title", { x: "20", y: "40" }, "My Diagram"));
  const formatter = new TreeFormatter();
  assert.equal(formatter.format(document), [
    "svg (400x300)",
    "├── g#scene",
    "│   ├── rect#r1 x=10 y=20 w=100 h=50 fill=red",
    "│   └── g#nested",
    "│       └── circle#c1 cx=5 cy=6 r=2",
    '└── text#title (20,40) "My Diagram"',
  ].join("\n"));
  assert.equal(formatter.format(document, "nested"), "g#nested\n└── circle#c1 cx=5 cy=6 r=2");
  assert.throws(() => formatter.format(document, "missing"), /no such shape: missing/u);
});

test("show formatter displays the parent, geometry, appearance and text content", () => {
  const document = new SvgDocument();
  document.append(new Group("markers"));
  document.append(new Circle("c1", { cx: "100", cy: "100", r: "20", fill: "red" }), "markers");
  document.append(new Text("title", { x: "20", y: "40" }, 'A "label"'));
  const formatter = new ShowFormatter();
  assert.equal(formatter.format(document, "c1"), "circle#c1  parent=g#markers\n  cx=100 cy=100 r=20\n  fill=red");
  assert.equal(formatter.format(document, "title"), 'text#title  parent=svg\n  x=20 y=40\n  text="A \\"label\\""');
  assert.equal(formatter.format(document, "markers"), "g#markers  parent=svg");
  assert.throws(() => formatter.format(document, "missing"), /no such shape: missing/u);
});

test("batch REPL executes sequentially, reports one-line errors, and continues", async () => {
  const input = Readable.from(["first\nbad\nthird\n"]);
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  let stdout = "";
  let stderr = "";
  output.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  errorOutput.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const executed: string[] = [];
  let running = false;
  const editor = {
    async execute(line: string): Promise<string[]> {
      assert.equal(running, false);
      running = true;
      executed.push(line);
      await Promise.resolve();
      running = false;
      if (line === "bad") throw new Error("invalid\n  parameter");
      return [`done ${line}`, `details ${line}`];
    },
  };
  await new Repl(editor, input, output, errorOutput).run();
  assert.deepEqual(executed, ["first", "bad", "third"]);
  assert.equal(stdout, "svg-editor 0.1 — type 'help' for commands\ndone first\ndetails first\ndone third\ndetails third\n");
  assert.equal(stderr, "error: invalid parameter\n");
  assert.equal(stdout.includes("svg>"), false);
});

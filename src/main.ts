import { Editor } from './application/Editor.js';
import { FileSvgRepository } from './infrastructure/FileSvgRepository.js';
import { Tokenizer } from './presentation/Tokenizer.js';
import { TreeFormatter } from './presentation/TreeFormatter.js';
import { ShowFormatter } from './presentation/ShowFormatter.js';
import { Repl } from './presentation/Repl.js';

const editor = new Editor(new FileSvgRepository(), new Tokenizer(), new TreeFormatter(), new ShowFormatter());
await new Repl(editor).run();

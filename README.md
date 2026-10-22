# SVG 编辑器：Lab1 Phase 1

Git 仓库：[MrZZZZZZZZZZ/svg-editor-lab1](https://github.com/MrZZZZZZZZZZ/svg-editor-lab1)

按照 [phase_cli_1.md](./phase_cli_1.md) 实现的 TypeScript 命令行 SVG 编辑器，支持六类图形、嵌套容器、SVG 文件读写以及 Command 模式的撤销重做。

**正式实验报告：[doc/README.md](./doc/README.md)**。报告包含模块职责和 PlantUML 图、设计模式、依赖规则、变化点、实际迭代记录、一致性自查及质量保证。

## 运行

在本文件所在的“个人lab1”目录执行：

```sh
# 本机可使用 Codex 已有 Node.js 运行时。
./lab install
./lab cli
```

有 Node.js 22 或更高版本及 npm 的其他电脑可使用：

```sh
npm install
npm run cli
```

交互模式显示 `svg>`；输入 `help` 查看语法，Ctrl-D 结束。以 `#` 开头的整行是注释，颜色中的 `#` 保留，含空格的参数使用双引号。

```text
init 800 600
create g scene
create rect r1 20 40 120 60 #4a90d9 in scene
create text t1 40 75 "Hello SVG" in scene
move scene 30 0
undo
redo
tree
save demo.svg
```

保存的 SVG 可拖入浏览器查看。`save` 等文档操作成功后禁止撤销重做，下一条成功编辑重新开启历史。

## 验证与示例

```sh
./lab typecheck
./lab test
./lab cli < examples/flowchart.commands
```

标准 npm 对应命令为 `npm run typecheck`、`npm test` 和 `npm run cli < examples/flowchart.commands`。依赖版本记录在 `pnpm-lock.yaml`，也可用 pnpm 安装和运行。

当前自动化验收 **43 项通过、0 失败**，覆盖全部命令、附件两组会话、失败原子性、SVG 往返、依赖边界和长序列历史恢复。详情及支持范围见[正式实验报告](./doc/README.md)。

![由命令脚本生成的流程图](./examples/flowchart.svg)

## 功能范围

| 分类 | 支持内容 |
| --- | --- |
| 文档 | `init`、`read`、`save`、`canvas` |
| 图形 | `rect`、`circle`、`ellipse`、`line`、`text`、`g` |
| 编辑 | `create ... [in ...]`、`delete`、`move`、`scale`、`set` |
| 结构与绘制顺序 | `group`、`ungroup`、`addto`、`front`、`back` |
| 显示 | `tree`、`show`、`help` |
| 历史 | `undo`、`redo`；整条编辑一个单元，失败保留文档及历史 |

`box` 和动态插件属于后续阶段。外部 SVG 仅支持六种元素和规定的属性；不支持的结构报错。导入 `transform` 原样保留，编辑处理局部坐标，重新分组可能改变继承样式及变换结果。

```text
src/domain/             图形与树结构
src/application/        用例、命令、历史、快照、接口
src/presentation/       分词、REPL、tree/show
src/infrastructure/     文件系统与 XML
src/main.ts             依赖装配入口
tests/                  自动化验收
examples/               SVG 与命令回放
doc/README.md           正式实验报告
```

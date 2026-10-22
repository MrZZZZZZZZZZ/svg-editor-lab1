import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = resolve(projectRoot, 'src');
const sources = readdirSync(sourceRoot, { recursive: true })
  .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
  .map(name => {
    const file = resolve(sourceRoot, name);
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  });

type Role = 'main' | 'domain' | 'application' | 'ports' | 'presentation' | 'infrastructure';

function role(file: string): Role | undefined {
  const path = relative(sourceRoot, file).split(sep).join('/');
  if (path === 'main.ts') return 'main';
  if (path.startsWith('application/ports/')) return 'ports';
  if (path.startsWith('domain/')) return 'domain';
  if (path.startsWith('application/')) return 'application';
  if (path.startsWith('presentation/')) return 'presentation';
  if (path.startsWith('infrastructure/')) return 'infrastructure';
  return undefined;
}

function position(source: ts.SourceFile, node: ts.Node): string {
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  return `${relative(projectRoot, source.fileName)}:${line}`;
}

test('source imports respect module roles, including the application ports boundary', () => {
  assert.ok(sources.length > 0, 'the architecture check must inspect real source files');
  const allowed: Readonly<Record<Role, readonly Role[]>> = {
    main: ['domain', 'application', 'ports', 'presentation', 'infrastructure'],
    domain: ['domain'],
    application: ['domain', 'application', 'ports'],
    ports: ['domain', 'ports'],
    presentation: ['domain', 'application', 'ports', 'presentation'],
    infrastructure: ['domain', 'ports', 'infrastructure'],
  };
  const violations: string[] = [];
  const check = (source: ts.SourceFile, node: ts.Node, specifier: string): void => {
    const origin = role(source.fileName);
    const location = position(source, node);
    if (!origin) {
      violations.push(`${location}: source file has no defined module role`);
      return;
    }
    if (!specifier.startsWith('.') && !isAbsolute(specifier)) {
      const permittedExternal =
        ((origin === 'main' || origin === 'presentation' || origin === 'infrastructure') && specifier.startsWith('node:')) ||
        (origin === 'infrastructure' && specifier === '@xmldom/xmldom');
      if (!permittedExternal) violations.push(`${location}: ${origin} cannot import external module ${specifier}`);
      return;
    }
    const target = ts.resolveModuleName(specifier, source.fileName, {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    }, ts.sys).resolvedModule?.resolvedFileName;
    const destination = target === undefined ? undefined : role(target);
    if (destination === undefined || !allowed[origin].includes(destination)) {
      violations.push(`${location}: ${origin} cannot depend on ${specifier} (${destination ?? 'outside src'})`);
    }
  };

  for (const source of sources) {
    if (role(source.fileName) === undefined) violations.push(`${source.fileName}: unknown module role`);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (ts.isStringLiteralLike(node.moduleSpecifier)) check(source, node, node.moduleSpecifier.text);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        if (expression && ts.isStringLiteralLike(expression)) check(source, node, expression.text);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteralLike(node.argument.literal)) {
        check(source, node, node.argument.literal.text);
      } else if (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) check(source, node, argument.text);
        else violations.push(`${position(source, node)}: computed module imports cannot be checked statically`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  assert.deepEqual(violations, [], violations.join('\n'));
  // This verifies declared import edges, not arbitrary runtime behavior or business semantics.
});

test('source classes use matching files and business logic has no top-level free functions', () => {
  const violations: string[] = [];
  for (const source of sources) {
    const classes = source.statements.filter(ts.isClassDeclaration);
    if (classes.length > 1) violations.push(`${source.fileName}: more than one top-level class`);
    for (const declaration of classes) {
      if (declaration.name?.text !== basename(source.fileName, '.ts')) {
        violations.push(`${position(source, declaration)}: class name must match its filename`);
      }
    }
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement)) {
        violations.push(`${position(source, statement)}: top-level free function`);
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const initializer = declaration.initializer;
          if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
            violations.push(`${position(source, declaration)}: top-level function-valued variable`);
          }
        }
      }
    }
    // Only source-file declarations are inspected above. Factory callbacks, method-local
    // recursive closures, interface DTOs and main.ts assembly constants remain valid.
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});

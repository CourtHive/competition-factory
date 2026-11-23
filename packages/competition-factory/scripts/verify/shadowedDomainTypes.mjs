#!/usr/bin/env node
/**
 * verify:shadowed-types — a domain type name must resolve to the domain type.
 *
 * WHY THIS EXISTS
 * `event?: Event` written without importing `Event` from `@Types/tournamentTypes` does not fail to compile: the
 * name resolves to the global `Event` that `@types/node` declares (the web `Event` class), and every property
 * read through it is then checked against the wrong type. Found 2026-10-14 in `removeOnlineResource`, and a
 * survey of all `src` found one more (`scheduledTime.ts`). tsc cannot catch this; only resolving the name can.
 *
 * WHAT IT CHECKS
 * Every type reference in `src` (tests included) whose name is a type, interface, enum or class exported from
 * `src/types` must resolve to a declaration inside `src`. One that resolves to a global (lib, `@types/node`, …)
 * fails, with its file and line. `Set<…>` with type arguments is the JavaScript collection and is not a
 * reference to the domain `Set` (a scored set), so it is skipped; a bare `Set` is checked.
 *
 * Run:        pnpm verify:shadowed-types
 * Self-test:  pnpm verify:shadowed-types --self-test   (asserts it FIRES on a global and stays quiet on an import)
 */
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = join(import.meta.dirname, '..', '..');

/** names exported from the types directory */
function domainNames(program, typesDir) {
  const names = new Set();
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(typesDir)) continue;
    for (const statement of sourceFile.statements) {
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      const named =
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isClassDeclaration(statement);
      if (exported && named && statement.name) names.add(statement.name.text);
    }
  }
  return names;
}

/** `file:line  Name -> where it resolved` for every domain-named reference that resolves outside `srcDir` */
export function findShadowed(program, srcDir, typesDir) {
  const checker = program.getTypeChecker();
  const names = domainNames(program, typesDir);
  const findings = [];
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.fileName.startsWith(srcDir)) continue;
    const visit = (node) => {
      const candidate =
        ts.isTypeReferenceNode(node) &&
        ts.isIdentifier(node.typeName) &&
        names.has(node.typeName.text) &&
        !(node.typeName.text === 'Set' && node.typeArguments?.length);
      if (candidate) {
        const symbol = checker.getSymbolAtLocation(node.typeName);
        const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        const declarations = resolved?.declarations ?? [];
        if (declarations.every((declaration) => !declaration.getSourceFile().fileName.startsWith(srcDir))) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          const where = declarations[0]?.getSourceFile().fileName.replace(/.*node_modules\//, '') ?? 'unresolved';
          findings.push(`${relative(ROOT, sourceFile.fileName)}:${line + 1}  ${node.typeName.text} -> ${where}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return findings;
}

function run() {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json');
  const config = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, ROOT);
  const program = ts.createProgram(config.fileNames, config.options);
  const findings = findShadowed(program, join(ROOT, 'src') + sep, join(ROOT, 'src', 'types') + sep);
  if (!findings.length) {
    console.log('[verify:shadowed-types] OK — every domain type name resolves to the domain type');
    return 0;
  }
  console.error(`[verify:shadowed-types] FAIL — ${findings.length} reference(s) resolve to a global, not the domain:`);
  for (const finding of findings) console.error(`  ${finding}`);
  console.error("Import the type from '@Types/tournamentTypes' (or the src/types module that declares it).");
  return 1;
}

/** an in-memory program: a types module exporting `Event`, and a consumer that does or does not import it */
function selfTest() {
  const root = join(ROOT, '__shadowed_self_test__');
  const srcDir = join(root, 'src') + sep;
  const typesDir = join(root, 'src', 'types') + sep;
  const programWith = (consumer) => {
    const files = {
      [join(typesDir, 'domain.ts')]:
        'export interface Event { eventId: string }\nexport interface Set { setNumber: number }\n',
      [join(srcDir, 'consumer.ts')]: consumer,
    };
    const options = {
      moduleResolution: ts.ModuleResolutionKind.Node10,
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ESNext,
      noEmit: true,
    };
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    host.fileExists = (fileName) => fileName in files || ts.sys.fileExists(fileName);
    host.directoryExists = (directory) => directory.startsWith(root) || ts.sys.directoryExists(directory);
    host.readFile = (fileName) => files[fileName] ?? readFile(fileName);
    host.getSourceFile = (fileName, version) =>
      fileName in files ? ts.createSourceFile(fileName, files[fileName], version) : getSourceFile(fileName, version);
    return ts.createProgram(Object.keys(files), options, host);
  };
  const fires = findShadowed(programWith('export type A = { event?: Event };\n'), srcDir, typesDir);
  const quiet = findShadowed(
    programWith("import { Event } from './types/domain';\nexport type A = { event?: Event; ids: Set<string> };\n"),
    srcDir,
    typesDir,
  );
  if (fires.length !== 1 || quiet.length !== 0) {
    console.error(
      `[verify:shadowed-types] self-test FAILED — fires: ${fires.length} (want 1), quiet: ${quiet.length} (want 0)`,
      [...fires, ...quiet],
    );
    return 1;
  }
  console.log('[verify:shadowed-types] self-test OK — fires on a global Event, quiet on an import and on Set<…>');
  return 0;
}

process.exitCode = process.argv.includes('--self-test') ? selfTest() : run();

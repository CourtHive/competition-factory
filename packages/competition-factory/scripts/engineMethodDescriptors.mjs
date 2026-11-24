// Read the governor modules and engine mounts as TypeScript. Nothing here is imported by the library.
import { dirname, join, relative, resolve, sep } from 'node:path';
import { availabilityFallback, UNSPLIT, UNNAMESPACED } from './engineMethodExceptions.mjs';
import ts from 'typescript';

const namespaceKinds = { mutate: 'mutation', generate: 'generate', query: 'query' };
const precedence = ['mutation', 'generate', 'query', 'engine'];

function original(checker, symbol) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function moduleExports(checker, module) {
  return checker.getExportsOfModule(original(checker, module));
}

// Preserve the public import at a named re-export, even when its module is itself a barrel.
function signatureSource(checker, symbol, outputDir) {
  const declaration = symbol.declarations?.[0];
  if (!declaration) throw new Error(`No declaration for ${symbol.name}`);
  if (ts.isExportSpecifier(declaration) || ts.isImportSpecifier(declaration)) {
    const specifier = declaration.parent.parent;
    const module = ts.isExportDeclaration(specifier) ? specifier : specifier.parent;
    if (module.moduleSpecifier) {
      let sourcePath = module.moduleSpecifier.text;
      if (sourcePath.startsWith('.')) {
        const target = resolve(dirname(declaration.getSourceFile().fileName), sourcePath);
        sourcePath = relative(outputDir, target).split(sep).join('/');
        if (!sourcePath.startsWith('.')) sourcePath = './' + sourcePath;
      }
      return { sourceName: (declaration.propertyName ?? declaration.name).text, sourcePath };
    }
  }
  const file = declaration.getSourceFile().fileName;
  if (!file) throw new Error(`No source for ${symbol.name}`);
  let sourcePath = relative(outputDir, file).split(sep).join('/').replace(/\.ts$/, '');
  if (!sourcePath.startsWith('.')) sourcePath = './' + sourcePath;
  return { sourceName: symbol.name, sourcePath };
}

export function readDescriptors(root, outputDir) {
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const namespaces = join(root, 'src/assemblies/governors/namespaces.ts');
  const engineStart = join(root, 'src/assemblies/engines/parts/engineStart.ts');
  const inventory = join(root, 'src/types/factoryEngineMethods.ts');
  const program = ts.createProgram([namespaces, engineStart, inventory], options);
  const checker = program.getTypeChecker();
  const source = (path) => program.getSourceFile(path);
  const inventoryType = source(inventory).statements.find(
    (node) => ts.isTypeAliasDeclaration(node) && node.name.text === 'FactoryEngineMethod',
  );
  if (!inventoryType || !ts.isUnionTypeNode(inventoryType.type)) throw new Error('Missing FactoryEngineMethod union');
  const names = inventoryType.type.types.map((member) => {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) throw new Error('Expected a method name');
    return member.literal.text;
  });
  const descriptors = new Map(names.map((name) => [name, { publicName: name }]));
  function assignKind(name, kind) {
    const entry = descriptors.get(name);
    if (entry && (!entry.kind || precedence.indexOf(kind) < precedence.indexOf(entry.kind))) entry.kind = kind;
  }

  const deprecatedSources = new Set();
  for (const governor of moduleExports(checker, checker.getSymbolAtLocation(source(namespaces)))) {
    const members = moduleExports(checker, governor);
    const exceptions = UNSPLIT[governor.name];
    for (const member of members) {
      const namespaceKind = Object.hasOwn(namespaceKinds, member.name) && namespaceKinds[member.name];
      if (namespaceKind) {
        for (const method of moduleExports(checker, member)) assignKind(method.name, namespaceKind);
        continue;
      }
      const entry = descriptors.get(member.name);
      if (
        !entry ||
        checker.getTypeOnlyAliasDeclaration(member) ||
        !(original(checker, member).flags & ts.SymbolFlags.Value)
      )
        continue;
      if (exceptions) {
        const kinds = Object.entries(exceptions);
        const rule =
          kinds.find(([, methods]) => Array.isArray(methods) && methods.includes(member.name)) ??
          kinds.find(([, methods]) => methods === '*');
        if (rule) assignKind(member.name, rule[0]);
      }
      // In 7.x availability's standalone functions retain their untyped engine fallback.
      if (governor.name === 'availabilityGovernor' && availabilityFallback.has(member.name)) continue;
      const deprecated = original(checker, member)
        .getJsDocTags(checker)
        .some((tag) => tag.name === 'deprecated');
      if (!entry.source || (deprecatedSources.has(member.name) && !deprecated)) {
        entry.source = signatureSource(checker, member, outputDir);
        if (deprecated) deprecatedSources.add(member.name);
        else deprecatedSources.delete(member.name);
      }
    }
  }
  for (const [kind, members] of Object.entries(UNNAMESPACED)) for (const name of members) assignKind(name, kind);

  const direct = new Set();
  function visitMount(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === 'engine'
    ) {
      const name = node.left.name.text;
      direct.add(name);
      assignKind(name, 'engine');
      const entry = descriptors.get(name);
      const body = ts.isArrowFunction(node.right) ? node.right.body : undefined;
      // Direct same-name calls and block-bodied setup functions have distinct, hand-typed mount signatures.
      if (
        entry &&
        !entry.source &&
        body &&
        ts.isCallExpression(body) &&
        ts.isIdentifier(body.expression) &&
        body.expression.text !== name &&
        !['importMethods', 'q', 'build', 'inspect'].includes(name)
      ) {
        const symbol = checker.getSymbolAtLocation(body.expression);
        if (symbol?.declarations?.some(ts.isImportSpecifier))
          entry.source = signatureSource(checker, symbol, outputDir);
      }
    }
    ts.forEachChild(node, visitMount);
  }
  visitMount(source(engineStart));
  for (const name of ['executionQueue', 'execute']) assignKind(name, 'engine');
  const missing = [...descriptors.values()].filter((entry) => !entry.kind);
  if (!direct.size || !names.length || missing.length)
    throw new Error(`Incomplete engine descriptors: ${missing.map((e) => e.publicName)}`);
  return { descriptors: [...descriptors.values()], directNames: [...direct].sort() };
}

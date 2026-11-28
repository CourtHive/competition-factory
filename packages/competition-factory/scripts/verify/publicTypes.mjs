#!/usr/bin/env node
/**
 * verify:public-types — the PUBLIC type surface may only get tighter.
 *
 * WHY THIS EXISTS
 * `verify:any-count` and `verify:implicit-any` count `any` in the source, by directory. Neither sees what a consumer
 * sees: the types of the engine methods, `tools`, `availability` and the exported model types, where one loose shared
 * shape (a result envelope's `info: any`, an index signature on a hydrated matchUp) reaches hundreds of methods. And a
 * public type loosened after 8.0.0 can only be tightened again in another major. So this check reads the public
 * surface itself, through the type checker, and holds it to a baseline that may only fall.
 *
 * WHAT IT MEASURES
 * For every member of `FactoryEngineTyped` and every function reachable from `tools` and `availability` (one namespace
 * level deep), the first call signature, and for every exported interface or type alias of `src/types`, its type. Each
 * is given a count per category:
 *   fallback      the `(...args: any[]) => any` shape a method not in `MethodSignatures` falls through to
 *   param:any     a parameter typed `any` (or `any[]` rest)
 *   param:keys    keys of the first parameter typed `any` (depth 1)
 *   param:index   index signatures in the first parameter (depth 1)
 *   ret:any       a result typed `any`
 *   ret:keys      keys of the result reaching `any` (depth 2; arrays and unions are looked through)
 *   ret:index     index signatures in the result (depth 2)
 *   type:any      for a model type, members typed `any` (depth 1), or 1 when the type itself is `any`
 *   type:index    for a model type, index signatures (depth 1)
 * An index signature to a named type (`{ [participantId: string]: Participant }`) counts like one to `any`: both admit
 * keys the type does not name, and the baseline records the current ones, so only a NEW one fails.
 *
 * THE RULE
 * A member whose count in any category RISES above its baseline fails, and so does a member absent from the baseline
 * with any count above zero. A count that FALLS passes; `--update-baseline` then writes the lower number, and refuses
 * a rise unless `--accept-rise` is also given.
 *
 * Run:        pnpm verify:public-types
 * Lower:      pnpm verify:public-types --update-baseline
 * Self-test:  pnpm verify:public-types --self-test   (asserts each category fires on a planted program)
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts', 'verify', 'baseline', 'public-types.json');

const isAny = (type) => !!(type.flags & ts.TypeFlags.Any);

/**
 * The shared result envelope's `context` (`ResultType.context`, an open `Record<string, unknown>`). It is ONE declaration,
 * counted once on `types.ResultType`; counting it again on every method whose result is `ResultType & { … }` would make
 * typing an `any` result look like a loosening. Only this property is skipped, and only when a method's signature is
 * walked: an index or `any` declared on a method's own success shape still counts on that method.
 */
export function isSharedEnvelopeContext(property) {
  if (property.name !== 'context') return false;
  return (property.declarations ?? []).some((declaration) => {
    for (let node = declaration.parent; node; node = node.parent) {
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return node.name.text === 'ResultType';
    }
    return false;
  });
}

/** Counts of `any`-reaching keys and index signatures in `type`, walking `depth` levels of properties. */
export function looseness(
  checker,
  type,
  depth,
  acc = { any: 0, index: 0, self: false, skipSharedEnvelope: false },
  seen = new Set(),
  top = true,
) {
  if (!type) return acc;
  if (isAny(type)) {
    if (top) acc.self = true;
    else acc.any += 1;
    return acc;
  }
  if (seen.has(type)) return acc;
  seen.add(type);
  if (type.isUnion() || type.isIntersection()) {
    for (const member of type.types) looseness(checker, member, depth, acc, seen, top);
    return acc;
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    for (const argument of checker.getTypeArguments(type)) looseness(checker, argument, depth, acc, seen, false);
    return acc;
  }
  if (!(type.flags & ts.TypeFlags.Object) || type.getCallSignatures().length) return acc;
  acc.index += checker.getIndexInfosOfType(type).length;
  if (depth <= 0) return acc;
  for (const property of checker.getPropertiesOfType(type)) {
    if (acc.skipSharedEnvelope && isSharedEnvelopeContext(property)) continue;
    looseness(checker, checker.getTypeOfSymbol(property), depth - 1, acc, seen, false);
  }
  return acc;
}

/** The category counts of one callable member; zero counts are left out. */
export function signatureCounts(checker, type) {
  const signature = type.getCallSignatures()[0];
  if (!signature) return {};
  const parameters = signature.getParameters();
  const first = parameters[0] ? checker.getTypeOfSymbol(parameters[0]) : undefined;
  const result = signature.getReturnType();
  const restAny = parameters.some((parameter) => {
    const declaration = parameter.valueDeclaration;
    if (!declaration || !ts.isParameter(declaration) || !declaration.dotDotDotToken) return false;
    const rest = checker.getTypeOfSymbol(parameter);
    return isAny(rest) || (checker.isArrayType(rest) && isAny(checker.getTypeArguments(rest)[0]));
  });
  const counts = {};
  if (restAny && isAny(result)) {
    counts.fallback = 1;
    return counts;
  }
  const walk = () => ({ any: 0, index: 0, self: false, skipSharedEnvelope: true });
  const parameter = first ? looseness(checker, first, 1, walk()) : { any: 0, index: 0, self: false };
  const returned = looseness(checker, result, 2, walk());
  if (parameter.self || restAny) counts['param:any'] = 1;
  if (parameter.any) counts['param:keys'] = parameter.any;
  if (parameter.index) counts['param:index'] = parameter.index;
  if (returned.self) counts['ret:any'] = 1;
  if (returned.any) counts['ret:keys'] = returned.any;
  if (returned.index) counts['ret:index'] = returned.index;
  return counts;
}

function typeCounts(checker, type) {
  const found = looseness(checker, type, 1);
  const counts = {};
  if (found.self || found.any) counts['type:any'] = found.self ? 1 : found.any;
  if (found.index) counts['type:index'] = found.index;
  return counts;
}

function callables(checker, symbol, prefix, bucket, depth = 0) {
  for (const property of checker.getPropertiesOfType(checker.getTypeOfSymbol(symbol))) {
    const type = checker.getTypeOfSymbol(property);
    if (type.getCallSignatures().length) {
      const counts = signatureCounts(checker, type);
      if (Object.keys(counts).length) bucket[`${prefix}${property.name}`] = counts;
    } else if (depth < 1 && type.flags & ts.TypeFlags.Object) {
      callables(checker, property, `${prefix}${property.name}.`, bucket, depth + 1);
    }
  }
}

/** `{ engine, tools, availability, types }`, each `{ member: { category: count } }`, for the package at `root`. */
export function measure(root, probeSource) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(root, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );
  const dir = mkdtempSync(join(tmpdir(), 'public-types-'));
  try {
    const probe = join(dir, 'probe.ts');
    const at = (path) => JSON.stringify(join(root, 'src', path));
    writeFileSync(
      probe,
      probeSource ??
        [
          `import type { FactoryEngineTyped } from ${at('assemblies/engines/types/engineTypes')};`,
          `import * as tools from ${at('assemblies/tools')};`,
          `import * as availability from ${at('assemblies/engines/availability')};`,
          `import type * as Types from ${at('types')};`,
          'export type Engine = FactoryEngineTyped;',
          'export const Tools = tools;',
          'export const Availability = availability;',
          'export type { Types };',
        ].join('\n'),
    );
    // a planted probe (the self-test) is checked alone; the real probe needs the package's sources
    const rootNames = probeSource ? [probe] : [...parsed.fileNames, probe];
    const program = ts.createProgram(rootNames, { ...parsed.options, noEmit: true });
    const checker = program.getTypeChecker();
    const exports = Object.fromEntries(
      checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(probe))).map((s) => [s.name, s]),
    );
    const result = { engine: {}, tools: {}, availability: {}, types: {} };
    if (exports.Engine) {
      for (const property of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(exports.Engine))) {
        const counts = signatureCounts(checker, checker.getTypeOfSymbol(property));
        if (Object.keys(counts).length) result.engine[property.name] = counts;
      }
    }
    if (exports.Tools) callables(checker, exports.Tools, '', result.tools);
    if (exports.Availability) callables(checker, exports.Availability, '', result.availability);
    if (exports.Types) {
      const alias = exports.Types;
      const module = alias.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(alias) : alias;
      for (const symbol of checker.getExportsOfModule(module)) {
        const real = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        if (!(real.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))) continue;
        const counts = typeCounts(checker, checker.getDeclaredTypeOfSymbol(real));
        if (Object.keys(counts).length) result.types[symbol.name] = counts;
      }
    }
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every `{ family, member, category, was, now }` where `now` exceeds the baseline. */
export function rises(current, baseline) {
  const found = [];
  for (const family of Object.keys(current)) {
    for (const [member, counts] of Object.entries(current[family])) {
      for (const [category, now] of Object.entries(counts)) {
        const was = baseline[family]?.[member]?.[category] ?? 0;
        if (now > was) found.push({ family, member, category, was, now });
      }
    }
  }
  return found;
}

const total = (measured) =>
  Object.values(measured)
    .flatMap((family) => Object.values(family))
    .flatMap((counts) => Object.values(counts))
    .reduce((sum, n) => sum + n, 0);

const sortedJson = (measured) => {
  const sortKeys = (object) =>
    Object.fromEntries(
      Object.keys(object)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, typeof object[key] === 'object' ? sortKeys(object[key]) : object[key]]),
    );
  return JSON.stringify(sortKeys(measured), null, 2) + '\n';
};

const summary = (measured) =>
  Object.entries(measured)
    .map(([family, members]) => `${family} ${Object.keys(members).length}`)
    .join(', ');

function run({ update, acceptRise }) {
  const current = measure(ROOT);
  if (!existsSync(BASELINE) && !update) {
    console.error(
      `[verify:public-types] FAIL — no baseline at ${relative(ROOT, BASELINE)}; run with --update-baseline`,
    );
    return 1;
  }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  const risen = rises(current, baseline);
  const report = (list) => {
    for (const { family, member, category, was, now } of list)
      console.error(`  ${family} ${member} ${category}: ${was} -> ${now}`);
  };
  if (update) {
    if (existsSync(BASELINE) && risen.length && !acceptRise) {
      report(risen);
      console.error(
        '[verify:public-types] refusing to raise the baseline; type the new surface, or pass --accept-rise',
      );
      return 1;
    }
    writeFileSync(BASELINE, sortedJson(current));
    console.log(`[verify:public-types] baseline written: ${total(current)} (loose members: ${summary(current)})`);
    return 0;
  }
  if (risen.length) {
    console.error(`[verify:public-types] FAIL — ${risen.length} public type count(s) rose:`);
    report(risen);
    console.error('A public type loosened here can only be tightened again in a major. Type the new surface.');
    return 1;
  }
  const fallen = total(baseline) - total(current);
  console.log(
    `[verify:public-types] OK — ${total(current)} (loose members: ${summary(current)})` +
      (fallen > 0 ? ` (${fallen} below baseline; lower it with --update-baseline)` : ''),
  );
  return 0;
}

function selfTest() {
  const failures = [];
  // A planted program: a namespace of functions and a model type, each loose in exactly one known way.
  const planted = [
    'type ResultType = { context?: Record<string, unknown>; error?: string };',
    'export const Tools = {',
    '  anyParam: (x: any): string => String(x),',
    '  anyResult: (x: string): any => x,',
    '  anyKey: (p: { a: any; b: string }): { r: any } => ({ r: p.a }),',
    '  indexed: (p: { [k: string]: number }): { [k: string]: string } => ({}),',
    '  fallback: (...args: any[]): any => args,',
    '  tight: (p: { a: string }): { r: number } => ({ r: p.a.length }),',
    '  enveloped: (): ResultType & { r: number } => ({ r: 1 }),',
    '  ownIndex: (): ResultType & { byId: { [id: string]: number } } => ({ byId: {} }),',
    '};',
    'export type Types = never;',
  ].join('\n');
  const measured = measure(ROOT, planted).tools;
  const expect = (member, category, wanted) => {
    const got = measured[member]?.[category] ?? 0;
    if (got !== wanted) failures.push(`${member} ${category}: expected ${wanted}, got ${got}`);
  };
  expect('anyParam', 'param:any', 1);
  expect('anyResult', 'ret:any', 1);
  expect('anyKey', 'param:keys', 1);
  expect('anyKey', 'ret:keys', 1);
  expect('indexed', 'param:index', 1);
  expect('indexed', 'ret:index', 1);
  expect('fallback', 'fallback', 1);
  if (measured.tight) failures.push(`tight: expected no counts, got ${JSON.stringify(measured.tight)}`);
  // the shared envelope's context is counted once, on types.ResultType, not on each method returning it ...
  if (measured.enveloped) failures.push(`enveloped: expected no counts, got ${JSON.stringify(measured.enveloped)}`);
  // ... while an index declared on the method's own success shape still counts on the method
  expect('ownIndex', 'ret:index', 1);
  // the rule: a rise fires, a fall and an unchanged count do not, a new loose member fires
  const base = { tools: { a: { 'ret:any': 1 }, b: { 'ret:keys': 2 } } };
  if (rises({ tools: { a: { 'ret:any': 1 }, b: { 'ret:keys': 1 } } }, base).length)
    failures.push('a fall was reported');
  if (rises({ tools: { b: { 'ret:keys': 3 } } }, base).length !== 1) failures.push('a rise was not reported');
  if (rises({ tools: { c: { 'param:any': 1 } } }, base).length !== 1) failures.push('a new member was not reported');
  if (failures.length) {
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('[verify:public-types] self-test FAILED');
    return 1;
  }
  console.log(
    '[verify:public-types] self-test OK — each category fires on a planted program; rises fire, falls do not',
  );
  return 0;
}

const args = process.argv.slice(2);
let code = 0;
if (args.includes('--self-test')) code = selfTest();
if (!code) code = run({ update: args.includes('--update-baseline'), acceptRise: args.includes('--accept-rise') });
process.exit(code);

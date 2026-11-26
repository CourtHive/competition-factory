#!/usr/bin/env node

// Execute every documented generateTournamentRecord fence (mocksEngine or mocksGovernor) against the built package.
//
// A mock generation needs no state but its own arguments, and the generator refuses an unknown key and reports a
// setup it cannot build, so a fence runs as written and fails on its own: a thrown error, or any generation in it that
// returns `error`. docExamples.mjs checks 22 hand-picked fences for their results; this one checks every mock fence
// only for running at all.
//
// A fence that builds on code outside itself (a variable from an earlier fence, a placeholder) is marked with
// `<!-- doc-mock-examples:ignore -->` on one of the two lines above it. Failures already known are listed in
// docMockExamples.baseline.json, which only shrinks: fix the page, then rerun with --update-baseline.

import { REPO_ROOT } from '../lib/repoRoot.mjs';
import { createRequire } from 'node:module';
import { expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = path.join(REPO_ROOT, 'documentation', 'docs');
const BASELINE = path.join(ROOT, 'scripts', 'verify', 'docMockExamples.baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
const VERBOSE = process.argv.includes('--verbose');

const require = createRequire(import.meta.url);
const factory = require(path.join(ROOT, 'dist/tods-competition-factory.development.cjs.js'));
// the catalogue package's build (verify:catalogue builds it): its named formats and organisation policies
const catalogue = require(path.join(ROOT, '../competition-catalogue/dist/index.cjs'));

const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;
const FENCE = /^```(?:js|javascript|ts|typescript|jsx|tsx)\b/;
const IGNORE = /doc-mock-examples:ignore/;
const SELECT = /(?:mocksEngine|mocksGovernor)\s*\.\s*generateTournamentRecord\s*\(/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.mdx?$/.test(entry.name)) yield full;
  }
}

function fencesOf(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const fences = [];
  let open = null;
  lines.forEach((line, index) => {
    if (open) {
      if (/^```\s*$/.test(line)) {
        fences.push(open);
        open = null;
      } else open.lines.push(line);
      return;
    }
    if (FENCE.test(line)) {
      const ignored = IGNORE.test(lines.slice(Math.max(0, index - 2), index).join('\n'));
      open = { line: index + 1, ignored, lines: [] };
    }
  });
  return fences.map((fence) => ({ ...fence, code: fence.lines.join('\n') })).filter((fence) => SELECT.test(fence.code));
}

const PACKAGE = 'tods-competition-factory';
const CATALOGUE = '@courthive/competition-catalogue';

// Names a page uses without importing them, as the docs do for brevity: every constant (ROUND_ROBIN, MALE), every
// policy fixture, and the catalogue package's exports (resolveTieFormat, its policies and tie format names). The
// package's own exports win a collision.
const constants = Object.fromEntries(
  Object.keys(factory)
    .filter((name) => /Constants$/.test(name) && factory[name] && typeof factory[name] === 'object')
    .flatMap((name) => Object.entries(factory[name])),
);
const implicit = {
  ...constants,
  ...catalogue.tieFormatConstants,
  ...catalogue,
  ...factory.fixtures?.policies,
  ...factory,
};

// A fence may be written as a test: test/it/describe run their callback at once, beforeEach runs before each test, and
// expect is vitest's own, so a documented assertion that no longer holds fails here too.
function testHarness(pending) {
  const before = [];
  const call = (fn) =>
    fn &&
    pending.push(
      Promise.resolve().then(async () => {
        for (const hook of before) await hook();
        await fn();
      }),
    );
  const test = (_name, fn) => call(fn);
  test.each = (rows) => (_name, fn) => rows.forEach((row) => call(() => fn(...(Array.isArray(row) ? row : [row]))));
  test.skip = () => undefined;
  test.todo = () => undefined;
  const describe = (_name, fn) => fn();
  describe.each = (rows) => (_name, fn) => rows.forEach((row) => fn(...(Array.isArray(row) ? row : [row])));
  return {
    test,
    it: test,
    describe,
    expect,
    beforeEach: (fn) => before.push(fn),
    afterEach: () => undefined,
    beforeAll: (fn) => fn(),
    afterAll: () => undefined,
  };
}

// An import from the package (or the catalogue package) becomes a destructure of it; an import from anywhere else is
// a reader's dead end (an internal alias such as @Fixtures, a relative path) and fails the fence.
function rewriteImports(code) {
  const outside = [];
  const rewritten = code.replace(
    /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm,
    (_statement, typeOnly, clause, source) => {
      if (source === 'vitest') return '';
      if (source !== PACKAGE && source !== CATALOGUE) {
        outside.push(source);
        return '';
      }
      const from = source === CATALOGUE ? '__catalogue' : '__package';
      if (typeOnly) return '';
      const named = clause.match(/\{([\s\S]*)\}/)?.[1];
      const bindings = (named ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith('type '))
        .map((part) => part.replace(/\s+as\s+/, ': '));
      const whole = clause
        .replace(/\{[\s\S]*\}/, '')
        .replace(/,/g, '')
        .replace(/\*\s+as\s+/, '')
        .trim();
      return [whole && `const ${whole} = ${from};`, bindings.length && `const { ${bindings.join(', ')} } = ${from};`]
        .filter(Boolean)
        .join(' ');
    },
  );
  return { code: rewritten, outside };
}

// The fence runs with a mocksEngine whose generateTournamentRecord keeps each result, so an `error` the fence ignores
// is still seen.
async function run(code) {
  const { code: body, outside } = rewriteImports(code);
  if (outside.length) return `imports from outside the package: ${[...new Set(outside)].join(', ')}`;
  const results = [];
  const recorded =
    (generate) =>
    (...args) => {
      const result = generate(...args);
      results.push(result);
      return result;
    };
  const mocksEngine = Object.create(factory.mocksEngine);
  mocksEngine.generateTournamentRecord = recorded(factory.mocksEngine.generateTournamentRecord);
  const mocksGovernor = {
    ...factory.mocksGovernor,
    generateTournamentRecord: recorded(factory.mocksGovernor.generateTournamentRecord),
  };
  const pending = [];
  const recording = { mocksEngine, mocksGovernor };
  const scope = {
    ...implicit,
    ...testHarness(pending),
    ...recording,
    __package: { ...factory, ...recording },
    __catalogue: catalogue,
  };
  const js = ts.transpileModule(body.replace(/^\s*export\s+(?=const|let|function|async|class)/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const quiet = { log() {}, info() {}, warn() {}, table() {}, dir() {}, error() {} };
  try {
    factory.tournamentEngine.reset?.();
    await new AsyncFunction('scope', 'console', `with (scope) {\n${js}\n}`)(scope, quiet);
    for (const test of pending) await test;
  } catch (error) {
    const kind = error instanceof ReferenceError || error instanceof SyntaxError ? 'needs outside code' : 'throws';
    return `${kind}: ${String(error?.message ?? error).split('\n')[0]}`;
  }
  // A fence that shows a refusal says so (`// result.error -> INVALID_VALUES`): that error must come back, and only it.
  const documented = [...code.matchAll(/\.error\s*->\s*(\w+)/g)].map(([, name]) => name.replace(/^ERR_/, ''));
  const codeOf = (result) => String(result.error.code ?? result.error.message ?? JSON.stringify(result.error));
  const errors = results.filter((result) => result?.error).map((result) => codeOf(result).replace(/^ERR_/, ''));
  const unexpected = errors.find((error) => !documented.includes(error));
  if (unexpected) return `generation error: ${unexpected}`;
  const missing = documented.find((name) => !errors.includes(name));
  if (missing) return `documents error ${missing}, none returned`;
  if (!results.length) return 'no generation ran';
  return undefined;
}

const failures = [];
let checked = 0;
let ignored = 0;
for (const file of walk(DOCS)) {
  for (const fence of fencesOf(file)) {
    if (fence.ignored) {
      ignored += 1;
      continue;
    }
    checked += 1;
    const reason = await run(fence.code);
    if (reason) failures.push({ where: `${path.relative(REPO_ROOT, file)}:${fence.line}`, reason });
  }
}

console.log(`[docs-mock-examples] ${checked} fence(s) run` + (ignored ? `; ${ignored} ignored` : ''));

// keyed without the line number, so an edit above a known failure does not make it new
const key = ({ where, reason }) => JSON.stringify([where.replace(/:\d+$/, ''), reason]);
const tally = (keys) => keys.reduce((counts, k) => counts.set(k, (counts.get(k) ?? 0) + 1), new Map());

if (UPDATE) {
  const entries = failures.map(key).sort();
  const baseline = {
    comment:
      'Documented mocksEngine fences that fail when run. Shrink this by fixing them — never grow it to silence a ' +
      'finding. Regenerate: pnpm verify:docs-mock-examples --update-baseline',
    generated: 'node scripts/verify/docMockExamples.mjs --update-baseline',
    count: entries.length,
    entries,
  };
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`[docs-mock-examples] baseline rewritten with ${entries.length} entr(ies)`);
  process.exit(0);
}

const known = tally(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries : []);
const fresh = failures.filter((failure) => {
  const k = key(failure);
  const left = known.get(k) ?? 0;
  known.set(k, left - 1);
  return left <= 0;
});
const fixed = [...known.values()].filter((left) => left > 0).reduce((sum, left) => sum + left, 0);
if (VERBOSE) for (const failure of failures) console.log(`  ${failure.where}  ${failure.reason}`);
if (fixed) console.log(`[docs-mock-examples] ${fixed} baseline entr(ies) now pass — rerun with --update-baseline`);
if (fresh.length) {
  console.error(`[docs-mock-examples] ${fresh.length} new failing fence(s):`);
  for (const failure of fresh) console.error(`  ${failure.where}  ${failure.reason}`);
  console.error(
    'Fix the example. A fence that builds on code outside itself is marked ' +
      '`<!-- doc-mock-examples:ignore -->` rather than baselined.',
  );
  process.exit(1);
}
console.log(`[docs-mock-examples] OK — ${failures.length} known, 0 new`);

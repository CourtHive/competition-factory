#!/usr/bin/env node
/**
 * verify:score-entry-state — `tods-competition-factory/score-entry-state` reaches only score-entry and scoring code.
 *
 * WHY THIS EXISTS
 * The subpath is a headless score-entry draft that a browser, a worker or a Node process holds WITHOUT a tournament
 * engine. Its value is the graph it does not load: no root barrel, no engine, no global engine state, no async_hooks,
 * no DOM, no other package. That graph is one import away from breaking: on 2026-11-19 even `matchUpFormatCode.parse`
 * reached `global/state/globalState` (through `tools/definedAttributes` and `tools/math` → `tools/prng`), and nothing
 * would have noticed. `verify:layers` cannot see it: those edges are the five it already allows.
 *
 * WHAT IT CHECKS
 *   1. source — every module the entry `src/scoreEntryState/index.ts` reaches at runtime (esbuild's resolution through
 *      tsconfig paths; type-only imports erase) lies under an ALLOWED directory and under no FORBIDDEN path.
 *   2. built ESM — a consumer bundle of `dist/esm/scoreEntryState/index.mjs` for the browser: the same rules over the
 *      dist tree, and no `document`, `window`, `process`, `require(` or Node builtin in the output. A minimal
 *      consumer (create, type a digit, read the score) is measured too, in bytes, and its modules listed.
 *   3. built CJS — the sources of `dist/score-entry-state/*.cjs.js` (its sourcemap) under the same rules.
 *   4. declarations — `dist/score-entry-state.d.ts` imports nothing: it declares the draft alone.
 * Steps 2–4 need `pnpm build`; without a dist they fail rather than pass.
 *
 * Run:        pnpm verify:score-entry-state            (--list prints every module of each graph)
 * Self-test:  pnpm verify:score-entry-state --self-test (plants a global-state import, an engine, async_hooks, the
 *             root barrel and a DOM read, and asserts each one FIRES; then that the real entry is quiet)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_ENTRY = join(ROOT, 'src/scoreEntryState/index.ts');
const ESM_ENTRY = join(ROOT, 'dist/esm/scoreEntryState/index.mjs');
const CJS_MAP = join(ROOT, 'dist/score-entry-state/score-entry-state.development.cjs.js.map');
const DTS = join(ROOT, 'dist/score-entry-state.d.ts');
const LIST = process.argv.includes('--list');

/** Where the draft and the scoring rules it reads live, under `src/` or `dist/esm/`. Nothing else may load. */
const ALLOWED = [
  'scoreEntryState/',
  'scoring/kernel/',
  'scoring/analysis/',
  'scoring/views/',
  'helpers/matchUpFormatCode/',
  'query/matchUp/',
  'constants/',
  'tools/numeric',
  'tools/objects',
  'tools/ensureInt',
];

/** Named so a failure says what was reached, and checked even under an allowed directory. */
const FORBIDDEN = [
  [/(^|\/)global\//, 'global engine state'],
  [/(^|\/)functions\/global\//, 'the global log'],
  [/(^|\/)assemblies\//, 'an engine, governor, generator or assembly tool'],
  [/^index\.(ts|mjs)$/, 'the root barrel'],
  [/(^|\/)(mutate|forge|server|examples|acquire)\//, 'mutation, forge, server or acquisition code'],
  [/tools\/(prng|clock|definedAttributes|makeDeepCopy|UUID)/, 'a tool that reads engine state'],
  [/async_hooks|^node:|^(fs|path|crypto|os|child_process)$/, 'a Node builtin'],
  [/node_modules\//, 'another package'],
];

const DOM_OR_NODE = [
  [/\bdocument\./, 'document'],
  [/\bwindow\./, 'window'],
  [/\bprocess\./, 'process'],
  [/\brequire\(/, 'require('],
];

/** A module path relative to `src/` or `dist/esm/`, or the raw path for anything outside both. */
function areaPath(path) {
  const absolute = resolve(ROOT, path);
  for (const base of ['src', 'dist/esm']) {
    const rel = relative(join(ROOT, base), absolute);
    if (!rel.startsWith('..')) return rel.split('\\').join('/');
  }
  return path;
}

/** The violations among a graph's modules. */
export function judge(modules) {
  const violations = [];
  for (const module of modules) {
    if (module === '<stdin>') continue;
    const path = areaPath(module);
    const forbidden = FORBIDDEN.find(([pattern]) => pattern.test(path));
    if (forbidden) violations.push(`${path} — ${forbidden[1]}`);
    else if (!ALLOWED.some((prefix) => path.startsWith(prefix))) violations.push(`${path} — outside the allowed areas`);
  }
  return violations;
}

/** DOM or Node references in a bundle's text. */
export function hostReferences(text) {
  return DOM_OR_NODE.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
}

async function graph({ entry, contents, resolveDir, platform = 'neutral', minify = false }) {
  const result = await build({
    ...(contents === undefined ? { entryPoints: [entry] } : { stdin: { contents, resolveDir, loader: 'ts' } }),
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform,
    minify,
    treeShaking: true,
    tsconfig: join(ROOT, 'tsconfig.json'),
    logLevel: 'silent',
    // an unresolvable or external import is still a graph edge: keep it visible as a module rather than failing
    plugins: [externalsAsModules()],
  });
  const text = result.outputFiles[0].text;
  return { modules: Object.keys(result.metafile.inputs), text, bytes: Buffer.byteLength(text) };
}

/** Bare and builtin imports become named empty modules, so `judge` sees them instead of esbuild refusing them. */
function externalsAsModules() {
  return {
    name: 'externals-as-modules',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^(node:|async_hooks$|fs$|path$|crypto$|os$|child_process$)/ }, (args) => ({
        path: args.path,
        namespace: 'external',
      }));
      pluginBuild.onLoad({ filter: /.*/, namespace: 'external' }, () => ({ contents: 'export default {};' }));
    },
  };
}

function report(name, violations, extra = '') {
  if (violations.length) {
    console.error(`[score-entry-state] ${name}: ${violations.length} violation(s)\n  ${violations.join('\n  ')}`);
    return false;
  }
  console.log(`[score-entry-state] ${name}: OK${extra}`);
  return true;
}

function listed(modules) {
  if (!LIST) return;
  for (const module of modules
    .filter((m) => m !== '<stdin>')
    .map(areaPath)
    .sort())
    console.log(`    ${module}`);
}

async function checkSource() {
  const { modules } = await graph({ entry: SRC_ENTRY });
  listed(modules);
  return report('source graph', judge(modules), ` — ${modules.length} modules`);
}

async function checkBuilt() {
  const missing = [ESM_ENTRY, CJS_MAP, DTS].filter((file) => !existsSync(file));
  if (missing.length) {
    return report(
      'built artifacts',
      missing.map((file) => `${relative(ROOT, file)} — missing: run pnpm build`),
    );
  }

  let ok = true;
  const full = await graph({ entry: ESM_ENTRY, platform: 'browser', minify: true });
  listed(full.modules);
  ok =
    report(
      'built ESM, whole namespace',
      [...judge(full.modules), ...hostReferences(full.text).map((name) => `bundle references ${name}`)],
      ` — ${full.modules.length} modules, ${full.bytes} B min / ${gzipSync(full.text, { level: 9 }).length} B gzip`,
    ) && ok;

  // the narrowest real consumer: open a draft, type a digit, read the score
  const minimal = await graph({
    contents: `import { createScoreEntryModel, typeDigit, scoreString } from '${ESM_ENTRY}';
console.log(scoreString(typeDigit(createScoreEntryModel(), { cell: { setIndex: 0, side: 1, kind: 'games' }, digit: 4, complement: true })));`,
    resolveDir: ROOT,
    platform: 'browser',
    minify: true,
  });
  listed(minimal.modules);
  ok =
    report(
      'built ESM, minimal consumer',
      [...judge(minimal.modules), ...hostReferences(minimal.text).map((name) => `bundle references ${name}`)],
      ` — ${minimal.modules.length - 1} modules, ${minimal.bytes} B min / ${gzipSync(minimal.text, { level: 9 }).length} B gzip`,
    ) && ok;

  // rollup writes each source relative to where it ran, not to the map: read them from their `src/` segment on
  const sources = JSON.parse(readFileSync(CJS_MAP, 'utf8')).sources.map((source) => {
    const at = source.lastIndexOf('src/');
    return at === -1 ? source : source.slice(at);
  });
  ok = report('built CJS', judge(sources), ` — ${sources.length} source modules`) && ok;

  const imports = [...readFileSync(DTS, 'utf8').matchAll(/^\s*(import|export)\s[^;]*\bfrom\s+['"]([^'"]+)['"]/gm)];
  ok =
    report(
      'declarations',
      imports.map(([, , from]) => `score-entry-state.d.ts imports ${from}`),
      ' — self-contained',
    ) && ok;
  return ok;
}

/** Each planted import must fire; the real entry must not. A guard that cannot fail proves nothing. */
async function selfTest() {
  const resolveDir = join(ROOT, 'src/scoreEntryState');
  const plants = {
    'global engine state': `export * from './index'; import '@Global/state/globalState';`,
    'an engine': `export * from './index'; import '@Assemblies/engines/sync';`,
    async_hooks: `export * from './index'; import 'node:async_hooks';`,
    'the root barrel': `export * from './index'; import '../index';`,
    'a tool that reads engine state': `export * from './index'; import '@Tools/prng';`,
    'outside the allowed areas': `export * from './index'; import '@Helpers/scheduling/bookingId';`,
  };
  let ok = true;
  for (const [name, contents] of Object.entries(plants)) {
    const { modules } = await graph({ contents, resolveDir });
    const fired = judge(modules).some((violation) => violation.includes(name));
    if (!fired) console.error(`[score-entry-state] self-test: a planted import of ${name} did NOT fire`);
    ok = ok && fired;
  }
  const dom = hostReferences('const a = document.createElement("div");');
  if (!dom.includes('document')) console.error('[score-entry-state] self-test: a DOM read did NOT fire');
  ok = ok && dom.includes('document');

  const quiet = judge((await graph({ entry: SRC_ENTRY })).modules);
  if (quiet.length)
    console.error(`[score-entry-state] self-test: the real entry is not quiet:\n  ${quiet.join('\n  ')}`);
  ok = ok && !quiet.length;

  console.log(`[score-entry-state] self-test ${ok ? 'OK' : 'FAILED'} — ${Object.keys(plants).length + 1} plants fired`);
  return ok;
}

const ok = process.argv.includes('--self-test') ? await selfTest() : (await checkSource()) & (await checkBuilt());
process.exit(ok ? 0 : 1);

#!/usr/bin/env node
/**
 * verify:layers — imports into a higher layer may only go DOWN.
 *
 * WHY THIS EXISTS
 * Measured 2026-11-05 on dev `8f5eb05a9e`: 94 of the factory's 119 source directory groups formed one import
 * cycle, held together by 181 runtime imports into higher layers. Nothing can become a package while that holds.
 * Mentat/planning/FACTORY_LAYERING_PLAN.md moves each of those imports' code to its best home; this ratchet stops
 * new ones landing while it does, and holds the result at 0 afterwards.
 *
 * THE LAYERS (lowest first; the plan's table, as data in LAYERS below)
 *   0    contracts     constants, types, errors
 *   1    primitives    tools, fixtures
 *   2.1  formats       helpers/matchUpFormatCode, helpers/tieFormats
 *   2.2  scoring       scoring
 *   2.3  domain        other helpers (drawTopology, scheduling, ratings, outcome among them), functions, global,
 *                      validators
 *   3    queries       query, acquire, analyze
 *   4    mutations     mutate
 *   5    generators    assemblies/generators
 *   6    assemblies    assemblies/governors, assemblies/engines, assemblies/tools, forge, index.ts, examples
 * A file takes the layer of the LONGEST matching prefix of its path under `src/`. Groups that do not exist yet
 * (scoring, helpers/drawTopology, ...) are mapped ahead of time, so a move into them is checked on arrival.
 *
 * WHAT IT COUNTS
 * Production source only: `src/**` `.ts`/`.js`, without tests (`tests/`, `__tests__/`, `*.test.ts`, `*.spec.ts`),
 * `scratch/`, the dev server harness (`src/server/`) and gitignored paths. An edge is a static import or
 * re-export, or a literal `import()`/`require()`, that resolves (relative or through tsconfig.base.json `paths`)
 * to another production file. Type-only edges are excluded: `import type`, `export type`, and a statement whose
 * every named binding is `type`-qualified. A VIOLATION is an edge into a higher layer. An edge from production
 * source into a test harness or the dev server counts as a violation too (layer "outside production source"):
 * shipped code must not live there.
 *
 * THE RULE
 * The baseline holds every violating edge as `from -> to` with its multiplicity. A key whose count RISES above
 * the baseline fails, so a new violation fails even when another was removed and the total holds. A baseline
 * key the source no longer has also fails: lower the baseline in the PR that removes the violation
 * (`--update-baseline`), or the removed import could come back unseen. `--update-baseline` refuses to write a
 * rise unless `--accept-rise` is also given.
 * A production file outside every layer fails (give its directory a layer here), and so does an internal import
 * that resolves to nothing: an edge the probe cannot see is a violation it cannot count.
 *
 * Run:        pnpm verify:layers
 * Lower:      node scripts/verify/layers.mjs --update-baseline
 * Report:     node scripts/verify/layers.mjs --list     (every violation, grouped by layer pair)
 * Self-test:  node scripts/verify/layers.mjs --self-test (plants violations and asserts each one FIRES)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts', 'verify', 'baseline', 'layers.json');
const ts = createRequire(import.meta.url)(join(ROOT, 'node_modules', 'typescript'));

/** `[layer, name, prefixes]`: a prefix is a path under `src/`, matched on whole segments. */
export const LAYERS = [
  [0, 'contracts', ['constants', 'types', 'errors']],
  [1, 'primitives', ['tools', 'fixtures']],
  [2.1, 'formats', ['helpers/matchUpFormatCode', 'helpers/tieFormats']],
  [2.2, 'scoring', ['scoring']],
  [
    2.3,
    'domain helpers and rules',
    [
      'helpers',
      'helpers/drawTopology',
      'helpers/scheduling',
      'helpers/ratings',
      'helpers/outcome',
      'functions',
      'global',
      'validators',
    ],
  ],
  [3, 'queries', ['query', 'acquire', 'analyze']],
  [4, 'mutations', ['mutate']],
  [5, 'generators', ['assemblies/generators']],
  [
    6,
    'assemblies',
    ['assemblies/governors', 'assemblies/engines', 'assemblies/tools', 'forge', 'index.ts', 'examples'],
  ],
];

const PREFIXES = LAYERS.flatMap(([layer, name, prefixes]) => prefixes.map((prefix) => ({ prefix, layer, name }))).sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

const toPosix = (path) => path.split(sep).join('/');

/** Production code importing a test harness or the dev server: above every layer, so always a violation. */
const OUTSIDE = { prefix: '', layer: Infinity, name: 'outside production source' };

/** The layer of a path relative to `src/` (posix), or undefined when no prefix matches. */
export function layerOf(srcPath) {
  if (excluded(srcPath)) return OUTSIDE;
  return PREFIXES.find(({ prefix }) => srcPath === prefix || srcPath.startsWith(`${prefix}/`));
}

function excluded(srcPath) {
  return (
    /(^|\/)(tests?|__tests__|scratch)\//.test(srcPath) ||
    srcPath.startsWith('server/') ||
    /\.(test|spec)\.ts$/.test(srcPath) ||
    srcPath.endsWith('.d.ts')
  );
}

/** Untracked paths under `src` that `.gitignore` ignores (posix, relative to `rootDir`); none outside a checkout. */
function gitIgnored(rootDir) {
  try {
    const out = execFileSync(
      'git',
      ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory', 'src'],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 60_000,
        killSignal: 'SIGKILL',
      },
    );
    return out.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function productionFiles(rootDir) {
  const srcDir = join(rootDir, 'src');
  const ignored = gitIgnored(rootDir);
  const isIgnored = (rel) => ignored.some((entry) => rel === entry || (entry.endsWith('/') && rel.startsWith(entry)));
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = toPosix(relative(rootDir, full));
      if (isIgnored(entry.isDirectory() ? `${rel}/` : rel)) continue;
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|js)$/.test(entry.name) && !excluded(toPosix(relative(srcDir, full)))) files.push(full);
    }
  };
  walk(srcDir);
  return files;
}

function aliasesOf(rootDir) {
  const config = ts.readConfigFile(join(rootDir, 'tsconfig.base.json'), ts.sys.readFile).config;
  const paths = config?.compilerOptions?.paths ?? {};
  return Object.entries(paths).map(([key, [target]]) => ({
    prefix: key.replace(/\*$/, ''),
    target: target.replace(/\*$/, ''),
  }));
}

/** Every type-only form: `import type`, `export type`, or every named binding `type`-qualified (and no default). */
function isTypeOnly(node) {
  if (node.isTypeOnly || node.importClause?.isTypeOnly) return true;
  const named = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
  if (!named || (ts.isImportDeclaration(node) && node.importClause?.name)) return false;
  const elements = ts.isNamedImports(named) || ts.isNamedExports(named) ? named.elements : undefined;
  return !!elements?.length && elements.every((element) => element.isTypeOnly);
}

/** `{ files, edges: [{ from, to }], unresolved: [{ from, specifier }] }`, paths relative to `src/` (posix). */
export function collectEdges(rootDir) {
  const srcDir = join(rootDir, 'src');
  const files = productionFiles(rootDir);
  const known = new Set(files);
  const aliases = aliasesOf(rootDir);
  const srcRel = (file) => toPosix(relative(srcDir, file));
  const internal = (specifier) =>
    specifier.startsWith('.') || aliases.some(({ prefix }) => specifier.startsWith(prefix));

  const resolveSpecifier = (from, specifier) => {
    let base;
    if (specifier.startsWith('.')) base = resolve(dirname(from), specifier);
    else {
      const alias = aliases.find(({ prefix }) => specifier.startsWith(prefix));
      base = resolve(rootDir, alias.target + specifier.slice(alias.prefix.length));
    }
    const candidates = [base, `${base}.ts`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.js')];
    if (/\.[cm]?js$/.test(base)) candidates.push(base.replace(/\.[cm]?js$/, '.ts'));
    const found = candidates.find(
      (candidate) => known.has(candidate) || (/\.(ts|js)$/.test(candidate) && existsSync(candidate)),
    );
    // null: a non-code asset (JSON and the like) that exists; it has no layer and imports nothing
    return found ?? (existsSync(base) && !/\.(ts|js)$/.test(base) ? null : undefined);
  };

  const edges = [];
  const unresolved = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const add = (specifier) => {
      if (!internal(specifier)) return;
      const target = resolveSpecifier(file, specifier);
      if (target === undefined) unresolved.push({ from: srcRel(file), specifier });
      else if (target) edges.push({ from: srcRel(file), to: srcRel(target) });
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        if (!isTypeOnly(node)) add(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        add(node.arguments[0].text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { files: files.map(srcRel), edges, unresolved };
}

/** `{ violations: { 'from -> to': n }, unlayered: [file] }` */
export function measure(rootDir) {
  const { files, edges, unresolved } = collectEdges(rootDir);
  const unlayered = files.filter((file) => !layerOf(file)).sort((a, b) => a.localeCompare(b));
  const violations = {};
  for (const { from, to } of edges) {
    const a = layerOf(from);
    const b = layerOf(to);
    if (a && b && b.layer > a.layer) {
      const key = `${from} -> ${to}`;
      violations[key] = (violations[key] ?? 0) + 1;
    }
  }
  return { files: files.length, edges: edges.length, violations, unlayered, unresolved };
}

const total = (counts) => Object.values(counts).reduce((sum, n) => sum + n, 0);

/** Keys above their baseline count (absent counts as 0), and baseline keys the source no longer has. */
export function compare(current, baseline) {
  const risen = Object.keys(current)
    .filter((key) => current[key] > (baseline[key] ?? 0))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, was: baseline[key] ?? 0, now: current[key] }));
  const stale = Object.keys(baseline)
    .filter((key) => (current[key] ?? 0) < baseline[key])
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, was: baseline[key], now: current[key] ?? 0 }));
  return { risen, stale };
}

const sortedJson = (counts) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(counts)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, counts[key]]),
    ),
    null,
    2,
  ) + '\n';

function layerPair(key) {
  const [from, to] = key.split(' -> ');
  return `${layerOf(from).layer} ${layerOf(from).name} -> ${layerOf(to).layer} ${layerOf(to).name}`;
}

function list(violations) {
  const byPair = {};
  for (const key of Object.keys(violations).sort((a, b) => a.localeCompare(b))) {
    (byPair[layerPair(key)] ??= []).push(violations[key] > 1 ? `${key} (x${violations[key]})` : key);
  }
  for (const pair of Object.keys(byPair).sort((a, b) => a.localeCompare(b))) {
    console.log(`\n${pair}: ${byPair[pair].length}`);
    for (const line of byPair[pair]) console.log(`  ${line}`);
  }
}

function run({ update, acceptRise, showList }) {
  const { files, edges, violations, unlayered, unresolved } = measure(ROOT);
  const tag = '[verify:layers]';
  if (!files || !edges) {
    console.error(`${tag} FAIL — read ${files} files and ${edges} edges; the walk found nothing to check`);
    return 1;
  }
  if (unlayered.length || unresolved.length) {
    for (const file of unlayered) console.error(`  unlayered: src/${file}`);
    for (const { from, specifier } of unresolved) console.error(`  unresolved: src/${from} imports '${specifier}'`);
    console.error(
      `${tag} FAIL — ${unlayered.length} file(s) outside every layer, ${unresolved.length} import(s) that resolve to nothing. ` +
        'Give a new directory a layer in LAYERS (scripts/verify/layers.mjs); fix or remove a dead import.',
    );
    return 1;
  }
  if (showList) list(violations);

  if (!existsSync(BASELINE) && !update) {
    console.error(`${tag} FAIL — no baseline at ${relative(ROOT, BASELINE)}; run with --update-baseline`);
    return 1;
  }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  const { risen, stale } = compare(violations, baseline);

  if (update) {
    if (existsSync(BASELINE) && risen.length && !acceptRise) {
      for (const { key, was, now } of risen) console.error(`  ${key}: ${was} -> ${now}`);
      console.error(`${tag} refusing to raise the baseline; move the code to its layer, or pass --accept-rise`);
      return 1;
    }
    writeFileSync(BASELINE, sortedJson(violations));
    console.log(`${tag} baseline written: ${total(violations)} violating import(s)`);
    return 0;
  }

  if (risen.length) {
    console.error(`${tag} FAIL — ${risen.length} import(s) into a higher layer that the baseline does not hold:`);
    for (const { key, was, now } of risen)
      console.error(`  ${key}  [${layerPair(key)}]${was ? `  ${was} -> ${now}` : ''}`);
    console.error(
      'An import may point only to its own layer or a lower one (Mentat/planning/FACTORY_LAYERING_PLAN.md). ' +
        'Put the code where it belongs by responsibility rather than importing upward.',
    );
    return 1;
  }
  if (stale.length) {
    for (const { key, was, now } of stale) console.error(`  ${key}: ${was} -> ${now}`);
    console.error(
      `${tag} FAIL — ${stale.length} baseline entr${stale.length === 1 ? 'y is' : 'ies are'} gone from the source. ` +
        'Lower the baseline in this PR: node scripts/verify/layers.mjs --update-baseline',
    );
    return 1;
  }
  console.log(
    `${tag} OK — ${total(violations)} import(s) into a higher layer, none new (${files} files, ${edges} edges)`,
  );
  return 0;
}

function selfTest() {
  const failures = [];
  const expect = (label, actual, wanted) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted))
      failures.push(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
  };

  expect('longest prefix wins', layerOf('helpers/matchUpFormatCode/parse.ts').layer, 2.1);
  expect('other helpers are domain', layerOf('helpers/coercedGender.ts').layer, 2.3);
  expect('a group mapped ahead of time', layerOf('scoring/kernel/score.ts').layer, 2.2);
  expect('whole segments only', layerOf('toolsExtra/x.ts'), undefined);
  expect('index.ts is assemblies', layerOf('index.ts').layer, 6);
  expect('an unmapped assemblies directory', layerOf('assemblies/other/x.ts'), undefined);

  const dir = mkdtempSync(join(tmpdir(), 'verify-layers-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  try {
    write(
      'tsconfig.base.json',
      JSON.stringify({ compilerOptions: { paths: { '@Query/*': ['./src/query/*'], '@Tools/*': ['./src/tools/*'] } } }),
    );
    write('src/query/read.ts', 'export const read = 1;\nexport type Read = number;\n');
    write('src/tools/up.ts', "import { read } from '@Query/read';\nexport const up = read;\n");
    write(
      'src/tools/typeOnly.ts',
      "import type { Read } from '@Query/read';\nimport { type Read as R } from '../query/read';\nexport type T = Read | R;\n",
    );
    write('src/tools/reexport.ts', "export { read } from '../query/read';\n");
    write('src/tools/dynamic.ts', "export const later = () => import('../query/read');\n");
    write('src/tools/down.ts', "import { up } from './up';\nexport const down = up;\n");
    write(
      'src/helpers/matchUpFormatCode/format.ts',
      "import { score } from '../../scoring/score';\nexport const format = score;\n",
    );
    write('src/scoring/score.ts', 'export const score = 1;\n');
    write('src/tools/up.test.ts', "import { read } from '@Query/read';\n");
    write('src/tests/harness.ts', "import { read } from '@Query/read';\n");
    write('src/server/app.ts', "import { read } from '@Query/read';\nexport const app = read;\n");
    write('src/tests/shipped.ts', 'export const shipped = 1;\n');
    write('src/tools/fromTests.ts', "export { shipped } from '../tests/shipped';\n");

    let result = measure(dir);
    expect('violations found', result.violations, {
      'helpers/matchUpFormatCode/format.ts -> scoring/score.ts': 1,
      'tools/dynamic.ts -> query/read.ts': 1,
      'tools/fromTests.ts -> tests/shipped.ts': 1,
      'tools/reexport.ts -> query/read.ts': 1,
      'tools/up.ts -> query/read.ts': 1,
    });
    expect('tests, server and test files are not walked', result.files, 9);
    expect('nothing unlayered', result.unlayered, []);

    write('src/assemblies/other/x.ts', 'export const x = 1;\n');
    write('src/tools/dead.ts', "import { gone } from '@Query/gone';\nexport const dead = gone;\n");
    result = measure(dir);
    expect('an unmapped directory is reported', result.unlayered, ['assemblies/other/x.ts']);
    expect('a dead import is reported', result.unresolved, [{ from: 'tools/dead.ts', specifier: '@Query/gone' }]);

    const base = { 'a -> b': 1, 'c -> d': 1 };
    expect('a rise FIRES', compare({ 'a -> b': 2, 'c -> d': 1 }, base).risen.length, 1);
    expect('a new violation FIRES at the same total', compare({ 'a -> b': 1, 'e -> f': 1 }, base).risen.length, 1);
    expect('the removed one is stale', compare({ 'a -> b': 1, 'e -> f': 1 }, base).stale.length, 1);
    expect('equal is quiet', compare(base, base), { risen: [], stale: [] });
    expect('a fall is stale, not a rise', compare({ 'a -> b': 1 }, base), {
      risen: [],
      stale: [{ key: 'c -> d', was: 1, now: 0 }],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error('[verify:layers] SELF-TEST FAILED');
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log(
    '[verify:layers] self-test OK — fires on a planted upward import (static, re-export, dynamic, sub-layer), on a new ' +
      'violation at an equal total, on shipped code importing a test harness, on an unmapped directory and a dead import; quiet on type-only imports and tests',
  );
  return 0;
}

const args = new Set(process.argv.slice(2));
const code = args.has('--self-test')
  ? selfTest()
  : run({ update: args.has('--update-baseline'), acceptRise: args.has('--accept-rise'), showList: args.has('--list') });
process.exit(code);

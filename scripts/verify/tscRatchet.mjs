#!/usr/bin/env node
/**
 * verify:test-types and verify:implicit-any — two tsc error counts that may only go DOWN.
 *
 * WHY THIS EXISTS
 * `tsconfig.json` excludes `*.test.ts` from `tsc --noEmit`, so a type error in a test file is never
 * reported. That made `src/tests/forge/typedSignatures.test.ts` — whose header says "the real value
 * is `pnpm check-types` failing if signatures regress" — a guard on nothing: measured 2026-10-07, a
 * deliberate type error in it produced 0 tsc errors, and its "unknown methods fall back to the open
 * shape" case had already broken silently when its example method gained a signature. Checking every
 * test file at once is 874 errors in 125 files, so this is a ratchet, not a switch: a file's count may
 * only fall, and a file at 0 stays at 0.
 *
 * `noImplicitAny` is off (tsconfig.base.json), so `verify:any-count` alone lets `any` return as an
 * implicit parameter: an explicit `x: any` removed by leaving `x` unannotated passes it. The second
 * count closes that: tsc's implicit-any codes (TS7xxx) in non-test `src`, per directory.
 *
 * WHAT IT COUNTS
 *   test-types    every tsc error, per FILE, compiling `tsconfig.tests.json` (tsconfig.json with test
 *                 files included). Keyed per file because a test file is a unit someone fixes whole.
 *   implicit-any  TS7xxx errors only, per DIRECTORY (non-recursive), compiling `tsconfig.json` with
 *                 `--noImplicitAny`. Keyed per directory, like verify:any-count, so parallel PRs in
 *                 different areas do not conflict over the baseline.
 *
 * THE RULE (as verify:any-count)
 * A key whose count RISES above its baseline fails, and so does a key absent from the baseline with a
 * count above zero. `--update-baseline` writes lower counts and refuses a rise unless `--accept-rise`.
 * A tsc run that exits non-zero yet yields no parsable error is a broken run and fails, so a config
 * mistake can never read as "0 errors".
 *
 *   hard-union    every tsc error, per DIRECTORY, compiling non-test `src` against a temporary copy of
 *                 `src/types` in which `Structure` and `DrawLink` are the 8.0.0 HARD unions (the `never`
 *                 fields deleted). It holds stage 1 of Mentat/planning/FACTORY_STRUCTURE_UNIONS_8_0_0.md:
 *                 a site converted to read through `matchUpsOf`/`positionAssignmentsOf`/`structuresOf` cannot
 *                 quietly go back. `src/types/typeAssertions` is not counted (its soft-form assertions fail
 *                 under the hard form by design). At 0 everywhere, 8.0.0 can delete the `never` fields.
 *
 * Run:        node scripts/verify/tscRatchet.mjs <test-types|implicit-any|hard-union> [--update-baseline [--accept-rise]]
 * Self-test:  node scripts/verify/tscRatchet.mjs --self-test
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSC = join(ROOT, 'node_modules', '.bin', 'tsc');

const COUNTS = {
  'test-types': {
    args: ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.tests.json'],
    keyOf: (file) => file,
    counts: () => true,
    fix: 'Fix the type error in the test (the file is now type-checked; see tsconfig.tests.json).',
  },
  'implicit-any': {
    args: ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json', '--noImplicitAny'],
    keyOf: (file) => dirname(file),
    counts: (code) => code.startsWith('7'),
    fix: 'Annotate the new parameters with the existing domain types (Mentat/planning/FACTORY_ANY_TIGHTENING.md).',
  },
  'hard-union': {
    prepare: prepareHardUnion,
    keyOf: (file) => dirname(file),
    counts: () => true,
    include: (key) => key.startsWith('src/') && !key.startsWith('src/types/typeAssertions'),
    fix: 'Read the structure through matchUpsOf/positionAssignmentsOf/structuresOf (@Acquire/structureMembers), or narrow on structureType first.',
  },
};

/** The `never` fields the 8.0.0 hard form deletes. Each must be present exactly once, or the count is meaningless. */
export const SOFT_ONLY_LINES = [
  '  structures?: never;\n',
  '  matchUps?: never;\n  positionAssignments?: never;\n',
  '; finishingPositions?: never }',
  '; roundNumber?: never }',
];

export function toHardUnion(source) {
  let hard = source;
  for (const line of SOFT_ONLY_LINES) {
    const found = hard.split(line).length - 1;
    if (found !== 1)
      throw new Error(`expected exactly one ${JSON.stringify(line)} in tournamentTypes.ts, found ${found}`);
    hard = hard.replace(line, line.startsWith(';') ? ' }' : '');
  }
  return hard;
}

/**
 * A copy of src/types with the hard unions, and a tsconfig that maps `@Types/*` to it. Nothing in src imports the
 * types folder by relative path (checked when this was written), so the alias reaches every consumer.
 */
function prepareHardUnion() {
  const dir = mkdtempSync(join(tmpdir(), 'factory-hard-union-'));
  const types = join(dir, 'types');
  cpSync(join(ROOT, 'src', 'types'), types, { recursive: true });
  const typesFile = join(types, 'tournamentTypes.ts');
  writeFileSync(typesFile, toHardUnion(readFileSync(typesFile, 'utf8')));
  const base = JSON.parse(stripJsonComments(readFileSync(join(ROOT, 'tsconfig.base.json'), 'utf8')));
  const paths = Object.fromEntries(
    Object.entries(base.compilerOptions.paths).map(([alias, targets]) => [
      alias,
      alias === '@Types/*' ? [join(types, '*')] : targets.map((target) => join(ROOT, target)),
    ]),
  );
  const config = join(dir, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      extends: join(ROOT, 'tsconfig.json'),
      compilerOptions: { baseUrl: ROOT, rootDir: '/', paths },
      include: [join(ROOT, 'src/**/*.ts'), join(ROOT, 'src/**/*.js')],
      exclude: ['dist', 'src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/scratch/**'].map((glob) => join(ROOT, glob)),
    }),
  );
  return {
    args: ['--noEmit', '--pretty', 'false', '-p', config],
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const stripJsonComments = (text) => text.replace(/^\s*\/\/.*$/gm, '');

const ERROR_LINE = /^(.+?)\(\d+,\d+\): error TS(\d+):/;

/** `{ key: count }` from tsc's `--pretty false` output, for the errors `counts` accepts. */
export function tally(output, { keyOf, counts }) {
  const result = {};
  for (const line of output.split('\n')) {
    const match = ERROR_LINE.exec(line);
    if (!match || !counts(match[2])) continue;
    const key = keyOf(match[1].split('\\').join('/'));
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

/** Keys whose count rose above the baseline (a key missing from it has a baseline of 0). */
export function rises(current, baseline) {
  return Object.keys(current)
    .filter((key) => current[key] > (baseline[key] ?? 0))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, was: baseline[key] ?? 0, now: current[key] }));
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

const total = (counts) => Object.values(counts).reduce((sum, n) => sum + n, 0);

function run(name, { update, acceptRise }) {
  const spec = COUNTS[name];
  const tag = `[verify:${name}]`;
  if (!spec) {
    console.error(`${tag} unknown count; use one of: ${Object.keys(COUNTS).join(', ')}`);
    return 1;
  }
  const baselinePath = join(ROOT, 'scripts', 'verify', 'baseline', `tsc-${name}.json`);

  const prepared = spec.prepare ? spec.prepare() : { args: spec.args, cleanup: () => {} };
  let tsc;
  try {
    tsc = spawnSync(TSC, prepared.args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } finally {
    prepared.cleanup();
  }
  const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`;
  const parsed = output.split('\n').filter((line) => ERROR_LINE.test(line)).length;
  if (tsc.status !== 0 && parsed === 0) {
    console.error(`${tag} FAIL — tsc exited ${tsc.status} with no parsable error; a broken run is not a clean one:`);
    console.error(output.slice(0, 2000));
    return 1;
  }
  const current = Object.fromEntries(
    Object.entries(tally(output, spec)).filter(([key]) => (spec.include ? spec.include(key) : true)),
  );

  if (!existsSync(baselinePath) && !update) {
    console.error(`${tag} FAIL — no baseline at ${relative(ROOT, baselinePath)}; run with --update-baseline`);
    return 1;
  }
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
  const risen = rises(current, baseline);

  if (update) {
    // creating the first baseline is not a rise; every later write may only lower a count
    if (existsSync(baselinePath) && risen.length && !acceptRise) {
      for (const { key, was, now } of risen) console.error(`  ${key}: ${was} -> ${now}`);
      console.error(`${tag} refusing to raise the baseline; fix the new errors, or pass --accept-rise`);
      return 1;
    }
    writeFileSync(baselinePath, sortedJson(current));
    console.log(`${tag} baseline written: ${total(current)} across ${Object.keys(current).length} entries`);
    return 0;
  }

  if (risen.length) {
    console.error(`${tag} FAIL — ${risen.length} entr${risen.length === 1 ? 'y' : 'ies'} gained errors:`);
    for (const { key, was, now } of risen) console.error(`  ${key}: ${was} -> ${now}`);
    console.error(spec.fix);
    return 1;
  }
  const fallen = total(baseline) - total(current);
  console.log(
    `${tag} OK — ${total(current)} errors` +
      (fallen > 0 ? ` (${fallen} below baseline; lower it with --update-baseline)` : ''),
  );
  return 0;
}

function selfTest() {
  const failures = [];
  const expect = (label, actual, wanted) => {
    if (actual !== wanted) failures.push(`${label}: expected ${wanted}, got ${actual}`);
  };
  const output = [
    "src/tests/a.test.ts(1,2): error TS2322: Type 'string' is not assignable to type 'number'.",
    "src/tests/a.test.ts(3,4): error TS18048: 'x' is possibly 'undefined'.",
    "src/area/b.ts(5,6): error TS7006: Parameter 'y' implicitly has an 'any' type.",
    "src/area/c.ts(7,8): error TS7031: Binding element 'z' implicitly has an 'any' type.",
    "src/area/c.ts(9,1): error TS2339: Property 'q' does not exist on type 'R'.",
    '  a continuation line that is not an error',
  ].join('\n');

  const tests = tally(output, COUNTS['test-types']);
  expect('test-types counts every error per file', tests['src/tests/a.test.ts'], 2);
  expect('test-types keys by file', tests['src/area/c.ts'], 2);
  const implicit = tally(output, COUNTS['implicit-any']);
  expect('implicit-any counts only TS7xxx, per directory', implicit['src/area'], 2);
  expect('implicit-any ignores other codes', implicit['src/tests'], undefined);
  expect('a rise FIRES', rises({ k: 3 }, { k: 2 }).length, 1);
  expect('a fall is quiet', rises({ k: 1 }, { k: 2 }).length, 0);
  expect('equal is quiet', rises({ k: 2 }, { k: 2 }).length, 0);
  expect('a new key with errors FIRES', rises({ fresh: 1 }, {}).length, 1);

  const soft = [
    'interface ItemStructure {\n  matchUps?: MatchUp[];\n  structures?: never;\n}',
    'interface ContainerStructure {\n  structures: Structure[];\n  matchUps?: never;\n  positionAssignments?: never;\n}',
    'source: DrawLinkSource & { roundNumber: number; finishingPositions?: never };',
    'source: DrawLinkSource & { finishingPositions: number[]; roundNumber?: never };',
  ].join('\n');
  const hard = toHardUnion(soft);
  expect('the hard form deletes every never field', hard.includes('never'), false);
  expect('the hard form keeps the real fields', hard.includes('structures: Structure[];'), true);
  let threw = false;
  try {
    toHardUnion(soft.replace('  structures?: never;\n', ''));
  } catch {
    threw = true;
  }
  expect('a missing never field FAILS rather than counting against the soft form', threw, true);

  if (failures.length) {
    console.error('[verify:tsc-ratchet] SELF-TEST FAILED');
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log('[verify:tsc-ratchet] self-test OK — fires on a rise, quiet on a fall, TS7xxx only, hard form complete');
  return 0;
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const name = argv.find((arg) => !arg.startsWith('--'));
const code = flags.has('--self-test')
  ? selfTest()
  : run(name, { update: flags.has('--update-baseline'), acceptRise: flags.has('--accept-rise') });
process.exit(code);

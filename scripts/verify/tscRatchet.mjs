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
 * Run:        node scripts/verify/tscRatchet.mjs <test-types|implicit-any> [--update-baseline [--accept-rise]]
 * Self-test:  node scripts/verify/tscRatchet.mjs --self-test
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
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
};

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

  const tsc = spawnSync(TSC, spec.args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`;
  const parsed = output.split('\n').filter((line) => ERROR_LINE.test(line)).length;
  if (tsc.status !== 0 && parsed === 0) {
    console.error(`${tag} FAIL — tsc exited ${tsc.status} with no parsable error; a broken run is not a clean one:`);
    console.error(output.slice(0, 2000));
    return 1;
  }
  const current = tally(output, spec);

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

  if (failures.length) {
    console.error('[verify:tsc-ratchet] SELF-TEST FAILED');
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log('[verify:tsc-ratchet] self-test OK — fires on a rise, quiet on a fall, implicit-any counts TS7xxx only');
  return 0;
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const name = argv.find((arg) => !arg.startsWith('--'));
const code = flags.has('--self-test')
  ? selfTest()
  : run(name, { update: flags.has('--update-baseline'), acceptRise: flags.has('--accept-rise') });
process.exit(code);

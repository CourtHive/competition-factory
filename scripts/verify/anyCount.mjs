#!/usr/bin/env node
/**
 * verify:any-count — `any` may only go DOWN.
 *
 * WHY THIS EXISTS
 * `@typescript-eslint/no-explicit-any` is off in this repo, so nothing stops `any` from spreading, and it
 * had: measured 2026-10-05 on dev `474e9fb4bd`, 2,141 `: any` in non-test `src`, and three of the four
 * directories CA named in the tightening note had grown since the note was written. The domain types
 * already exist (see Mentat/planning/FACTORY_ANY_TIGHTENING.md); what was missing was a ratchet.
 *
 * WHAT IT COUNTS
 * Per DIRECTORY, non-recursively (a directory's own `.ts` files), across non-test `src/`:
 *   `: any`, `: any[]`, `as any`, `<any>` and a bare `any[]`.
 * Not counted: `Record<string, any>` and other open-map index types (the deliberate idiom, as
 * `check:request-shapes` also treats it), comments, test files (`src/tests/**`, `*.test.ts`, `*.spec.ts`).
 * Counting per directory keeps the baseline one line per directory, so parallel PRs that tighten
 * different areas do not conflict over it.
 *
 * THE RULE
 * A directory whose count RISES above its baseline fails, and so does a directory absent from the
 * baseline whose count is above zero. A count that FALLS passes; `--update-baseline` then writes the
 * lower number. `--update-baseline` refuses to write a rise unless `--accept-rise` is also given, so a
 * rise can be recorded, but only as a visible line in a reviewed diff, never silently.
 *
 * Run:        pnpm verify:any-count
 * Lower:      pnpm verify:any-count --update-baseline
 * Self-test:  pnpm verify:any-count --self-test   (asserts it FIRES on a rise and stays quiet on a fall)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'scripts', 'verify', 'baseline', 'any-count.json');

// One pass, alternatives in priority order, so `: any[]` counts once rather than as `: any` plus `any[]`.
const ANY = /:\s*any(?:\[\])?(?![\w$])|\bas\s+any(?![\w$])|<any>|(?<![\w$])any\[\]/g;

const isTestPath = (path) =>
  path.split(sep).includes('tests') || path.endsWith('.test.ts') || path.endsWith('.spec.ts');

/** Source with comments removed; string contents are kept, which is conservative (a string can only add). */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export function countAny(source) {
  return stripComments(source).match(ANY)?.length ?? 0;
}

/** `{ 'src/dir': count }` for every directory under `srcDir` holding a counted `any`. */
export function countByDirectory(rootDir, srcDir = join(rootDir, 'src')) {
  const counts = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isTestPath(relative(rootDir, full) + sep)) walk(full);
      } else if (entry.name.endsWith('.ts') && !isTestPath(relative(rootDir, full))) {
        const found = countAny(readFileSync(full, 'utf8'));
        if (found) {
          const key = relative(rootDir, dir).split(sep).join('/');
          counts[key] = (counts[key] ?? 0) + found;
        }
      }
    }
  };
  walk(srcDir);
  return counts;
}

/** Directories whose count rose above the baseline (a directory missing from it has a baseline of 0). */
export function rises(current, baseline) {
  return Object.keys(current)
    .filter((dir) => current[dir] > (baseline[dir] ?? 0))
    .sort((a, b) => a.localeCompare(b))
    .map((dir) => ({ dir, was: baseline[dir] ?? 0, now: current[dir] }));
}

const sortedJson = (counts) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(counts)
        .sort((a, b) => a.localeCompare(b))
        .map((dir) => [dir, counts[dir]]),
    ),
    null,
    2,
  ) + '\n';

function run({ update, acceptRise }) {
  const current = countByDirectory(ROOT);
  const total = Object.values(current).reduce((sum, n) => sum + n, 0);
  if (!existsSync(BASELINE) && !update) {
    console.error(`[verify:any-count] FAIL — no baseline at ${relative(ROOT, BASELINE)}; run with --update-baseline`);
    return 1;
  }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  const risen = rises(current, baseline);

  if (update) {
    // creating the first baseline is not a rise; every later write may only lower a count
    if (existsSync(BASELINE) && risen.length && !acceptRise) {
      for (const { dir, was, now } of risen) console.error(`  ${dir}: ${was} -> ${now}`);
      console.error('[verify:any-count] refusing to raise the baseline; type the new code, or pass --accept-rise');
      return 1;
    }
    writeFileSync(BASELINE, sortedJson(current));
    console.log(`[verify:any-count] baseline written: ${total} across ${Object.keys(current).length} directories`);
    return 0;
  }

  if (risen.length) {
    console.error(
      `[verify:any-count] FAIL — ${risen.length} director${risen.length === 1 ? 'y' : 'ies'} gained \`any\`:`,
    );
    for (const { dir, was, now } of risen) console.error(`  ${dir}: ${was} -> ${now}`);
    console.error('Type the new code with the existing domain types (Mentat/planning/FACTORY_ANY_TIGHTENING.md).');
    return 1;
  }
  const baselineTotal = Object.values(baseline).reduce((sum, n) => sum + n, 0);
  const fallen = baselineTotal - total;
  console.log(
    `[verify:any-count] OK — ${total} \`any\` in non-test src` +
      (fallen > 0 ? ` (${fallen} below baseline; lower it with --update-baseline)` : ''),
  );
  return 0;
}

function selfTest() {
  const failures = [];
  const expect = (label, actual, wanted) => {
    if (actual !== wanted) failures.push(`${label}: expected ${wanted}, got ${actual}`);
  };

  expect('annotation', countAny('function f(x: any) {}'), 1);
  expect('array annotation counts once', countAny('let xs: any[] = [];'), 1);
  expect('cast', countAny('const y = x as any;'), 1);
  expect('generic', countAny('const s = new Map<any>();'), 1);
  expect('bare array', countAny('type T = Array<string> | any[];'), 1);
  expect('return type', countAny('function g(): any { return 1; }'), 1);
  expect('open map is not counted', countAny('const m: Record<string, any> = {};'), 0);
  expect('identifier containing any is not counted', countAny('const anyway = company; let many: number;'), 0);
  expect('line comment is not counted', countAny('// x: any\nconst a = 1;'), 0);
  expect('block comment is not counted', countAny('/* y as any */ const b = 2;'), 0);
  expect('a URL does not swallow the line', countAny('const u = "https://x"; let v: any;'), 1);

  const dir = mkdtempSync(join(tmpdir(), 'any-count-'));
  try {
    mkdirSync(join(dir, 'src', 'area'), { recursive: true });
    mkdirSync(join(dir, 'src', 'tests'), { recursive: true });
    writeFileSync(join(dir, 'src', 'area', 'a.ts'), 'let a: any; let b = c as any;');
    writeFileSync(join(dir, 'src', 'area', 'a.test.ts'), 'let skipped: any;');
    writeFileSync(join(dir, 'src', 'tests', 't.ts'), 'let skipped: any;');
    const counts = countByDirectory(dir);
    expect('directory count excludes tests', counts['src/area'], 2);
    expect('tests directory is not walked', counts['src/tests'], undefined);
    expect('a rise FIRES', rises({ 'src/area': 3 }, { 'src/area': 2 }).length, 1);
    expect('a fall is quiet', rises({ 'src/area': 1 }, { 'src/area': 2 }).length, 0);
    expect('equal is quiet', rises({ 'src/area': 2 }, { 'src/area': 2 }).length, 0);
    expect('a new directory with any FIRES', rises({ 'src/new': 1 }, {}).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error('[verify:any-count] SELF-TEST FAILED');
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log('[verify:any-count] self-test OK — fires on a rise, quiet on a fall, comments and tests excluded');
  return 0;
}

const args = new Set(process.argv.slice(2));
const code = args.has('--self-test')
  ? selfTest()
  : run({ update: args.has('--update-baseline'), acceptRise: args.has('--accept-rise') });
process.exit(code);

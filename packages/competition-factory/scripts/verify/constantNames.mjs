#!/usr/bin/env node
/**
 * verify:constant-names — a test must not use a constant's NAME where the code expects its VALUE.
 *
 * WHY THIS EXISTS
 * `REMOVE_ASSIGNMENT` is `'REMOVE'`. Two lucky-loser tests looked for a position action of type
 * `'REMOVE_ASSIGNMENT'`, found nothing, skipped their body behind an `if`, and passed for six months
 * without calling the method (#5457). The same sweep found three topic-priority tests subscribing to
 * `'MODIFY_MATCHUP'` (the topic is `'modifyMatchUp'`) and a ranking test passing `'SPLIT_EVEN'` (the value
 * is `'splitEven'`). Each passed because nothing in the code ever matched the name.
 *
 * WHAT IT FLAGS
 * A quoted string in a test file (`src/**\/*.test.ts`) that is
 *   1. the name of an `export const NAME = '…'` in `src/constants/`, and
 *   2. not the value of any such constant, and
 *   3. never written as a quoted string in non-test `src/` (so a code the factory does use, such as a
 *      `PenaltyTypeEnum` value or a type-union literal, passes).
 * Comments are ignored. A test that uses a name on purpose (junk input, a spelling test, a scan of
 * identifiers) is listed with its reason in `constantNames.allow.json`, by file and literal; the `*` key
 * holds literals allowed in any test file (`'INVALID'` as junk input).
 *
 * Run:        pnpm verify:constant-names
 * Self-test:  pnpm verify:constant-names --self-test   (asserts it FIRES on a name and stays quiet on a value)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOW = join(ROOT, 'scripts', 'verify', 'constantNames.allow.json');

const CONSTANT = /^export const ([A-Z][A-Z0-9_]*) = '([^']*)';/gm;
const QUOTED = /(['"`])([A-Za-z0-9_.]+)\1/g;

const toPosix = (path) => path.split(sep).join('/');

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'scratch' && entry.name !== 'node_modules') walk(path, files);
    } else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

/** Source with comments removed; a block comment keeps its newlines so line numbers stay true. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export function readConstants(sources) {
  const names = new Map();
  const values = new Set();
  for (const source of sources) {
    for (const [, name, value] of source.matchAll(CONSTANT)) {
      names.set(name, value);
      values.add(value);
    }
  }
  return { names, values };
}

export function quotedStrings(source) {
  return new Set([...stripComments(source).matchAll(QUOTED)].map(([, , literal]) => literal));
}

/** `tests` is [{ file, source }]; returns [{ file, line, literal, value }]. */
export function findNameLiterals({ names, values, sourceStrings, tests, allow = {} }) {
  const findings = [];
  for (const { file, source } of tests) {
    const allowed = new Set([...Object.keys(allow['*'] ?? {}), ...Object.keys(allow[file] ?? {})]);
    stripComments(source)
      .split('\n')
      .forEach((text, index) => {
        for (const [, , literal] of text.matchAll(QUOTED)) {
          if (!names.has(literal) || values.has(literal) || sourceStrings.has(literal)) continue;
          if (allowed.has(literal)) continue;
          findings.push({ file, line: index + 1, literal, value: names.get(literal) });
        }
      });
  }
  return findings;
}

function selfTest() {
  const { names, values } = readConstants([
    "export const REMOVE_ASSIGNMENT = 'REMOVE';\nexport const SINGLES = 'SINGLES';\nexport const MODE = 'mode';",
  ]);
  const sourceStrings = new Set(['MODE']);
  const run = (source, allow) =>
    findNameLiterals({ names, values, sourceStrings, tests: [{ file: 't.test.ts', source }], allow });
  const fires = run("find((a) => a.type === 'REMOVE_ASSIGNMENT');");
  const quietOnValue = run("expect(type).toEqual('REMOVE'); expect(t).toEqual('SINGLES');");
  const quietOnSourceString = run("x('MODE');");
  const quietInComment = run("// 'REMOVE_ASSIGNMENT' is the name\nconst a = 1;");
  const quietWhenAllowed = run("x('REMOVE_ASSIGNMENT');", { 't.test.ts': { REMOVE_ASSIGNMENT: 'deliberate' } });
  const quietWhenAllowedEverywhere = run("x('REMOVE_ASSIGNMENT');", { '*': { REMOVE_ASSIGNMENT: 'deliberate' } });
  const lineAfterBlockComment = run("/*\n\n*/\nx('REMOVE_ASSIGNMENT');");
  const ok =
    fires.length === 1 &&
    fires[0].value === 'REMOVE' &&
    quietOnValue.length === 0 &&
    quietOnSourceString.length === 0 &&
    quietInComment.length === 0 &&
    quietWhenAllowed.length === 0 &&
    quietWhenAllowedEverywhere.length === 0 &&
    lineAfterBlockComment[0]?.line === 4;
  if (!ok) {
    console.error('[verify:constant-names] SELF-TEST FAILED', {
      fires,
      quietOnValue,
      quietOnSourceString,
      quietInComment,
      quietWhenAllowed,
      quietWhenAllowedEverywhere,
      lineAfterBlockComment,
    });
    process.exit(1);
  }
  console.log(
    '[verify:constant-names] self-test OK — fires on a name, quiet on a value, a source code, a comment and an allowed entry; line numbers survive a block comment',
  );
}

function main() {
  const srcDir = join(ROOT, 'src');
  const files = walk(srcDir);
  const isTest = (path) => path.endsWith('.test.ts');
  const constantSources = files.filter((path) => toPosix(relative(srcDir, path)).startsWith('constants/'));
  const { names, values } = readConstants(constantSources.map((path) => readFileSync(path, 'utf8')));

  const sourceStrings = new Set();
  for (const path of files.filter((path) => !isTest(path) && !toPosix(path).includes('/tests/'))) {
    for (const literal of quotedStrings(readFileSync(path, 'utf8'))) sourceStrings.add(literal);
  }

  const allow = JSON.parse(readFileSync(ALLOW, 'utf8'));
  const tests = files.filter(isTest).map((path) => ({
    file: toPosix(relative(ROOT, path)),
    source: readFileSync(path, 'utf8'),
  }));
  if (names.size < 500 || tests.length < 1000) {
    console.error(`[verify:constant-names] scanned too little (${names.size} constants, ${tests.length} tests)`);
    process.exit(1);
  }

  const findings = findNameLiterals({ names, values, sourceStrings, tests, allow });
  if (findings.length) {
    console.error(`[verify:constant-names] ${findings.length} test literal(s) use a constant's NAME, not its value:`);
    for (const { file, line, literal, value } of findings) {
      console.error(`  ${file}:${line}  '${literal}' — the constant ${literal} is '${value}'`);
    }
    console.error(
      '  Import the constant. If the name is deliberate, add the file and literal, with the reason, to\n' +
        '  scripts/verify/constantNames.allow.json.',
    );
    process.exit(1);
  }
  console.log(`[verify:constant-names] OK — ${tests.length} test files, ${names.size} constants`);
}

if (process.argv.includes('--self-test')) selfTest();
else main();

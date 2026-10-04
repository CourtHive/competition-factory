import { expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

/**
 * A MATCHUPSTATUS IS TYPED `MatchUpStatusUnion`, NOT `string` — EXCEPT WHERE A VALIDATOR CHECKS IT.
 *
 * In 2026-10 the factory had 26 declarations typing a matchUpStatus as `string`, which erased the union
 * the model and every status constant carry: a misspelled status compared against a constant compiled
 * and was never true. They were narrowed in three passes (#5147, #5150 and this one; plan:
 * Mentat/planning/MATCHUP_STATUS_STRING_ERASURES.md).
 *
 * The three that remain are deliberate. A validator's job is to check a status a caller hands it, so its
 * parameter is `string` and it refuses an unknown value itself (CA, 2026-10-03).
 */

const SRC = path.resolve(__dirname, '../..');
const VALIDATORS_THAT_CHECK_THE_STATUS = new Set([
  path.join('validators', 'validateScore.ts'),
  path.join('validators', 'validateMatchUpScore.ts'),
  path.join('query', 'matchUp', 'analyzeScore.ts'),
]);
const erasure = /\b(matchUpStatus|existingStatus)\??:\s*string\b/;

function erasures(source: string): number[] {
  return source
    .split('\n')
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => erasure.test(line) && !/^\s*(\/\/|\*)/.test(line))
    .map(({ index }) => index + 1);
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

it('the detector finds a status typed as string, and passes the union', () => {
  // CONTROL: both directions, on the shapes that were in src
  expect(erasures(`  matchUpStatus?: string;`)).toEqual([1]);
  expect(erasures(`}): { matchUpStatus: string; winningSide?: number } {`)).toEqual([1]);
  expect(erasures(`  existingStatus?: string;`)).toEqual([1]);
  expect(erasures(`  matchUpStatus?: MatchUpStatusUnion;`)).toEqual([]);
  expect(erasures(`  matchUpStatusCode?: string;`)).toEqual([]);
});

it('only the validators that check a status take it as string', () => {
  const files = sourceFiles(SRC);
  // CONTROL: the walk reached the source tree, including a file the allow-list names
  expect(files.length).toBeGreaterThan(500);
  const found = files.flatMap((file) =>
    erasures(fs.readFileSync(file, 'utf8')).map((line) => `${path.relative(SRC, file)}:${line}`),
  );
  const allowed = found.filter((hit) => VALIDATORS_THAT_CHECK_THE_STATUS.has(hit.split(':')[0]));
  expect(allowed.length).toEqual(VALIDATORS_THAT_CHECK_THE_STATUS.size);

  expect(found.filter((hit) => !VALIDATORS_THAT_CHECK_THE_STATUS.has(hit.split(':')[0]))).toEqual([]);
});

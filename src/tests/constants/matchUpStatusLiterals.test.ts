import { expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

// constants
import { validMatchUpStatuses } from '@Constants/matchUpStatusConstants';

/**
 * A MATCHUPSTATUS IS SPELLED BY THE CONSTANTS MODULE, NOT BY A STRING LITERAL.
 *
 * Until 2026-10-04, 30 lines in src compared or assigned a matchUpStatus as a bare literal — 12 in
 * ScoringEngine alone (CA: "compares against the bare literal 'COMPLETED', bypassing the constants
 * module entirely"). The point-by-point engine kept its own hand-written status union, so the literals
 * type-checked; a status renamed or misspelled in one place would not have been caught in the other.
 *
 * Scoped to lines that mention a matchUpStatus, so other vocabularies that share a word (a draft's
 * `status: 'COMPLETED'`, an official's assignment status) are not matchUp statuses and are not flagged.
 */

const SRC = path.resolve(__dirname, '../..');
const EXCLUDED = ['constants', 'types', 'tests', 'fixtures'].map((dir) => path.join(SRC, dir) + path.sep);
const quoted = new RegExp(`['"\`](${validMatchUpStatuses.join('|')})['"\`]`);

function bareLiterals(source: string): number[] {
  return source
    .split('\n')
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /matchUpStatus/i.test(line) && quoted.test(line) && !/^\s*(\/\/|\*)/.test(line))
    .map(({ index }) => index + 1);
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (EXCLUDED.some((excluded) => (full + path.sep).startsWith(excluded))) return [];
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

it('the detector finds a bare matchUpStatus literal, and passes the constant', () => {
  // CONTROL: both directions, on the shapes that were in src
  expect(bareLiterals(`if (matchUp.matchUpStatus === 'COMPLETED') return;`)).toEqual([1]);
  expect(bareLiterals(`  matchUpStatus: 'TO_BE_PLAYED',`)).toEqual([1]);
  expect(bareLiterals(`if (matchUp.matchUpStatus === COMPLETED) return;`)).toEqual([]);
  expect(bareLiterals(`if (draftState.status === 'COMPLETED') return;`)).toEqual([]);
});

it('no source file outside constants, types and fixtures writes a matchUpStatus as a literal', () => {
  const files = sourceFiles(SRC);
  // CONTROL: the walk reached the files this rule came from
  expect(files.length).toBeGreaterThan(500);
  expect(files.some((file) => file.endsWith(path.join('engines', 'scoring', 'ScoringEngine.ts')))).toBe(true);

  const found = files.flatMap((file) =>
    bareLiterals(fs.readFileSync(file, 'utf8')).map((line) => `${path.relative(SRC, file)}:${line}`),
  );
  expect(found).toEqual([]);
});

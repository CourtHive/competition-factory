import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { expect, it } from 'vitest';

// constants
import * as matchUpStatusModule from '@Constants/matchUpStatusConstants';

/**
 * A STATUS GROUPING HOLDS STATUSES, AND DIRECTING / NON-DIRECTING SPLIT THEM EXACTLY.
 *
 * `nonDirectingMatchUpStatuses` listed `undefined` from before the 2023 TypeScript conversion until
 * 2026-10-04, so `isNonDirectingMatchUpStatus({ matchUpStatus: undefined })` answered true. Every caller
 * already checked for a status before asking, and `sideStatusCodes` filtered the entry back out, so it
 * decided nothing; it only made the published constant a `(MatchUpStatusUnion | undefined)[]`.
 */

const { validMatchUpStatuses, directingMatchUpStatuses, nonDirectingMatchUpStatuses } = matchUpStatusModule;
const groupings = Object.entries(matchUpStatusModule).filter(([, value]) => Array.isArray(value));

it('every exported status grouping holds only valid matchUpStatuses', () => {
  // CONTROL: the groupings were found, including the one this test is about
  expect(groupings.length).toBeGreaterThan(5);
  expect(groupings.map(([name]) => name)).toContain('nonDirectingMatchUpStatuses');

  const valid = new Set<unknown>(validMatchUpStatuses);
  const strays = groupings.flatMap(([name, list]) =>
    (list as unknown[]).filter((status) => !valid.has(status)).map((status) => `${name}: ${String(status)}`),
  );
  expect(strays).toEqual([]);
});

it('directing and non-directing partition the valid statuses: each status is exactly one', () => {
  const directing = new Set<string>(directingMatchUpStatuses);
  const both = nonDirectingMatchUpStatuses.filter((status) => directing.has(status));
  expect(both).toEqual([]);

  const classified = new Set<string>([...directingMatchUpStatuses, ...nonDirectingMatchUpStatuses]);
  expect(validMatchUpStatuses.filter((status) => !classified.has(status))).toEqual([]);
  expect(classified.size).toEqual(validMatchUpStatuses.length);
});

it('a missing matchUpStatus is neither directing nor non-directing', () => {
  expect(isNonDirectingMatchUpStatus({ matchUpStatus: undefined as any })).toBe(false);
  expect(isDirectingMatchUpStatus({ matchUpStatus: undefined })).toBe(false);
  // CONTROL: the same calls answer for a real status
  expect(isNonDirectingMatchUpStatus({ matchUpStatus: 'TO_BE_PLAYED' })).toBe(true);
  expect(isDirectingMatchUpStatus({ matchUpStatus: 'COMPLETED' })).toBe(true);
});

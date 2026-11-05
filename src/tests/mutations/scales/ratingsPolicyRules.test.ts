import { kOf, winnerActualOf } from '@Generators/scales/ratingsPolicyRules';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { expect, it } from 'vitest';

const MATCHES_PLAYED = { rule: 'MATCHES_PLAYED', numerator: 250, offset: 5, shape: 0.4 } as const;
const SETS_PLAYED_SHARE = { rule: 'SETS_PLAYED_SHARE' } as const;

it('has no K by matches played without a career count, and one from it', () => {
  expect(kOf(MATCHES_PLAYED)).toBeUndefined();
  expect(kOf(MATCHES_PLAYED, 0)).toBeCloseTo(250 / Math.pow(5, 0.4), 10);
  expect(kOf({ rule: 'CONSTANT', value: 25 })).toEqual(25);
});

it.each([
  ['SET3-S:6/TB7', 1, 2 / 3],
  ['SET5-S:6/TB7', 2, 0.6],
  ['SET3XA-S:T10', 1, 1], // aggregate: Huang grades best-of sets only
  ['SET4X-S:T20P', 1, 1], // exactly-N
  ['SET7-S:6/TB7', 3, 1], // a best-of count Huang does not give
])("grades a win in %s with the loser on %s set(s) at Huang's %s", (matchUpFormat, loserSetsWon, expected) => {
  expect(winnerActualOf({ rule: SETS_PLAYED_SHARE, parsedFormat: parse(matchUpFormat), loserSetsWon })).toBeCloseTo(
    expected,
    10,
  );
});

it('gives a plain win under WIN_LOSS', () => {
  expect(winnerActualOf({ rule: { rule: 'WIN_LOSS' }, parsedFormat: parse('SET3-S:6/TB7'), loserSetsWon: 1 })).toEqual(
    1,
  );
});

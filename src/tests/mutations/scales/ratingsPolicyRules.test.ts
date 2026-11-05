import { kOf, marginMultiplier, tierK, winnerActualOf } from '@Helpers/ratings/ratingsPolicyRules';
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

it.each([
  [0, 1],
  [1, 1],
  [2, 1.5],
  [3, 1.75],
  [4, 1.875],
  [6, 2.125],
])("World Football Elo's goal-difference multiplier for a margin of %s is %s", (marginOfVictory, expected) => {
  expect(marginMultiplier({ rule: { rule: 'GOAL_DIFFERENCE_STEPS' }, marginOfVictory })).toEqual(expected);
});

it("FiveThirtyEight's log margin shrinks for a bigger favourite and is 1 with no margin", () => {
  const rule = {
    rule: 'LOG_MOV_AUTOCORRECTED',
    scale: 0.6686,
    offset: 0,
    intercept: 0.8048,
    autocorrelation: 2.05,
  } as const;
  expect(marginMultiplier({ rule, marginOfVictory: 1 })).toBeCloseTo(0.8048, 10);
  expect(marginMultiplier({ rule, marginOfVictory: 1, winnerEloDiff: 200 })).toBeCloseTo((0.8048 * 2.05) / 2.25, 10);
  expect(marginMultiplier({ rule, marginOfVictory: 0 })).toEqual(1);
  expect(marginMultiplier({})).toEqual(1);
  expect(marginMultiplier({ rule: { rule: 'WINNER_GAME_SHARE' } })).toEqual(1);
});

it("takes K from the event's tier before the tournament's", () => {
  const kByTier = { 'FIFA:WORLD_CUP': 60, 'FIFA:FRIENDLY': 10 };
  const event = { system: 'FIFA', value: 'FRIENDLY' };
  const tournament = { system: 'FIFA', value: 'WORLD_CUP' };
  expect(tierK(kByTier, [event, tournament])).toEqual(10);
  expect(tierK(kByTier, [undefined, tournament])).toEqual(60);
  expect(tierK(kByTier, [{ system: 'ITF', value: 'J300' }])).toBeUndefined();
  expect(tierK(undefined, [tournament])).toBeUndefined();
});

/**
 * A tiebreak is won at its target, by its margin — not by any lead.
 *
 * `checkSetIsComplete` asked one thing of a tiebreak: does the leading side hold the higher points. So a
 * `3-1` in a match tiebreak to ten was a complete set, a `10-9` too, and a `7-6` decided `3-1` as well —
 * measured 2026-09-30 — while `validateSetScore` refused all three. `analyzeSet` and `getSetWinningSide`
 * delegate here, so every consumer reading a `winningSide` off the analysis was told those sets were
 * over. The rule is now the validator's, and the two agree.
 */
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { describe, expect, it } from 'vitest';

const MATCH_TIEBREAK = 'SET1-S:TB10';
const STANDARD = 'SET3-S:6/TB7';

const matchTiebreak = (side1TiebreakScore: number, side2TiebreakScore: number, matchUpFormat = MATCH_TIEBREAK) =>
  checkSetIsComplete({ matchUpFormat, isTiebreakSet: true, set: { side1TiebreakScore, side2TiebreakScore } });

const setTiebreak = (side1TiebreakScore: number, side2TiebreakScore: number, matchUpFormat = STANDARD) =>
  checkSetIsComplete({ matchUpFormat, set: { side1Score: 7, side2Score: 6, side1TiebreakScore, side2TiebreakScore } });

describe('a match tiebreak is complete at its target, by two', () => {
  it('refuses a lead short of the target', () => {
    expect(matchTiebreak(3, 1)).toBe(false);
    expect(matchTiebreak(9, 7)).toBe(false);
  });

  it('refuses the target reached by one', () => {
    expect(matchTiebreak(10, 9)).toBe(false);
    expect(matchTiebreak(11, 10)).toBe(false);
  });

  it('accepts the target by two, and past it by two', () => {
    expect(matchTiebreak(10, 8)).toBe(true);
    expect(matchTiebreak(10, 0)).toBe(true);
    expect(matchTiebreak(12, 10)).toBe(true);
    expect(matchTiebreak(0, 10)).toBe(true);
  });

  it('a no-ad match tiebreak is won by one', () => {
    expect(matchTiebreak(10, 9, 'SET1-S:TB10NOAD')).toBe(true);
    expect(matchTiebreak(9, 8, 'SET1-S:TB10NOAD')).toBe(false);
  });

  it('a sudden-death point — a tiebreak to ONE — is won 1-0, since it cannot be won by two', () => {
    // The `F:TB1` decider an aggregate timed format carries.
    expect(
      checkSetIsComplete({
        matchUpFormat: 'SET3XA-S:T10-F:TB1',
        isDecidingSet: true,
        isTiebreakSet: true,
        set: { side1TiebreakScore: 1, side2TiebreakScore: 0 },
      }),
    ).toBe(true);
  });
});

describe('a set decided by a tiebreak is complete when the tiebreak is', () => {
  it('refuses a 7-6 whose tiebreak stopped short', () => {
    expect(setTiebreak(3, 1)).toBe(false);
    expect(setTiebreak(7, 6)).toBe(false);
  });

  it('accepts a 7-6 whose tiebreak was won', () => {
    expect(setTiebreak(7, 3)).toBe(true);
    expect(setTiebreak(9, 7)).toBe(true);
    expect(setTiebreak(7, 6, 'SET3-S:6/TB7NOAD')).toBe(true);
  });

  it('still refuses a 7-6 with no points at all, and still honours ignoreTiebreak', () => {
    expect(checkSetIsComplete({ matchUpFormat: STANDARD, set: { side1Score: 7, side2Score: 6 } })).toBe(false);
    expect(
      checkSetIsComplete({ matchUpFormat: STANDARD, ignoreTiebreak: true, set: { side1Score: 7, side2Score: 6 } }),
    ).toBe(true);
  });
});

describe('the analysis agrees, so a winningSide is only ever a won set', () => {
  const winner = (matchUpFormat: string, setObject: any) =>
    analyzeSet({ setObject: { setNumber: 1, ...setObject }, matchUpScoringFormat: parse(matchUpFormat) }).winningSide;

  it('names no winner for a match tiebreak nobody has won', () => {
    expect(winner(MATCH_TIEBREAK, { side1TiebreakScore: 3, side2TiebreakScore: 1 })).toBeUndefined();
    expect(winner(MATCH_TIEBREAK, { side1TiebreakScore: 10, side2TiebreakScore: 9 })).toBeUndefined();
    expect(winner(MATCH_TIEBREAK, { side1TiebreakScore: 10, side2TiebreakScore: 8 })).toBe(1);
    expect(winner(MATCH_TIEBREAK, { side1TiebreakScore: 0, side2TiebreakScore: 10 })).toBe(2);
  });

  it('names no winner for a 7-6 whose tiebreak stopped short', () => {
    expect(
      winner(STANDARD, { side1Score: 7, side2Score: 6, side1TiebreakScore: 3, side2TiebreakScore: 1 }),
    ).toBeUndefined();
    expect(winner(STANDARD, { side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3 })).toBe(1);
  });
});

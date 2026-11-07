/**
 * A set decided by its tiebreak with no points recorded is a finished set, on the READ surface too.
 *
 * `setMatchUpStatus` has recorded a bare `7-6` since ruling V11 (CA, 2026-10-02), with the
 * TIEBREAK_POINTS_NOT_RECORDED warning, and since 2026-11-04 a `0-0` pair is the same unrecorded result. Measured
 * on 7.32.0, the analysis disagreed with the record: `checkSetIsComplete` called a bare `7-6` unfinished, so
 * `getSetWinningSide` and `analyzeSet` named no winner and `analyzeMatchUp` found none; `validateSetScore` refused a
 * `0-0` pair ("Tiebreak winner must reach 7 points, got 0"); `generateScoreString` printed `7-6(0)`. CA, 2026-11-07:
 * one rule, everywhere — a score-entry interface that delegates to the analysis must be able to submit the score the
 * engine records.
 */
import { withoutZeroZeroTiebreak } from '@Helpers/matchUpFormatCode/setRules/tiebreakSetShape';
import { checkSetIsComplete } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
import { generateScoreString } from '@Scoring/views/generateScoreString';
import { validateSetScore } from '@Scoring/analysis/validateMatchUpScore';
import { getSetWinningSide } from '@Query/matchUp/getSetWinningSide';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

const STANDARD = 'SET3-S:6/TB7';
const AT_TWELVE = 'SET3-S:6/TB7@12';
const SHORT_AT_THREE = 'SET3-S:4/TB7@3';
const WITH_DECIDER = 'SET3-S:6/TB7-F:TB10';
const ADVANTAGE = 'SET3-S:6';

const games = (side1Score: number, side2Score: number, points?: [unknown, unknown]) => ({
  setNumber: 1,
  side1Score,
  side2Score,
  ...(points && { side1TiebreakScore: points[0], side2TiebreakScore: points[1] }),
});

const complete = (set: any, matchUpFormat = STANDARD) => checkSetIsComplete({ matchUpFormat, set });
const winner = (set: any, matchUpFormat = STANDARD) =>
  getSetWinningSide({ matchUpScoringFormat: parse(matchUpFormat), setObject: set });

describe('a 0-0 pair in the tiebreak-point fields is no points', () => {
  it('is dropped, as numbers or as the strings a feed sends', () => {
    expect(withoutZeroZeroTiebreak(games(7, 6, [0, 0]))).toEqual(games(7, 6));
    expect(withoutZeroZeroTiebreak(games(7, 6, ['0', '0']))).toEqual(games(7, 6));
  });

  it('is kept when either side has points, or when only one side reads zero', () => {
    const real = games(7, 6, [7, 3]);
    expect(withoutZeroZeroTiebreak(real)).toBe(real);
    const oneSide = games(7, 6, [0, undefined]);
    expect(withoutZeroZeroTiebreak(oneSide)).toBe(oneSide);
    const toLove = games(7, 6, [7, 0]);
    expect(withoutZeroZeroTiebreak(toLove)).toBe(toLove);
  });

  it('does not mutate the set it is given', () => {
    const set = games(7, 6, [0, 0]);
    withoutZeroZeroTiebreak(set);
    expect(set.side1TiebreakScore).toBe(0);
  });
});

describe('checkSetIsComplete: the tiebreak games score with no points is a finished set', () => {
  it('a bare 7-6 is complete, won by the games leader', () => {
    expect(complete(games(7, 6))).toBe(true);
    expect(winner(games(7, 6))).toBe(1);
    expect(complete(games(6, 7))).toBe(true);
    expect(winner(games(6, 7))).toBe(2);
  });

  it('a 0-0 pair reads as the same bare set', () => {
    expect(complete(games(7, 6, [0, 0]))).toBe(true);
    expect(winner(games(6, 7, [0, 0]))).toBe(2);
    expect(complete(games(7, 6, ['0', '0']))).toBe(true);
  });

  it('6-6 is a tiebreak still being played, not a finished set', () => {
    expect(complete(games(6, 6))).toBe(false);
    expect(winner(games(6, 6))).toBeUndefined();
    expect(complete(games(6, 6, [0, 0]))).toBe(false);
  });

  it('points on one side only, or a pair the set winner did not win, are still unfinished', () => {
    expect(complete(games(7, 6, [7, undefined]))).toBe(false);
    expect(complete(games(7, 6, [undefined, 3]))).toBe(false);
    expect(complete(games(7, 6, [3, 7]))).toBe(false);
    expect(complete(games(7, 6, [7, 7]))).toBe(false);
    expect(complete(games(7, 6, [5, 3]))).toBe(false);
  });

  it('real points still decide exactly as before', () => {
    expect(complete(games(7, 6, [7, 3]))).toBe(true);
    expect(winner(games(7, 6, [7, 3]))).toBe(1);
    expect(complete(games(7, 6, [7, 0]))).toBe(true);
    expect(complete(games(7, 6, [10, 8]))).toBe(true);
  });

  it('follows the format: the tiebreak games score is 13-12 under @12 and 4-3 under S:4/TB7@3', () => {
    expect(complete(games(13, 12), AT_TWELVE)).toBe(true);
    expect(winner(games(12, 13), AT_TWELVE)).toBe(2);
    // 7-6 under @12 is six games short of the tiebreak: a lead of one is no set
    expect(complete(games(7, 6), AT_TWELVE)).toBe(false);
    expect(complete(games(4, 3), SHORT_AT_THREE)).toBe(true);
    expect(complete(games(3, 3), SHORT_AT_THREE)).toBe(false);
  });

  it('an advantage set has no tiebreak to leave unrecorded: 7-6 is still a set in progress', () => {
    expect(complete(games(7, 6), ADVANTAGE)).toBe(false);
    expect(complete(games(8, 6), ADVANTAGE)).toBe(true);
  });

  it('a match tiebreak decider is untouched: its points, or the 1-0 marker, decide it', () => {
    const decider = (set: any) => checkSetIsComplete({ matchUpFormat: WITH_DECIDER, isDecidingSet: true, set });
    expect(decider({ setNumber: 3, side1TiebreakScore: 10, side2TiebreakScore: 8 })).toBe(true);
    expect(decider({ setNumber: 3, side1TiebreakScore: 3, side2TiebreakScore: 1 })).toBe(false);
    expect(decider({ setNumber: 3, side1Score: 1, side2Score: 0 })).toBe(true);
    // a 0-0 pair beside the marker is the marker
    expect(decider({ setNumber: 3, side1Score: 1, side2Score: 0, side1TiebreakScore: 0, side2TiebreakScore: 0 })).toBe(
      true,
    );
  });
});

describe('analyzeSet and analyzeMatchUp agree with the record', () => {
  const analysis = (set: any, matchUpFormat = STANDARD) =>
    analyzeSet({ setObject: set, matchUpScoringFormat: parse(matchUpFormat) });

  it('analyzeSet names the games leader as the winner of a bare 7-6', () => {
    expect(analysis(games(7, 6)).winningSide).toBe(1);
    expect(analysis(games(6, 7, [0, 0])).winningSide).toBe(2);
    expect(analysis(games(6, 6)).winningSide).toBeUndefined();
    expect(analysis(games(7, 6, [3, 7])).winningSide).toBeUndefined();
  });

  it('a bare 7-6 with its winningSide recorded is a valid set outcome, as before', () => {
    expect(analysis({ ...games(7, 6), winningSide: 1 }).isValidSetOutcome).toBe(true);
    expect(analysis({ ...games(7, 6, [0, 0]), winningSide: 1 }).isValidSetOutcome).toBe(true);
  });

  it('analyzeMatchUp finds the winner of 7-6 6-4 once each set carries the winner the analysis names', () => {
    // `analyzeMatchUp` counts sets by their `winningSide`, for every format. A score-entry interface derives
    // each set's winner from the analysis before asking, so a bare 7-6 — whose winner the analysis now names —
    // counts; before, it was a set nobody had won and the match had no winner.
    const withWinners = (sets: any[], matchUpFormat = STANDARD) =>
      sets.map((set) => ({ ...set, winningSide: winner(set, matchUpFormat) }));
    const sets = withWinners([games(7, 6), { setNumber: 2, side1Score: 6, side2Score: 4 }]);
    expect(sets.map((set) => set.winningSide)).toEqual([1, 1]);
    expect(analyzeMatchUp({ matchUp: { score: { sets }, matchUpFormat: STANDARD } }).calculatedWinningSide).toBe(1);

    const zeroZero = withWinners([games(6, 7, [0, 0]), { setNumber: 2, side1Score: 4, side2Score: 6 }]);
    expect(
      analyzeMatchUp({ matchUp: { score: { sets: zeroZero }, matchUpFormat: STANDARD } }).calculatedWinningSide,
    ).toBe(2);

    // a 6-6 names nobody, so the match stays undecided
    const unfinished = withWinners([games(6, 6), { setNumber: 2, side1Score: 6, side2Score: 4 }]);
    expect(unfinished[0].winningSide).toBeUndefined();
    expect(
      analyzeMatchUp({ matchUp: { score: { sets: unfinished }, matchUpFormat: STANDARD } }).calculatedWinningSide,
    ).toBeUndefined();
  });
});

describe('validateSetScore reads a 0-0 pair as no points', () => {
  it('a 0-0 pair on a decided set is valid, as the bare set is', () => {
    expect(validateSetScore(games(7, 6), STANDARD)).toEqual({ isValid: true });
    expect(validateSetScore(games(7, 6, [0, 0]), STANDARD)).toEqual({ isValid: true });
    expect(validateSetScore(games(6, 7, ['0', '0']), STANDARD)).toEqual({ isValid: true });
  });

  it('impossible points are still refused', () => {
    expect(validateSetScore(games(7, 6, [0, 3]), STANDARD).isValid).toBe(false);
    expect(validateSetScore(games(7, 6, [7, 7]), STANDARD).isValid).toBe(false);
    expect(validateSetScore(games(7, 6, [3, 7]), STANDARD).isValid).toBe(false);
  });

  it('a 0-0 pair on a set with no tiebreak carries no tiebreak claim to refuse', () => {
    // `6-4` with `0-0` points: before, "tiebreak scores recorded for a set whose format has no tiebreak" could fire
    expect(validateSetScore(games(6, 4, [0, 0]), ADVANTAGE)).toEqual({ isValid: true });
  });
});

describe('generateScoreString never prints the pair the record drops', () => {
  it('7-6 with a 0-0 pair prints as 7-6', () => {
    const sets = [games(7, 6, [0, 0]), { setNumber: 2, side1Score: 6, side2Score: 4 }];
    expect(generateScoreString({ sets, winningSide: 1, matchUpFormat: STANDARD })).toBe('7-6 6-4');
    expect(generateScoreString({ sets, winningSide: 1, matchUpFormat: STANDARD, reversed: true })).toBe('6-7 4-6');
  });

  it('a 7-0 tiebreak still prints its love', () => {
    expect(generateScoreString({ sets: [games(7, 6, [7, 0])], matchUpFormat: STANDARD })).toBe('7-6(0)');
  });
});

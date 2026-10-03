import { validateMatchUpScore, validateSetScore } from '@Validators/validateMatchUpScore';
import { getMaxSetScore, getSetComplement } from '@Query/matchUp/getComplement';
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { enterValues } from '../../helpers/keyValueScore/primitives';
import { validateScore } from '@Validators/validateScore';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { describe, expect, it } from 'vitest';
import {
  isTiebreakGamesScore,
  tiebreakSetCeiling,
  tiebreakSetGames,
  wonWithoutTiebreak,
  reachedTiebreak,
} from '@Query/matchUp/tiebreakAtRules';

import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * A tiebreak is played where the format says, and `@12` is above `setTo`.
 *
 * `SET5-S:6/TB7-F:6/TB7@12` is Wimbledon 2019, a code in the published format table. Every answerer
 * assumed the tiebreak sits at `setTo` or one below, so this deciding set had no legal completed
 * outcome: 7-5, 12-10 and 13-12(5) were all refused and a 7-6(5) was accepted (validator debate G1,
 * 2026-10-02). One rule in `tiebreakAtRules`, read by all of them.
 */
const AT_TWELVE = 'SET3-S:6/TB7@12';
const WIMBLEDON = 'SET5-S:6/TB7-F:6/TB7@12';
const PRO_SET_AT_SEVEN = 'SET1-S:8/TB7@7';
const AT_FIVE = 'SET3-S:6/TB7@5';
const AT_SIX = 'SET3-S:6/TB7';

const won = (side1Score: number, side2Score: number, extra: Record<string, number> = {}, setNumber = 1) => ({
  setNumber,
  side1Score,
  side2Score,
  winningSide: side1Score > side2Score ? 1 : 2,
  ...extra,
});
const tb = (s1: number, s2: number, t1: number, t2: number, setNumber = 1) =>
  won(s1, s2, { side1TiebreakScore: t1, side2TiebreakScore: t2 }, setNumber);
const twoSets = (first: any) => [first, { ...won(6, 4), setNumber: 2 }];

describe('the rule', () => {
  it('names the games a tiebreak set ends at, wherever the tiebreak is', () => {
    expect(tiebreakSetGames({ setTo: 6, tiebreakAt: 6 })).toEqual({ winner: 7, loser: 6 });
    expect(tiebreakSetGames({ setTo: 6, tiebreakAt: 5 })).toEqual({ winner: 6, loser: 5 });
    expect(tiebreakSetGames({ setTo: 6, tiebreakAt: 12 })).toEqual({ winner: 13, loser: 12 });
    expect(tiebreakSetGames({ setTo: 8, tiebreakAt: 7 })).toEqual({ winner: 8, loser: 7 });
    expect(tiebreakSetGames({ setTo: 6, noTiebreak: true })).toBeUndefined();
    expect(tiebreakSetCeiling({ setTo: 6, tiebreakAt: 12 })).toBe(13);
  });

  it('a set is won without the tiebreak by the margin while the loser is below the tiebreak games', () => {
    const at12 = { setTo: 6, tiebreakAt: 12 };
    expect(wonWithoutTiebreak(7, 5, at12)).toBe(true);
    expect(wonWithoutTiebreak(12, 10, at12)).toBe(true);
    expect(wonWithoutTiebreak(13, 11, at12)).toBe(true);
    expect(wonWithoutTiebreak(14, 12, at12)).toBe(false);
    expect(wonWithoutTiebreak(7, 6, at12)).toBe(false);
    // a set ends the moment the margin is reached: 7-3 and 8-5 are not scores under any tiebreak
    expect(wonWithoutTiebreak(7, 3, at12)).toBe(false);
    expect(wonWithoutTiebreak(8, 5, at12)).toBe(false);
    expect(wonWithoutTiebreak(7, 3, { setTo: 6, tiebreakAt: 6 })).toBe(false);
    expect(wonWithoutTiebreak(24, 22, { setTo: 6, noTiebreak: true })).toBe(true);
    expect(wonWithoutTiebreak(9, 3, { setTo: 6, noTiebreak: true })).toBe(false);
    expect(wonWithoutTiebreak(7, 5, { setTo: 6, tiebreakAt: 5 })).toBe(false);
    expect(wonWithoutTiebreak(8, 6, { setTo: 6, tiebreakAt: 6 })).toBe(false);
    expect(isTiebreakGamesScore(13, 12, at12)).toBe(true);
    expect(reachedTiebreak(12, 12, at12)).toBe(true);
    expect(reachedTiebreak(7, 6, at12)).toBe(false);
  });
});

describe('the deciding set at twelve-all: every answerer agrees', () => {
  const format = parse(WIMBLEDON);
  const decider = (s1: number, s2: number, t1?: number, t2?: number) =>
    t1 === undefined ? won(s1, s2, {}, 5) : tb(s1, s2, t1, t2!, 5);
  const fourSets = [won(6, 4), won(4, 6), won(6, 4), won(4, 6)].map((s, i) => ({ ...s, setNumber: i + 1 }));

  it('7-5, 12-10, 13-11 and 13-12(5) are finished sets; 7-6, 7-6(5) and 14-12 are not', () => {
    for (const [s1, s2, t1, t2] of [
      [7, 5],
      [12, 10],
      [13, 11],
      [13, 12, 7, 5],
    ] as number[][]) {
      const set = decider(s1, s2, t1, t2);
      expect(
        checkSetIsComplete({ set, matchUpScoringFormat: format, isDecidingSet: true }),
        `${s1}-${s2} complete`,
      ).toBe(true);
      expect(analyzeSet({ setObject: set, matchUpScoringFormat: format }).isValidSet, `${s1}-${s2} valid`).toBe(true);
      expect(validateMatchUpScore([...fourSets, set], WIMBLEDON, COMPLETED).isValid, `${s1}-${s2} strict`).toBe(true);
      expect(
        validateScore({
          score: { sets: [...fourSets, set] },
          matchUpFormat: WIMBLEDON,
          winningSide: 1,
          matchUpStatus: COMPLETED,
        }).valid,
        `${s1}-${s2} mutation path`,
      ).toBe(true);
    }
    for (const [s1, s2, t1, t2] of [
      [7, 6],
      [7, 6, 7, 5],
      [14, 12],
    ] as number[][]) {
      const set = decider(s1, s2, t1, t2);
      expect(
        checkSetIsComplete({ set, matchUpScoringFormat: format, isDecidingSet: true }),
        `${s1}-${s2} complete`,
      ).toBe(false);
      expect(analyzeSet({ setObject: set, matchUpScoringFormat: format }).isValidSet, `${s1}-${s2} valid`).toBe(false);
      expect(validateMatchUpScore([...fourSets, set], WIMBLEDON, COMPLETED).isValid, `${s1}-${s2} strict`).toBe(false);
    }
  });

  it('the first four sets keep their tiebreak at six-all — the control', () => {
    expect(checkSetIsComplete({ set: tb(7, 6, 7, 5), matchUpScoringFormat: format })).toBe(true);
    expect(checkSetIsComplete({ set: won(8, 6), matchUpScoringFormat: format })).toBe(false);
  });
});

describe('@12 as the regular set, @7 in a pro set, @5 below setTo', () => {
  it('SET3-S:6/TB7@12: the same answers in set one', () => {
    expect(validateSetScore(won(12, 10), AT_TWELVE).isValid).toBe(true);
    expect(validateSetScore(tb(13, 12, 7, 5), AT_TWELVE).isValid).toBe(true);
    expect(validateSetScore(tb(7, 6, 7, 5), AT_TWELVE).isValid).toBe(false);
    expect(checkSetIsComplete({ set: won(12, 10), matchUpFormat: AT_TWELVE })).toBe(true);
    expect(checkSetIsComplete({ set: won(7, 6), matchUpFormat: AT_TWELVE })).toBe(false);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 12 })).toBe(13);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 12, opponentScore: 3 })).toBe(6);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 12, opponentScore: 8 })).toBe(10);
    expect(getSetComplement({ lowValue: 11, setTo: 6, tiebreakAt: 12 })).toEqual([13, 11]);
    expect(getSetComplement({ lowValue: 8, setTo: 6, tiebreakAt: 12 })).toEqual([10, 8]);
    expect(getSetComplement({ lowValue: 12, setTo: 6, tiebreakAt: 12 })).toEqual([13, 12]);
    expect(getSetComplement({ lowValue: 3, setTo: 6, tiebreakAt: 12 })).toEqual([6, 3]);
  });

  it('SET1-S:8/TB7@7: 8-6 by the margin, 8-7(5) by the tiebreak, 9-7 never', () => {
    expect(validateSetScore(won(8, 6), PRO_SET_AT_SEVEN).isValid).toBe(true);
    expect(validateSetScore(tb(8, 7, 7, 5), PRO_SET_AT_SEVEN).isValid).toBe(true);
    expect(validateSetScore(won(9, 7), PRO_SET_AT_SEVEN).isValid).toBe(false);
    expect(checkSetIsComplete({ set: won(9, 7), matchUpFormat: PRO_SET_AT_SEVEN })).toBe(false);
    expect(getSetComplement({ lowValue: 7, setTo: 8, tiebreakAt: 7 })).toEqual([8, 7]);
    expect(getSetComplement({ lowValue: 6, setTo: 8, tiebreakAt: 7 })).toEqual([8, 6]);
  });

  it('SET3-S:6/TB7@5 is unchanged: 6-5(3) by the tiebreak, 6-4 by the margin, 7-5 never', () => {
    expect(validateSetScore(tb(6, 5, 7, 3), AT_FIVE).isValid).toBe(true);
    expect(validateSetScore(won(6, 4), AT_FIVE).isValid).toBe(true);
    expect(validateSetScore(won(7, 5), AT_FIVE).isValid).toBe(false);
    expect(checkSetIsComplete({ set: won(7, 5), matchUpFormat: AT_FIVE })).toBe(false);
    expect(checkSetIsComplete({ set: tb(6, 5, 7, 3), matchUpFormat: AT_FIVE })).toBe(true);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 5 })).toBe(6);
    expect(getSetComplement({ lowValue: 5, setTo: 6, tiebreakAt: 5 })).toEqual([6, 5]);
    expect(getSetComplement({ lowValue: 3, setTo: 6, tiebreakAt: 5 })).toEqual([6, 3]);
  });

  it('SET3-S:6/TB7 is unchanged: 7-5, 7-6(5), never 8-6 — the control', () => {
    expect(validateSetScore(won(7, 5), AT_SIX).isValid).toBe(true);
    expect(validateSetScore(tb(7, 6, 7, 5), AT_SIX).isValid).toBe(true);
    expect(validateSetScore(won(8, 6), AT_SIX).isValid).toBe(false);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6 })).toBe(7);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, opponentScore: 5 })).toBe(7);
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, opponentScore: 3 })).toBe(6);
    expect(getSetComplement({ lowValue: 5, setTo: 6, tiebreakAt: 6 })).toEqual([7, 5]);
    expect(getSetComplement({ lowValue: 6, setTo: 6, tiebreakAt: 6 })).toEqual([7, 6]);
    expect(getSetComplement({ lowValue: 4, setTo: 6, tiebreakAt: 6 })).toEqual([6, 4]);
    expect(
      validateScore({
        score: { sets: twoSets(won(7, 5)) },
        matchUpFormat: AT_SIX,
        winningSide: 1,
        matchUpStatus: COMPLETED,
      }).valid,
    ).toBe(true);
  });
});

describe('key-value entry under @12', () => {
  it('a low 8 completes to 10-8, a low 6 to 8-6, a low 3 to 6-3', () => {
    // key-value takes one keystroke per side, so games past 9 — and the tiebreak at twelve-all —
    // cannot be typed in this entry mode at all; a limit of key-value entry, not of the rule
    for (const [low, expected] of [
      ['8', '10-8'],
      ['6', '8-6'],
      ['3', '6-3'],
    ]) {
      let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: AT_TWELVE };
      ({ matchUp } = enterValues({ values: [{ lowSide: 2, value: low }], matchUp }));
      expect(matchUp.scoreString.trim(), `low ${low}`).toBe(expected);
      expect(matchUp.score.sets[0].winningSide).toBe(1);
    }
  });

  it('a low 6 under SET3-S:6/TB7 still opens the tiebreak at 7-6( — the control', () => {
    let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: AT_SIX };
    ({ matchUp } = enterValues({ values: [{ lowSide: 2, value: '6' }], matchUp }));
    expect(matchUp.scoreString.trim()).toBe('7-6(');
  });
});

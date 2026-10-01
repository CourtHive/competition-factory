import { validateMatchUpScore, validateSetScore } from '@Validators/validateMatchUpScore';
import { getMaxSetScore, getSetComplement } from '@Query/matchUp/getComplement';
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { analyzeSet } from '@Query/matchUp/analyzeSet';
import { describe, expect, it } from 'vitest';

import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * `NOAD` on a set is a GAMES property. It never shortens the set.
 *
 * Settled by CA, 2026-10-01, on the grammar: `S:6NOAD` is no-advantage game scoring (a deciding point
 * at deuce), `TB7NOAD` is a tiebreak won by one at the target, `S:TB15NOAD` a tiebreak set won by one,
 * and a one-game SET margin is a different token, `WB1`. The ITF's short sets keep "a margin of two
 * games" however the games are scored; the one format where a set really ends at a one-game margin
 * with no tiebreak is TYPTI, which the code spells `S:5WB1`. Five readers in this repo had read set-level
 * `NoAD` as that margin, so the same `6-5` was complete to `checkSetIsComplete`, won to `analyzeSet`,
 * and refused by `validateSetScore` — one score, two answers, and the components card was asking the
 * wrong one. Research and sources: `Mentat/statuses/2026-10-01-noad-at-three-levels-and-the-one-game-set.md`.
 */
const NOAD_GAMES = 'SET3-S:6NOAD/TB7-F:TB10';
const NOAD_ADVANTAGE = 'SET1-S:6NOAD';
const WIN_BY_ONE = 'SET1-S:5WB1';
const NOAD_WIN_BY_ONE = 'SET1-S:4NOADWB1';
const NOAD_TIEBREAK = 'SET3-S:6/TB7NOAD';
const NOAD_TIEBREAK_AT_FIVE = 'SET1-S:6/TB5NOAD@5';
const NOAD_TIEBREAK_SET = 'SET1-S:TB10NOAD';

const set = (side1Score: number, side2Score: number, extra: Record<string, number> = {}) => ({
  setNumber: 1,
  side1Score,
  side2Score,
  winningSide: side1Score > side2Score ? 1 : 2,
  ...extra,
});

describe('a set with no-advantage games still needs two clear games or its tiebreak', () => {
  it('6-5 is NOT complete under S:6NOAD/TB7, and 7-5 is', () => {
    expect(checkSetIsComplete({ set: set(6, 5), matchUpFormat: NOAD_GAMES })).toBe(false);
    expect(checkSetIsComplete({ set: set(7, 5), matchUpFormat: NOAD_GAMES })).toBe(true);
    expect(
      checkSetIsComplete({
        set: set(7, 6, { side1TiebreakScore: 7, side2TiebreakScore: 3 }),
        matchUpFormat: NOAD_GAMES,
      }),
    ).toBe(true);
  });

  it('6-5 is NOT complete under an advantage set with no-ad games either', () => {
    expect(checkSetIsComplete({ set: set(6, 5), matchUpFormat: NOAD_ADVANTAGE })).toBe(false);
    expect(checkSetIsComplete({ set: set(7, 5), matchUpFormat: NOAD_ADVANTAGE })).toBe(true);
    // Not asserted here: an `8-6` in an advantage set. `checkSetIsComplete` reports it incomplete with or
    // without `NOAD` — `requiresTiebreak` fires on both sides at `setTo` even where the format declares
    // `noTiebreak` — which is a separate defect, measured 2026-10-01 and tracked in Mentat TASKS.md.
  });

  it('analyzeSet names no winner for a 6-5 under no-ad games', () => {
    const matchUpScoringFormat = parse(NOAD_GAMES);
    const six = analyzeSet({ setObject: set(6, 5), matchUpScoringFormat });
    expect(six.isValidSetOutcome).toBe(false);
    expect(six.winningSide).toBeUndefined();

    // `winningSide` only: `analyzeSet` also reports `isValidSetOutcome: false` for a 7-5 under the plain
    // `SET3-S:6/TB7` ("invalid winning game scoreString (2)"), with or without `NOAD` — a separate
    // defect in `validateTiebreakCondition`, measured 2026-10-01 and tracked in Mentat TASKS.md.
    const seven = analyzeSet({ setObject: set(7, 5), matchUpScoringFormat });
    expect(seven.winningSide).toBe(1);
  });

  it('a 5 completes to a 7, not a 6, under no-ad games with no tiebreak', () => {
    expect(getSetComplement({ lowValue: 5, setTo: 6, NoAD: true })).toEqual([7, 5]);
    expect(getSetComplement({ lowValue: 5, setTo: 6, tiebreakAt: 6, NoAD: true })).toEqual([7, 5]);
    expect(getSetComplement({ lowValue: 3, setTo: 6, NoAD: true })).toEqual([6, 3]);
  });

  it('an advantage set with no-ad games has no ceiling, and a tiebreak set to six caps at seven', () => {
    expect(getMaxSetScore({ setTo: 6, NoAD: true })).toBeUndefined();
    expect(getMaxSetScore({ setTo: 6, tiebreakAt: 6, NoAD: true })).toBe(7);
  });

  it('the strict validator refuses 6-5 under no-ad games and accepts 7-5', () => {
    expect(validateMatchUpScore([set(6, 5), set(6, 4)], NOAD_GAMES, COMPLETED).isValid).toBe(false);
    expect(validateMatchUpScore([set(7, 5), set(6, 4)], NOAD_GAMES, COMPLETED).isValid).toBe(true);
  });
});

describe('a one-game SET margin is WB1, the token the grammar reserves for it', () => {
  it('5-4 wins a set to five, win by one (TYPTI)', () => {
    expect(checkSetIsComplete({ set: set(5, 4), matchUpFormat: WIN_BY_ONE })).toBe(true);
    expect(getMaxSetScore({ setTo: 5, winBy: 1 })).toBe(5);
    expect(getSetComplement({ lowValue: 4, setTo: 5, winBy: 1 })).toEqual([5, 4]);
    expect(validateSetScore(set(5, 4), WIN_BY_ONE, true).isValid).toBe(true);
  });

  it('4-3 wins a set to four with no-ad games AND win by one — the two tokens together', () => {
    expect(checkSetIsComplete({ set: set(4, 3), matchUpFormat: NOAD_WIN_BY_ONE })).toBe(true);
    const analysis = analyzeSet({ setObject: set(4, 3), matchUpScoringFormat: parse(NOAD_WIN_BY_ONE) });
    expect(analysis.winningSide).toBe(1);
  });

  it('but 5-4 does NOT win a set to five whose only modifier is no-ad games — the control', () => {
    expect(checkSetIsComplete({ set: set(5, 4), matchUpFormat: 'SET1-S:5NOAD' })).toBe(false);
  });
});

describe('a no-ad TIEBREAK is won by one at the target', () => {
  it('7-6(6) is a finished set under TB7NOAD, and the validator agrees with the analysis', () => {
    const tb = set(7, 6, { side1TiebreakScore: 7, side2TiebreakScore: 6 });
    expect(checkSetIsComplete({ set: tb, matchUpFormat: NOAD_TIEBREAK })).toBe(true);
    expect(validateMatchUpScore([tb, set(6, 4)], NOAD_TIEBREAK, COMPLETED).isValid).toBe(true);
    // the same points under a tiebreak that needs two: refused, by both
    expect(checkSetIsComplete({ set: tb, matchUpFormat: 'SET3-S:6/TB7' })).toBe(false);
    expect(validateMatchUpScore([tb, set(6, 4)], 'SET3-S:6/TB7', COMPLETED).isValid).toBe(false);
  });

  it("6-5(4) is a finished set under the ITF short-set style TB5NOAD@5 — the mocks' own score", () => {
    const tb = set(6, 5, { side1TiebreakScore: 5, side2TiebreakScore: 4 });
    expect(validateMatchUpScore([tb], NOAD_TIEBREAK_AT_FIVE, COMPLETED).isValid).toBe(true);
    expect(checkSetIsComplete({ set: tb, matchUpFormat: NOAD_TIEBREAK_AT_FIVE })).toBe(true);
  });

  it('a no-ad tiebreak cannot run past its target: 8-6 is refused where 7-6 is the end', () => {
    const past = set(7, 6, { side1TiebreakScore: 8, side2TiebreakScore: 6 });
    expect(validateMatchUpScore([past, set(6, 4)], NOAD_TIEBREAK, COMPLETED).isValid).toBe(false);
  });

  it('[10-9] wins a no-ad tiebreak set and loses an ordinary one', () => {
    const tbSet = {
      setNumber: 1,
      side1Score: 0,
      side2Score: 0,
      side1TiebreakScore: 10,
      side2TiebreakScore: 9,
      winningSide: 1,
    };
    expect(validateMatchUpScore([tbSet], NOAD_TIEBREAK_SET, COMPLETED).isValid).toBe(true);
    expect(validateMatchUpScore([tbSet], 'SET1-S:TB10', COMPLETED).isValid).toBe(false);
  });
});

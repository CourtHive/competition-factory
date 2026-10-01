import { validateMatchUpScore, validateSetScore } from '@Validators/validateMatchUpScore';
import { enterValues, scoreMatchUp } from '../helpers/keyValueScore/primitives';
import { retainScoreForFormat } from '@Query/matchUp/retainScoreForFormat';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { checkSetIsComplete } from '@Query/matchUp/checkSetIsComplete';
import { setHasTiebreak } from '@Mutate/scoring/addPoint';
import { validateScore } from '@Validators/validateScore';
import { describe, expect, it } from 'vitest';

import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * A format with no tiebreak has no tiebreak. Settled by CA 2026-10-02 from the validator debate: the
 * ScoringEngine played a full TB7 at six-all in `SET1-S:6`; the strict validator and the mutation path
 * accepted `7-6(5)` in an advantage set and `retainScoreForFormat` carried it across; key-value entry
 * opened a tiebreak the format lacks and ignored `winBy`. One reading, `setHasTiebreak`, at every site.
 */
const ADVANTAGE = 'SET1-S:6';
const ADVANTAGE_DECIDER = 'SET5-S:6/TB7-F:6';
const WIN_BY_ONE = 'SET1-S:5WB1';
const TIEBREAK = 'SET3-S:6/TB7';

const won = (side1Score: number, side2Score: number, extra: Record<string, number> = {}) => ({
  setNumber: 1,
  side1Score,
  side2Score,
  winningSide: side1Score > side2Score ? 1 : 2,
  ...extra,
});
const tb = (s1: number, s2: number, t1: number, t2: number, setNumber = 1) => ({
  ...won(s1, s2, { side1TiebreakScore: t1, side2TiebreakScore: t2 }),
  setNumber,
});

describe('the one reading', () => {
  it('a parsed advantage set has no tiebreak; a parsed tiebreak set has; a bare format is an advantage set', () => {
    expect(setHasTiebreak({ setTo: 6, noTiebreak: true })).toBe(false);
    expect(setHasTiebreak({ setTo: 6, tiebreakFormat: { tiebreakTo: 7 }, tiebreakAt: 6 })).toBe(true);
    expect(setHasTiebreak({ setTo: 6 })).toBe(false);
    expect(setHasTiebreak(undefined)).toBe(false);
  });
});

describe('the engine plays no tiebreak in an advantage set', () => {
  function playTo(engine: any, games: number) {
    for (let g = 0; g < games; g += 1) for (let p = 0; p < 4; p += 1) engine.addPoint({ winner: g % 2 === 0 ? 0 : 1 });
  }

  it('from six-all the next seven points to one side are a GAME, not the set', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: ADVANTAGE });
    playTo(engine, 12);
    for (let p = 0; p < 7; p += 1) engine.addPoint({ winner: 0 });
    const set = engine.getState().score.sets[0];
    expect(set.side1TiebreakScore, 'no tiebreak was played').toBeUndefined();
    expect([set.side1Score, set.side2Score]).toEqual([7, 6]);
    expect(engine.getState().matchUpStatus).not.toBe(COMPLETED);
  });

  it('and 8-6 ends it, which checkSetIsComplete agrees with', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: ADVANTAGE });
    playTo(engine, 12);
    for (let p = 0; p < 8; p += 1) engine.addPoint({ winner: 0 });
    const set = engine.getState().score.sets[0];
    expect([set.side1Score, set.side2Score]).toEqual([8, 6]);
    expect(engine.getState().matchUpStatus).toBe(COMPLETED);
    expect(checkSetIsComplete({ set, matchUpFormat: ADVANTAGE })).toBe(true);
  });

  it('the deciding set of SET5-S:6/TB7-F:6 behaves the same — the case that already worked', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: ADVANTAGE_DECIDER });
    engine.setInitialScore?.({
      sets: [won(6, 4), won(4, 6), won(6, 4), won(4, 6)].map((s, i) => ({ ...s, setNumber: i + 1 })),
    });
    playTo(engine, 12);
    for (let p = 0; p < 7; p += 1) engine.addPoint({ winner: 0 });
    const last = engine.getState().score.sets.at(-1);
    expect(last.side1TiebreakScore).toBeUndefined();
  });

  it('a set WITH a tiebreak still plays one — the control', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: TIEBREAK });
    playTo(engine, 12);
    for (let p = 0; p < 7; p += 1) engine.addPoint({ winner: 0 });
    const set = engine.getState().score.sets[0];
    expect(set.side1TiebreakScore).toBe(7);
    expect([set.side1Score, set.side2Score]).toEqual([7, 6]);
  });
});

describe('the validators refuse a tiebreak the format does not have', () => {
  it('7-6(5) is not a set in SET1-S:6, on the strict validator and on the mutation path', () => {
    expect(validateSetScore(tb(7, 6, 7, 5), ADVANTAGE).isValid).toBe(false);
    expect(validateMatchUpScore([tb(7, 6, 7, 5)], ADVANTAGE, COMPLETED).isValid).toBe(false);
    expect(
      validateScore({
        score: { sets: [tb(7, 6, 7, 5)] },
        matchUpFormat: ADVANTAGE,
        winningSide: 1,
        matchUpStatus: COMPLETED,
      }).error,
    ).toBeDefined();
  });

  it('tiebreak points on an 8-6 are refused too, so the points themselves are the offence', () => {
    // 8-6 by games is a finished advantage set; the same games carrying tiebreak points are not a
    // score that format can produce, and the mutation path has to say so on its own, not through the
    // margin rule that already refuses a 7-6
    const pointsOnEightSix = tb(8, 6, 7, 5);
    expect(validateSetScore(pointsOnEightSix, ADVANTAGE).isValid).toBe(false);
    expect(
      validateScore({
        score: { sets: [pointsOnEightSix] },
        matchUpFormat: ADVANTAGE,
        winningSide: 1,
        matchUpStatus: COMPLETED,
      }).error,
    ).toBeDefined();
  });

  it('nor is a 7-6 with no points; 8-6 and 7-5 are', () => {
    expect(validateSetScore(won(7, 6), ADVANTAGE).isValid).toBe(false);
    expect(
      validateScore({
        score: { sets: [won(7, 6)] },
        matchUpFormat: ADVANTAGE,
        winningSide: 1,
        matchUpStatus: COMPLETED,
      }).error,
    ).toBeDefined();
    expect(validateSetScore(won(8, 6), ADVANTAGE).isValid).toBe(true);
    expect(validateSetScore(won(7, 5), ADVANTAGE).isValid).toBe(true);
    expect(
      validateScore({
        score: { sets: [won(8, 6)] },
        matchUpFormat: ADVANTAGE,
        winningSide: 1,
        matchUpStatus: COMPLETED,
      }).valid,
    ).toBe(true);
  });

  it('the same in the deciding set of SET5-S:6/TB7-F:6, where the first four sets DO have one', () => {
    const sets = [won(6, 4), won(4, 6), won(6, 4), won(4, 6)].map((s, i) => ({ ...s, setNumber: i + 1 }));
    expect(validateMatchUpScore([...sets, tb(7, 6, 7, 5, 5)], ADVANTAGE_DECIDER, COMPLETED).isValid).toBe(false);
    expect(validateMatchUpScore([...sets, { ...won(8, 6), setNumber: 5 }], ADVANTAGE_DECIDER, COMPLETED).isValid).toBe(
      true,
    );
    expect(
      validateMatchUpScore(
        [tb(7, 6, 7, 5, 1), { ...won(6, 4), setNumber: 2 }, { ...won(6, 4), setNumber: 3 }],
        ADVANTAGE_DECIDER,
        COMPLETED,
      ).isValid,
    ).toBe(true);
  });

  it('retainScoreForFormat drops a 7-6(5) when the format loses its tiebreak', () => {
    const retained = retainScoreForFormat({
      sets: [tb(7, 6, 7, 5)],
      matchUpFormat: ADVANTAGE,
      previousMatchUpFormat: TIEBREAK,
    });
    expect(retained.sets).toEqual([]);
    expect(retained.discarded).toHaveLength(1);
  });

  it('a 5-4 in S:5WB1 is still a set, and 7-6(5) under a tiebreak format still is — the controls', () => {
    expect(validateSetScore(won(5, 4), WIN_BY_ONE).isValid).toBe(true);
    expect(validateSetScore(tb(7, 6, 7, 5), TIEBREAK).isValid).toBe(true);
    // two sets, because the mutation path also wants the winner to hold the set majority
    expect(
      validateScore({
        score: { sets: [tb(7, 6, 7, 5), { ...won(6, 4), setNumber: 2 }] },
        matchUpFormat: TIEBREAK,
        winningSide: 1,
        matchUpStatus: COMPLETED,
      }).valid,
    ).toBe(true);
  });
});

describe('key-value entry opens no tiebreak in an advantage set, and honours winBy', () => {
  it('a low 6 under SET1-S:6 completes to 8-6, not "7-6("', () => {
    let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: ADVANTAGE };
    ({ matchUp } = enterValues({ values: [{ lowSide: 2, value: '6' }], matchUp }));
    expect(matchUp.scoreString.trim()).toBe('8-6');
    expect(matchUp.score.sets[0].winningSide).toBe(1);
  });

  it('a low 5 under SET1-S:6 completes to 7-5', () => {
    let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: ADVANTAGE };
    ({ matchUp } = enterValues({ values: [{ lowSide: 2, value: '5' }], matchUp }));
    expect(matchUp.scoreString.trim()).toBe('7-5');
  });

  it('a low 4 under SET1-S:5WB1 completes to 5-4', () => {
    let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: WIN_BY_ONE };
    ({ matchUp } = enterValues({ values: [{ lowSide: 2, value: '4' }], matchUp }));
    expect(matchUp.scoreString.trim()).toBe('5-4');
    expect(matchUp.score.sets[0].winningSide).toBe(1);
  });

  it('correcting the second side by hand: 6-7 is still being played, 6-8 is finished, 6-9 is refused', () => {
    // key-value derives the high side from the low one, so the incomplete-set path is reached the way an
    // operator reaches it — backspacing to "6-" and typing the other side
    let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: ADVANTAGE };
    ({ matchUp } = enterValues({ values: [{ lowSide: 1, value: '6' }], matchUp }));
    expect(matchUp.scoreString.trim()).toBe('6-8');
    ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
    expect(matchUp.scoreString.trim()).toBe('6-');

    ({ matchUp } = scoreMatchUp({ value: '7', matchUp }));
    expect(matchUp.scoreString.trim()).toBe('6-7');
    expect(matchUp.score.sets[0].winningSide).toBeUndefined();

    ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
    ({ matchUp } = scoreMatchUp({ value: '8', matchUp }));
    expect(matchUp.scoreString.trim()).toBe('6-8');
    expect(matchUp.score.sets[0].winningSide).toBe(2);

    ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
    ({ matchUp } = scoreMatchUp({ value: '9', matchUp }));
    expect(matchUp.scoreString.trim(), 'a set that ended at 6-8 cannot read 6-9').toBe('6-');
  });

  it('a low 6 under SET3-S:6/TB7 still opens the tiebreak — the control', () => {
    let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat: TIEBREAK };
    ({ matchUp } = enterValues({ values: [{ lowSide: 2, value: '6' }], matchUp }));
    expect(matchUp.scoreString.trim()).toBe('7-6(');
  });
});

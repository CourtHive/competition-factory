import { generateOutcome } from '@Assemblies/generators/mocks/generateOutcome';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { checkScoreCompleteness } from '@Validators/scoreCompleteness';
import { parseScoreString } from '@Tools/parseScoreString';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/**
 * CA, 2026-10-04: *"-F:TB1 is a 'sudden death' tiebreak which only occurs in matchUps which are decided by
 * aggregate point scoring. In the INTENNSE competition format that is not to be considered one of the N
 * sets."*
 *
 * So in `SET3XA-S:T10-F:TB1` all three bolts are timed, and the tiebreak is set 4, played only when the
 * totals are level. Every layer read it as set 3 instead (measured 2026-10-04):
 * - the live engine scored bolt 3 itself as the sudden death once the first two bolts split
 * - the validators refused three timed bolts plus a decider, and accepted two bolts plus a decider
 * - the mock generator produced two bolts and a tiebreak, 200 times out of 200
 */
const FORMAT = 'SET3XA-S:T10-F:TB1';

type Row = [number, number];
const boltWinner = (side1Score: number, side2Score: number) => {
  if (side1Score === side2Score) return undefined;
  return side1Score > side2Score ? 1 : 2;
};
const bolts = (rows: Row[]) =>
  rows.map(([side1Score, side2Score], index) => ({
    winningSide: boltWinner(side1Score, side2Score),
    setNumber: index + 1,
    side1Score,
    side2Score,
  }));
const decider = (setNumber: number) => ({ setNumber, side1TiebreakScore: 1, side2TiebreakScore: 0, winningSide: 1 });

describe('the live engine plays every bolt, then the sudden death', () => {
  function play(matchUpFormat: string, boltPoints: Row[]) {
    const engine = new ScoringEngine({ matchUpFormat });
    for (const [side1, side2] of boltPoints) {
      for (let point = 0; point < side1; point++) engine.addPoint({ winner: 0 });
      for (let point = 0; point < side2; point++) engine.addPoint({ winner: 1 });
      engine.endSegment();
    }
    return engine;
  }

  it('scores bolt 3 as a bolt after the first two split', () => {
    const engine = play(FORMAT, [
      [3, 1],
      [1, 3],
    ]);
    engine.addPoint({ winner: 0 });
    const state = engine.getState();
    expect(state.matchUpStatus).toEqual(IN_PROGRESS);
    // the point is a bolt point in set 3, not a tiebreak point
    expect(state.score.sets[2]).toMatchObject({ side1Score: 1, side2Score: 0 });
    expect(state.score.sets[2].side1TiebreakScore).toBeUndefined();
  });

  it('settles three level bolts with a set-4 sudden death', () => {
    const engine = play('SET3XA-S:T10-F:TB1NOAD', [
      [3, 1],
      [1, 3],
      [2, 2],
    ]);
    expect(engine.getState().matchUpStatus).toEqual(IN_PROGRESS);
    engine.addPoint({ winner: 1 });
    const state = engine.getState();
    expect(state.matchUpStatus).toEqual(COMPLETED);
    expect(state.winningSide).toEqual(2);
    expect(state.score.sets).toHaveLength(4);
    expect(state.score.sets[3]).toMatchObject({ side1TiebreakScore: 0, side2TiebreakScore: 1, winningSide: 2 });
  });

  it('plays no decider when the bolts are not level', () => {
    const engine = play(FORMAT, [
      [3, 1],
      [1, 2],
      [1, 1],
    ]);
    const state = engine.getState();
    expect(state.matchUpStatus).toEqual(COMPLETED);
    expect(state.winningSide).toEqual(1);
    expect(state.score.sets).toHaveLength(3);
  });
});

describe('the validators accept the decider after the bolts, and only there', () => {
  const levelBolts = bolts([
    [30, 25],
    [25, 30],
    [20, 20],
  ]);
  const twoBoltsAndADecider = [
    ...bolts([
      [30, 25],
      [25, 30],
    ]),
    decider(3),
  ];

  it('accepts three level bolts and a set-4 decider', () => {
    const sets = [...levelBolts, decider(4)];
    expect(validateMatchUpScore(sets, FORMAT, COMPLETED).isValid).toEqual(true);
    expect(
      checkScoreCompleteness({ matchUpFormat: FORMAT, matchUpStatus: COMPLETED, winningSide: 1, sets }).isComplete,
    ).toEqual(true);
  });

  it('refuses a decider in place of bolt 3', () => {
    expect(validateMatchUpScore(twoBoltsAndADecider, FORMAT, COMPLETED).isValid).toEqual(false);
    expect(
      checkScoreCompleteness({
        matchUpFormat: FORMAT,
        matchUpStatus: COMPLETED,
        winningSide: 1,
        sets: twoBoltsAndADecider,
      }).isComplete,
    ).toEqual(false);
  });

  it('parses the decider as set 4, a tiebreak set', () => {
    const sets = parseScoreString({ scoreString: '30-25 25-30 20-20 [1-0]', matchUpFormat: FORMAT });
    expect(sets).toHaveLength(4);
    expect(sets[2].tiebreakSet).toBeUndefined();
    expect(sets[3]).toMatchObject({ side1TiebreakScore: 1, side2TiebreakScore: 0, tiebreakSet: true });
  });
});

it('the mock generator plays every bolt, and adds the decider only to a level total', () => {
  for (let index = 0; index < 100; index++) {
    const { outcome }: any = generateOutcome({ matchUpFormat: FORMAT, matchUpStatusProfile: {} });
    const { sets } = outcome.score;
    const timed = sets.filter((set) => set.side1TiebreakScore === undefined);
    expect(timed).toHaveLength(3);
    if (sets.length === 4) {
      const total = (side: 1 | 2) => timed.reduce((sum, set) => sum + set[`side${side}Score`], 0);
      expect(total(1)).toEqual(total(2));
      expect(sets[3].setNumber).toEqual(4);
    } else {
      expect(sets).toHaveLength(3);
    }
  }
});

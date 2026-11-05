import { countGames, countPoints } from '@Query/matchUps/roundRobinTally/scoreCounters';
import { checkSetIsComplete } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
import { inputLevels } from '@Helpers/matchUpFormatCode/formatUtilities';
import { calculatePointsTo } from '@Mutate/scoring/pointsToCalculator';
import { getSetWinningSide } from '@Query/matchUp/getSetWinningSide';
import { ScoringEngine } from '@Assemblies/engines/scoring';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

/**
 * The paths a `-F:SO{n}` shootout reaches once overtime opens for new use (overtime activation S6, before the gate):
 * a shootout is a final tally, so it is complete when its tally could have ended a shootout, it takes no point or
 * game input, it has no points-to, and its goals are neither games nor points in a round-robin tally.
 */

const OVERTIME = 'SET2XA-S:T45P-O:2X/T15P-F:SO5';
const parsed = () => parse(OVERTIME) as any;
const shootoutFormat = { shootout: 5 };

// 1-1 in regulation, 0-0 through both extra-time periods, then the shootout (set five)
const level = [
  { setNumber: 1, side1Score: 1, side2Score: 0 },
  { setNumber: 2, side1Score: 0, side2Score: 1 },
  { setNumber: 3, side1Score: 0, side2Score: 0 },
  { setNumber: 4, side1Score: 0, side2Score: 0 },
];

describe('a shootout set is complete when its tally could end a shootout', () => {
  it.each([
    [{ side1Score: 4, side2Score: 3 }, true],
    [{ side1Score: 3, side2Score: 5 }, true],
    [{ side1Score: 7, side2Score: 6 }, true],
    [{ side1Score: 3, side2Score: 3 }, false],
    [{ side1Score: 0, side2Score: 0 }, false],
    [{ side1Score: 4, side2Score: 0 }, false],
    [{ side1Score: 7, side2Score: 5 }, false],
  ])('%j', (set, complete) => {
    expect(checkSetIsComplete({ matchUpFormat: OVERTIME, isDecidingSet: true, set })).toBe(complete);
  });

  it('and names the winner of a complete one only', () => {
    const args = { matchUpScoringFormat: parsed(), isDecidingSet: true };
    expect(getSetWinningSide({ ...args, setObject: { side1Score: 3, side2Score: 5 } as any })).toBe(2);
    expect(getSetWinningSide({ ...args, setObject: { side1Score: 3, side2Score: 3 } as any })).toBeUndefined();
  });
});

describe('a shootout takes no point or game input', () => {
  it('inputLevels', () => {
    expect(inputLevels(shootoutFormat as any)).toEqual({ point: false, game: false, set: true });
  });

  it('and has no points-to', () => {
    const matchUp: any = { matchUpFormat: OVERTIME, score: { sets: [...level, { setNumber: 5 }] } };
    expect(calculatePointsTo(matchUp, parsed(), 'standard', shootoutFormat as any, 0)).toBeUndefined();
  });

  it('nor a points-to situation in the scoring engine', () => {
    const engine = new ScoringEngine({ matchUpFormat: OVERTIME, allowOvertime: true } as any);
    for (const set of level) engine.addSet({ side1Score: set.side1Score, side2Score: set.side2Score } as any);
    // the shootout is the set in play: the engine took all four periods and the match is still level
    expect(engine.getState().score.sets).toHaveLength(4);
    expect(engine.isComplete()).toBe(false);
    const situation: any = engine.getScore().situation;
    expect(situation?.isMatchPoint ?? false).toBe(false);
    expect(situation?.isGamePoint ?? false).toBe(false);
  });
});

describe('a round-robin tally', () => {
  const sets = [...level, { setNumber: 5, side1Score: 4, side2Score: 3, winningSide: 1 }];

  it('counts no shootout goal as a game', () => {
    expect(countGames({ matchUpFormat: OVERTIME, winningSide: 1, score: { sets } as any })).toEqual([0, 0]);
  });

  it('nor as a point: the sporting aggregate is regulation and overtime', () => {
    expect(countPoints({ matchUpFormat: OVERTIME, score: { sets } as any }).pointsTally).toEqual([1, 1]);
  });

  it("reads an overtime period by the overtime segment's own basis", () => {
    // regulation counts goals as points (P), the extra-time periods as games (no basis)
    const mixed = 'SET2XA-S:T45P-O:2X/T15-F:SO5';
    expect(parse(mixed)?.overtimeFormat?.setFormat?.based).not.toEqual('P');
    const scored = [
      { setNumber: 1, side1Score: 1, side2Score: 0 },
      { setNumber: 2, side1Score: 0, side2Score: 1 },
      { setNumber: 3, side1Score: 2, side2Score: 0 },
      { setNumber: 4, side1Score: 0, side2Score: 1 },
    ];
    expect(countGames({ matchUpFormat: mixed, winningSide: 1, score: { sets: scored } as any })).toEqual([2, 1]);
    expect(countPoints({ matchUpFormat: mixed, score: { sets: scored } as any }).pointsTally).toEqual([1, 1]);
  });
});

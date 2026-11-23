import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/*
 * A game in a tiebreak-only segment (scoring-engine spec § 2.2, § 5; § 16 decision 11, CA 2026-10-18): "A
 * game given as game input in a tiebreak-only segment is the segment won 1-0, with tiebreakScore as its
 * points, checked against the race to n (11-9 is accepted for TB11, 11-10 is refused); the input levels keep
 * offering game there." v1 added one point toward the target, so SET3-S:TB11 needed eleven addGame calls for
 * a set.
 */

function setScores(engine: ScoringEngine) {
  return engine
    .getState()
    .score.sets.map((set) => [
      set.side1Score,
      set.side2Score,
      set.winningSide,
      set.side1TiebreakScore,
      set.side2TiebreakScore,
    ]);
}

describe('§ 5 a game in a tiebreak-only segment is the segment won 1-0 (CA 2026-10-18, decision 11)', () => {
  it('SET3-S:TB11: one addGame wins a set, and two win the match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    engine.addGame({ winner: 0 });
    expect(setScores(engine)).toEqual([[1, 0, 1, undefined, undefined]]);
    engine.addGame({ winner: 0, tiebreakScore: [11, 9] });
    expect(setScores(engine)).toEqual([
      [1, 0, 1, undefined, undefined],
      [1, 0, 1, 11, 9],
    ]);
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
  });

  it('a tiebreakScore that does not win the race to n for the winner is refused', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    expect(() => engine.addGame({ winner: 0, tiebreakScore: [11, 10] })).toThrow(/race to 11/);
    expect(() => engine.addGame({ winner: 1, tiebreakScore: [11, 9] })).toThrow(/race to 11/);
    expect(engine.getState().score.sets).toEqual([]);
  });

  it('a match tiebreak in lieu of the final set is one too: SET3-S:6/TB7-F:TB10', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
    engine.addSet({ side1Score: 6, side2Score: 3 });
    engine.addSet({ side1Score: 3, side2Score: 6 });
    engine.addGame({ winner: 1, tiebreakScore: [8, 10] });
    expect(setScores(engine).at(-1)).toEqual([0, 1, 2, 8, 10]);
    expect(engine.getWinner()).toEqual(2);
  });

  it('a game interrupts a set in play point by point: the set is won 1-0', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    for (let i = 0; i < 5; i++) engine.addPoint({ winner: 1 });
    engine.addGame({ winner: 1 });
    expect(setScores(engine)).toEqual([[0, 1, 2, undefined, undefined]]);
    expect(engine.getInputLevels().game).toEqual(true);
  });
});

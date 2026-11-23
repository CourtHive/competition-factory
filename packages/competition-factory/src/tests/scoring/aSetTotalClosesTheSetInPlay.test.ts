import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * A set total entered while a set is in play closes that set (scoring-engine spec § 2.3, CA 2026-10-18):
 * "someone casually scoring may only score part of a set, get distracted ... and when they refocus the
 * prior set is over and they need to declare the winner and keep scoring." The open set takes the declared
 * total and winner, judged by its segment's rule; the points and games already recorded in it stay on the
 * history; scoring continues in the next set. v1 appended the total as a new set beside the open one.
 */

function setScores(engine: ScoringEngine) {
  return engine.getState().score.sets.map((set) => [set.side1Score, set.side2Score, set.winningSide]);
}

describe('§ 2.3 a set total closes the set in play (CA 2026-10-18)', () => {
  it('partial points, then addSet: the open set takes the total, its points stay', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (let i = 0; i < 6; i++) engine.addPoint({ winner: 0 }); // 1-0, 30-0
    engine.addSet({ side1Score: 6, side2Score: 3 });
    expect(setScores(engine)).toEqual([[6, 3, 1]]);
    expect(engine.getPointCount()).toEqual(6);

    engine.addPoint({ winner: 1 });
    expect(setScores(engine)).toEqual([
      [6, 3, 1],
      [0, 0, undefined],
    ]);
    expect((engine.getState().history!.points.at(-1) as { set?: number }).set).toEqual(1);
  });

  it('partial games, then addSet: the same, and games continue in the next set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.addSet({ side1Score: 4, side2Score: 6 });
    engine.addGame({ winner: 0 });
    expect(setScores(engine)).toEqual([
      [4, 6, 2],
      [1, 0, undefined],
    ]);
  });

  it('an unfinished declared total needs the side ahead as its winner; a contradiction is refused', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addSet({ side1Score: 4, side2Score: 2, winningSide: 1 });
    expect(setScores(engine)).toEqual([[4, 2, 1]]);
    engine.addGame({ winner: 1 });
    expect(() => engine.addSet({ side1Score: 6, side2Score: 2, winningSide: 2 })).toThrow(/contradicts/);
    expect(setScores(engine)).toEqual([
      [4, 2, 1],
      [0, 1, undefined],
    ]);
  });

  it('undo of that addSet restores the partial set as it was', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    for (let i = 0; i < 2; i++) engine.addPoint({ winner: 1 });
    const partial = engine.getState().score.sets;
    engine.addSet({ side1Score: 6, side2Score: 1 });
    expect(setScores(engine)).toEqual([[6, 1, 1]]);
    engine.undo();
    expect(engine.getState().score.sets).toEqual(partial);
    expect(engine.getScore().pointDisplay).toEqual(['0', '30']);
  });
});

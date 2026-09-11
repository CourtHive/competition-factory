import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';
import { expect, it, describe } from 'vitest';

/** Plays `count` points for the given side. `winner` is 0-indexed on the way IN. */
function playPoints(engine: any, winner: number, count: number) {
  for (let i = 0; i < count; i++) engine.addPoint({ winner });
}

/** getWinner() is 1-based (1 | 2); undefined while the matchUp is live. */
function winnerOf(engine: any) {
  return engine.getWinner();
}

describe('pickleball scoring', () => {
  it('wins a game at the target when ahead by two', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: 'SET1-S:TB11@RALLY' });

    playPoints(engine, 0, 10);
    playPoints(engine, 1, 5);
    expect(winnerOf(engine)).toBeUndefined();

    engine.addPoint({ winner: 0 }); // 11-5
    expect(winnerOf(engine)).toEqual(1);
  });

  it('continues past the target until a side leads by two', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: 'SET1-S:TB11@RALLY' });

    playPoints(engine, 0, 10);
    playPoints(engine, 1, 10); // 10-10
    engine.addPoint({ winner: 0 }); // 11-10 — reaching 11 is not enough
    expect(winnerOf(engine)).toBeUndefined();

    engine.addPoint({ winner: 0 }); // 12-10
    expect(winnerOf(engine)).toEqual(1);
  });

  // falsification: NOAD is the ONLY difference between this and the case above, and it changes
  // the termination rule from win-by-2 to sudden death at the target
  it('ends at the target when NOAD declares sudden death', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: 'SET1-S:TB11NOAD@RALLY' });

    playPoints(engine, 0, 10);
    playPoints(engine, 1, 10); // 10-10
    expect(winnerOf(engine)).toBeUndefined();

    engine.addPoint({ winner: 0 }); // 11-10 wins outright
    expect(winnerOf(engine)).toEqual(1);
  });

  it('takes a best-of-three match on the third game', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11@RALLY' });

    playPoints(engine, 0, 11); // game 1 to side 1
    playPoints(engine, 1, 11); // game 2 to side 2
    expect(winnerOf(engine)).toBeUndefined();

    playPoints(engine, 0, 11); // game 3 to side 1
    expect(winnerOf(engine)).toEqual(1);
  });

  it('scores a game to 21 with the same rules', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: 'SET1-S:TB21@RALLY' });

    playPoints(engine, 0, 20);
    playPoints(engine, 1, 20); // 20-20
    engine.addPoint({ winner: 1 }); // 20-21
    expect(winnerOf(engine)).toBeUndefined();

    engine.addPoint({ winner: 1 }); // 20-22
    expect(winnerOf(engine)).toEqual(2);
  });

  // side-out scoring is the default; the engine derives a server for it and skips derivation
  // under @RALLY, so the two must both be playable through the same point-by-point API
  it('scores a side-out game (no modifier) through the same API', () => {
    const engine: any = new ScoringEngine({ matchUpFormat: 'SET1-S:TB11' });

    playPoints(engine, 0, 11);
    expect(winnerOf(engine)).toEqual(1);
  });
});

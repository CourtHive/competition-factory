import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

// A timed set level at time plays its declared tiebreak (CA 2026-10-17). The clock does not decide a
// tiebreak under way: only its points do.
describe('a timed set level at time', () => {
  it('ignores endSegment while its tiebreak is under way, and the tiebreak decides the set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T20/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment(); // level 1-1 at time: the tiebreak opens
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });
    engine.endSegment(); // a second call does not close the set mid-tiebreak
    expect(engine.getState().score.sets[0]).toMatchObject({ side1TiebreakScore: 0, side2TiebreakScore: 3 });
    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();

    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 1 });
    expect(engine.getState().score.sets[0]).toMatchObject({ side1Score: 1, side2Score: 2, winningSide: 2 });
  });
});

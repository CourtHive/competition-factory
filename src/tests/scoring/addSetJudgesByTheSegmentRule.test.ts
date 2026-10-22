import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { LEGACY_REFUSED_INPUT } from '@Mutate/scoring/matchCompletion';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/*
 * A set total is judged by its segment's rule (scoring-engine spec § 2.3; § 16 decision 6, CA 2026-10-18):
 * 1. a total the rule calls finished is recorded with the winner the rule gives it;
 * 2. an explicit winningSide that contradicts the rule is refused: one naming the loser of a finished total,
 *    or a side that is behind; on an unfinished total an explicit winningSide for the side ahead is a
 *    set-level mercy or manual end;
 * 3. an unfinished total with no winner is recorded as the set in play, open, not refused;
 * 4. a timed segment's total is a finished segment.
 * v1 inferred a winner from any unequal total (SET3-S:6/TB7: 3-1 and 2-0 completed the match).
 */

function lastSet(engine: ScoringEngine) {
  const set = engine.getState().score.sets.at(-1)!;
  return [set.side1Score, set.side2Score, set.winningSide];
}

describe('§ 2.3 rule 1 a finished total gets the rule winner (CA 2026-10-18, decision 6)', () => {
  it.each([
    [6, 4, 1],
    [5, 7, 2],
    [7, 6, 1],
  ])('SET3-S:6/TB7 %i-%i is won by side %i', (side1Score, side2Score, winningSide) => {
    // v1 already gave these their winner; the result now says the total was recorded
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.addSet({ side1Score, side2Score })).toEqual({ recorded: true });
    expect(lastSet(engine)).toEqual([side1Score, side2Score, winningSide]);
    expect(engine.getState().history!.entries!.at(-1)!.data.winningSide).toEqual(winningSide);
  });

  it('a tiebreak-only total is read from its points: SET3-S:TB11 11-9 is won, 11-10 is not', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    engine.addSet({ side1Score: 11, side2Score: 9 });
    expect(lastSet(engine)).toEqual([11, 9, 1]);
    // an unfinished total is the race in play, as a baseline reads it (§ 5 rule 1; SE2a-D13, CA 2026-10-21)
    engine.addSet({ side1Score: 11, side2Score: 10 });
    expect(lastSet(engine)).toEqual([0, 0, undefined]);
    expect(engine.getState().score.sets[1]).toMatchObject({ side1GameScores: [11], side2GameScores: [10] });
    engine.addPoint({ winner: 0 });
    expect(lastSet(engine)).toEqual([1, 0, 1]);
  });
});

describe('§ 2.3 rule 2 an explicit winningSide the rule contradicts is refused (decision 6)', () => {
  it('6-4 given to side 2 is refused, and nothing is written', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(() => engine.addSet({ side1Score: 6, side2Score: 4, winningSide: 2 })).toThrow(/contradicts/);
    expect(engine.getState().score.sets).toEqual([]);
    expect(engine.getState().history?.entries ?? []).toEqual([]);
  });

  it('a side that is behind on an unfinished total is refused', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(() => engine.addSet({ side1Score: 3, side2Score: 1, winningSide: 2 })).toThrow(/not ahead/);
    expect(() => engine.addSet({ side1Score: 2, side2Score: 2, winningSide: 1 })).toThrow(/not ahead/);
    expect(engine.getState().score.sets).toEqual([]);
  });

  it('the side ahead on an unfinished total is a set-level mercy or manual end', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:8' });
    expect(engine.addSet({ side1Score: 6, side2Score: 0, winningSide: 1 })).toEqual({ recorded: true });
    expect(lastSet(engine)).toEqual([6, 0, 1]);
  });

  it("epixodic's set button (6-0 with its winner) is accepted on every kind it posts to", () => {
    for (const matchUpFormat of ['SET3-S:6/TB7', 'SET3-S:8', 'SET3-S:TB11', 'SET3-S:T10', 'SET3-S:4/TB7']) {
      const engine = new ScoringEngine({ matchUpFormat });
      expect(engine.addSet({ side1Score: 0, side2Score: 6, winningSide: 2 })).toEqual({ recorded: true });
      expect(lastSet(engine)).toEqual([0, 6, 2]);
    }
  });
});

describe('§ 2.3 rule 3 an unfinished total with no winner is the set in play (decision 6)', () => {
  it('SET3-S:6/TB7 3-1 then 2-0 do not complete the match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 3, side2Score: 1 });
    expect(lastSet(engine)).toEqual([3, 1, undefined]);
    expect(engine.getState().matchUpStatus).toEqual(IN_PROGRESS);
    expect(engine.getState().history!.entries!.at(-1)!.type).toEqual('set');
  });

  it('6-5 is not won; a point continues the set in play', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 5 });
    expect(lastSet(engine)).toEqual([6, 5, undefined]);
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });
    expect(lastSet(engine)).toEqual([7, 5, 1]);
  });
});

describe('§ 2.3 rule 4 a timed total is a finished segment (decision 6)', () => {
  it('SET3-S:T10 3-1 is won and closed', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    engine.addSet({ side1Score: 3, side2Score: 1 });
    expect(lastSet(engine)).toEqual([3, 1, 1]);
    expect((engine.getState().score.sets[0] as any).segmentComplete).toEqual(true);
  });

  it('SET1-S:T10P level 2-2 is a closed segment: the match ends level (§ 9.7)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:T10P' });
    engine.addSet({ side1Score: 2, side2Score: 2 });
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getState().winningSide).toBeUndefined();
  });

  it('SET3-S:T10/TB7 level 2-2 plays its declared tiebreak at time', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10/TB7' });
    engine.addSet({ side1Score: 2, side2Score: 2 });
    for (let i = 0; i < 7; i++) engine.addPoint({ winner: 1 });
    const set = engine.getState().score.sets[0];
    expect([set.side1Score, set.side2Score, set.winningSide]).toEqual([2, 3, 2]);
    expect([set.side1TiebreakScore, set.side2TiebreakScore]).toEqual([0, 7]);
  });
});

describe('§ 12.8 a stored set total replays with the winner v1 recorded', () => {
  it('a 6-4 v1 recorded for side 2 keeps side 2 on a rebuild, flagged', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    const state = engine.getState();
    state.history!.entries!.push({
      type: 'set',
      data: { side1Score: 6, side2Score: 4, winningSide: 2 },
      timestamp: '2026-10-01T00:00:00Z',
    });
    state.score.sets.push({ setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 2 });

    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    loaded.editPoint(0, { winner: 1 });
    expect(lastSet(loaded)).toEqual([6, 4, 2]);
    expect(loaded.getLegacyShapes()).toContain(LEGACY_REFUSED_INPUT);
  });

  it('a 3-1 v1 recorded with its inferred winner keeps it on a rebuild', () => {
    // a guard: v1 replayed it so, and the rule must not change it
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    const state = engine.getState();
    state.history!.entries!.push({
      type: 'set',
      data: { side1Score: 3, side2Score: 1, winningSide: 1 },
      timestamp: '2026-10-01T00:00:00Z',
    });
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    loaded.editPoint(0, { winner: 1 });
    expect(lastSet(loaded)).toEqual([3, 1, 1]);
  });
});

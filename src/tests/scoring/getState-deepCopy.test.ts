/**
 * Tests for ScoringEngine.getState() deep copy behavior.
 *
 * getState() must return a deep copy so external consumers (e.g. Svelte $state
 * stores, Redux, Zustand) cannot corrupt the engine's internal state by wrapping
 * the returned object in reactive proxies or mutating it directly.
 */

import { describe, test, expect } from 'vitest';
import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';

describe('ScoringEngine.getState() deep copy', () => {
  test('returns a new object on each call (not the same reference)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });

    const state1 = engine.getState();
    const state2 = engine.getState();

    expect(state1).not.toBe(state2);
    expect(state1).toEqual(state2);
  });

  test('mutating returned state does not affect engine internals', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });

    const state = engine.getState();
    // Mutate the returned copy
    state.score.sets[0].side1Score = 999;
    (state as any).matchUpFormat = 'HACKED';

    // Engine should be unaffected
    let result: any = engine.getState();
    expect(result.score.sets[0].side1Score).not.toBe(999);
    expect(result.matchUpFormat).toBe('SET3-S:6/TB7');
  });

  test('mutating returned history does not affect undo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    const state = engine.getState();
    // Delete all history entries on the copy
    state.history!.entries = [];
    state.history!.points = [];

    // Engine undo should still work (internal state untouched)
    const undoResult = engine.undo();
    expect(undoResult).toBe(true);

    let result: any = engine.getState();
    expect(result.history.points.length).toBe(1);
  });

  test('deep copy works with INTENNSE XA timed format', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET2XA-S:T10',
      competitionFormat: {
        matchUpFormat: 'SET2XA-S:T10',
        pointMultipliers: [
          { condition: { results: ['Winner'] }, value: 2 },
          { condition: { results: ['Ace'] }, value: 2 },
        ],
      },
    });

    engine.addPoint({ winner: 0, result: 'Winner' });
    const state = engine.getState();

    expect(state.score.sets[0].side1Score).toBe(2);
    expect(state.score.sets[0].isTimed).toBe(true);

    // Mutate the copy
    state.score.sets[0].side1Score = 0;

    // Engine unaffected
    let result: any = engine.getState();
    expect(result.score.sets[0].side1Score).toBe(2);
  });

  test('getState returns empty score for fresh engine', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    let result: any = engine.getState();

    expect(result.score.sets).toEqual([]);
    expect(result.matchUpStatus).toBe('TO_BE_PLAYED');
  });
});

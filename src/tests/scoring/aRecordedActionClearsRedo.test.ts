import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * The redo stack (scoring-engine spec § 2, § 12.3; § 16 decision 1, CA 2026-10-18): "A recorded action
 * clears the redo stack; an action that changes nothing records nothing and keeps it." v1's endSegment
 * kept the redo stack, so SET3-S:T10P point, point, undo, endSegment, redo replayed the undone point
 * after the segment end, into set 2; and endSegment with no set in play recorded an entry that undo
 * then popped.
 */

function entryTypes(engine: ScoringEngine) {
  return (engine.getState().history?.entries ?? []).map((entry) => entry.type);
}

describe('§ 12.3 a recorded segment end clears the redo stack (CA 2026-10-18, decision 1)', () => {
  it('SET3-S:T10P point, point, undo, endSegment: nothing is left to redo into set 2', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.undo();
    expect(engine.canRedo()).toEqual(true);

    engine.endSegment();
    expect(engine.canRedo()).toEqual(false);
    expect(engine.redo()).toEqual(false);

    const sets = engine.getState().score.sets;
    expect(sets).toHaveLength(1);
    expect([sets[0].side1Score, sets[0].side2Score, sets[0].winningSide]).toEqual([1, 0, 1]);
  });
});

describe('§ 12.3 an action that changes nothing records nothing and keeps the redo stack (decision 1)', () => {
  it('endSegment during the tiebreak at time records nothing and keeps a pending redo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment(); // level at time: the tiebreak opens
    engine.addPoint({ winner: 0 });
    engine.undo();
    const entries = entryTypes(engine);

    const result = engine.endSegment();
    expect(result).toEqual({ recorded: false, ignored: 'TIEBREAK_IN_PLAY' });
    expect(entryTypes(engine)).toEqual(entries);
    expect(engine.canRedo()).toEqual(true);
  });

  it('a setServer naming the orientation already in force records nothing', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setServer(1);
    engine.addPoint({ winner: 0 });
    engine.undo();
    const entries = entryTypes(engine);

    engine.setServer(1);
    expect(entryTypes(engine)).toEqual(entries);
    expect(engine.canRedo()).toEqual(true);
  });

  it('every recorded action clears it: game, set, segment end, baseline, server, challenge, annotation', () => {
    const actions: [string, (engine: ScoringEngine) => void][] = [
      ['game', (engine) => engine.addGame({ winner: 0 })],
      ['set', (engine) => engine.addSet({ side1Score: 6, side2Score: 2 })],
      ['setServer', (engine) => engine.setServer(1)],
      ['challenge', (engine) => engine.addChallenge({ sideNumber: 1 })],
      ['annotation', (engine) => engine.addAnnotation({ note: 'rain delay' })],
    ];
    for (const [type, act] of actions) {
      const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
      engine.addPoint({ winner: 0 });
      engine.undo();
      act(engine);
      expect(entryTypes(engine).at(-1)).toEqual(type);
      expect(engine.canRedo()).toEqual(false);
    }

    const timed = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    timed.addPoint({ winner: 0 });
    timed.addPoint({ winner: 0 });
    timed.undo();
    timed.endSegment();
    expect(timed.canRedo()).toEqual(false);

    const baseline = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    baseline.setServer(1);
    baseline.undo();
    baseline.setInitialScore({ sets: [{ side1Score: 6, side2Score: 3 }] });
    expect(baseline.canRedo()).toEqual(false);
  });
});

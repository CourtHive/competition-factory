/**
 * Tests for ScoringEngine.setServer() recordEntry option.
 *
 * When consumers auto-derive server after each point (e.g. INTENNSE serving
 * rules: winner serves next), the setServer call should NOT record a timeline
 * entry — otherwise undo pops the derived setServer instead of the point.
 *
 * Explicit user corrections (coin toss, mid-match overrides) must still record
 * entries so they are undoable.
 */

import { describe, test, expect } from 'vitest';
import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';

describe('setServer recordEntry option', () => {
  test('setServer records entry by default', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setServer(1);

    let result: any = engine.getState();
    const entries = result.history?.entries ?? [];
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('setServer');
  });

  test('setServer with recordEntry:false does not record entry', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setServer(1, { recordEntry: false });

    let result: any = engine.getState();
    const entries = result.history?.entries ?? [];
    expect(entries.length).toBe(0);
  });

  test('setServer with recordEntry:false still changes the server', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setServer(1, { recordEntry: false });

    expect(engine.getNextServer()).toBe(1);
  });

  test('undo skips derived setServer and undoes the point (INTENNSE pattern)', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET2XA-S:T10',
      competitionFormat: {
        matchUpFormat: 'SET2XA-S:T10',
        pointMultipliers: [
          { condition: { results: ['Winner'] }, value: 2 },
        ],
      },
    });

    // Simulate INTENNSE flow: setServer (coin toss), addPoint, setServer (derived)
    engine.setServer(0); // coin toss — records entry
    engine.addPoint({ winner: 0, result: 'Winner' }); // 2-0
    engine.setServer(0, { recordEntry: false }); // derived — no entry

    let result: any = engine.getState();
    expect(result.score.sets[0].side1Score).toBe(2);

    // Undo should pop the point (not the derived setServer, which wasn't recorded)
    const undoResult = engine.undo();
    expect(undoResult).toBe(true);

    result = engine.getState();
    // Score should revert — no points remain
    const sets = result.score.sets;
    if (sets.length > 0) {
      expect(sets[0].side1Score || 0).toBe(0);
    }
  });

  test('explicit setServer (with entry) is still undoable', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addPoint({ winner: 0, server: 1 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    // Game 1: derived server is 0
    expect(engine.getNextServer()).toBe(0);

    // Explicit override — records entry
    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);

    // Undo the explicit setServer — restores derived server
    engine.undo();
    expect(engine.getNextServer()).toBe(0);
  });

  test('undo + redo cycle with mixed recorded and silent setServer', () => {
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

    // Coin toss: side 0 serves (recorded)
    engine.setServer(0);

    // Point 1: Winner for side 0 → 2-0
    engine.addPoint({ winner: 0, result: 'Winner' });
    engine.setServer(0, { recordEntry: false }); // derived

    // Point 2: Touch for side 1 → 2-1
    engine.addPoint({ winner: 1, result: 'Touch' });
    engine.setServer(1, { recordEntry: false }); // derived

    let result: any = engine.getState();
    expect(result.score.sets[0].side1Score).toBe(2);
    expect(result.score.sets[0].side2Score).toBe(1);

    // Undo point 2 → back to 2-0
    engine.undo();
    result = engine.getState();
    expect(result.score.sets[0].side1Score).toBe(2);
    expect(result.score.sets[0].side2Score).toBe(0);

    // Redo point 2 → back to 2-1
    engine.redo();
    result = engine.getState();
    expect(result.score.sets[0].side1Score).toBe(2);
    expect(result.score.sets[0].side2Score).toBe(1);

    // Undo both points → back to 0-0
    engine.undo(2);
    result = engine.getState();
    const sets = result.score.sets;
    if (sets.length > 0) {
      expect(sets[0].side1Score || 0).toBe(0);
      expect(sets[0].side2Score || 0).toBe(0);
    }
  });

  test('entries count reflects only recorded setServer calls', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10' });

    engine.setServer(0); // recorded
    engine.addPoint({ winner: 0 }); // recorded
    engine.setServer(0, { recordEntry: false }); // silent
    engine.addPoint({ winner: 1 }); // recorded
    engine.setServer(1, { recordEntry: false }); // silent

    let result: any = engine.getState();
    const entries = result.history?.entries ?? [];
    const types = entries.map((e: any) => e.type);
    expect(types).toEqual(['setServer', 'point', 'point']);
  });
});

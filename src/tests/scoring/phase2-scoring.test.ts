/**
 * Phase 2 Tests — Set-level, game-level, and mixed-mode scoring
 *
 * Tests addSet(), addGame(), mixed-mode undo/redo, and getInputMode().
 */

import { describe, test, expect } from 'vitest';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';

// ============================================================================
// 1. addSet() — Set-Level Input
// ============================================================================

describe('Phase 2 - addSet()', () => {
  test('adds a set with explicit winningSide', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4, winningSide: 1 });

    const sets = engine.getState().score.sets;
    expect(sets.length).toBe(1);
    expect(sets[0].side1Score).toBe(6);
    expect(sets[0].side2Score).toBe(4);
    expect(sets[0].winningSide).toBe(1);
    expect(sets[0].setNumber).toBe(1);
  });

  test('infers winningSide from scores', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 3, side2Score: 6 });

    expect(engine.getState().score.sets[0].winningSide).toBe(2);
  });

  test('tied set has no winningSide', () => {
    // For timed/aggregate formats, a set can be tied
    const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });
    engine.addSet({ side1Score: 5, side2Score: 5 });

    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();
  });

  test('records tiebreak scores', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({
      side1Score: 7,
      side2Score: 6,
      side1TiebreakScore: 7,
      side2TiebreakScore: 3,
      winningSide: 1,
    });

    const set = engine.getState().score.sets[0];
    expect(set.side1TiebreakScore).toBe(7);
    expect(set.side2TiebreakScore).toBe(3);
  });

  test('transitions status to IN_PROGRESS', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.getState().matchUpStatus).toBe('TO_BE_PLAYED');

    engine.addSet({ side1Score: 6, side2Score: 4 });
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
  });

  test('completes match when best-of-3 winner reached', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 6, side2Score: 3 });

    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);
  });

  test('best-of-3 requires 2 set wins', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 3, side2Score: 6 });

    // 1-1 in sets, not complete
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');

    engine.addSet({ side1Score: 6, side2Score: 2 });
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);
  });

  test('side 2 can win the match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 3, side2Score: 6 });
    engine.addSet({ side1Score: 4, side2Score: 6 });

    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(2);
  });

  test('records ScoreEntry in history', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });

    const entries = engine.getState().history?.entries;
    expect(entries).toBeDefined();
    expect(entries!.length).toBe(1);
    expect(entries![0].type).toBe('set');
    expect(entries![0].data.side1Score).toBe(6);
    expect(entries![0].data.side2Score).toBe(4);
    expect(entries![0].data.winningSide).toBe(1);
  });

  test('multiple sets have sequential setNumbers', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 3, side2Score: 6 });
    engine.addSet({ side1Score: 7, side2Score: 5 });

    const sets = engine.getState().score.sets;
    expect(sets[0].setNumber).toBe(1);
    expect(sets[1].setNumber).toBe(2);
    expect(sets[2].setNumber).toBe(3);
  });
});

// ============================================================================
// 2. addSet() — Aggregate + Exactly Formats
// ============================================================================

describe('Phase 2 - addSet() aggregate + exactly formats', () => {
  test('INTENNSE SET7XA-S:T10P — aggregate winner after 7 sets', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });

    // Side 1 dominates aggregate: 5+5+5+5+2+2+2 = 26
    // Side 2: 2+2+2+2+5+5+5 = 23
    engine.addSet({ side1Score: 5, side2Score: 2 });
    engine.addSet({ side1Score: 5, side2Score: 2 });
    engine.addSet({ side1Score: 5, side2Score: 2 });
    engine.addSet({ side1Score: 5, side2Score: 2 });
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS'); // Not yet!

    engine.addSet({ side1Score: 2, side2Score: 5 });
    engine.addSet({ side1Score: 2, side2Score: 5 });
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS'); // Still need 7th

    engine.addSet({ side1Score: 2, side2Score: 5 });
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1); // 26 vs 23
  });

  test('INTENNSE — not complete with only 6 sets', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });

    for (let i = 0; i < 6; i++) {
      engine.addSet({ side1Score: 10, side2Score: 1 });
    }

    // Even though side 1 dominates, exactly 7 sets required
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
  });

  test('SET2XA-S:T10 — exactly 2 sets, aggregate winner', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10' });
    engine.addSet({ side1Score: 25, side2Score: 20 });
    engine.addSet({ side1Score: 15, side2Score: 30 });

    // Aggregate: 40 vs 50 — side 2 wins
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(2);
  });

  test('SET3XA-S:T10 — aggregate tied does not complete', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3XA-S:T10' });
    engine.addSet({ side1Score: 10, side2Score: 10 });
    engine.addSet({ side1Score: 10, side2Score: 10 });
    engine.addSet({ side1Score: 10, side2Score: 10 });

    // Aggregate: 30 vs 30 — tied, no winner
    expect(engine.getState().matchUpStatus).not.toBe('COMPLETED');
  });
});

// ============================================================================
// 3. addGame() — Game-Level Input
// ============================================================================

describe('Phase 2 - addGame()', () => {
  test('creates first set automatically', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });

    const sets = engine.getState().score.sets;
    expect(sets.length).toBe(1);
    expect(sets[0].side1Score).toBe(1);
    expect(sets[0].side2Score).toBe(0);
  });

  test('increments game scores correctly', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });

    const set = engine.getState().score.sets[0];
    expect(set.side1Score).toBe(2);
    expect(set.side2Score).toBe(1);
  });

  test('transitions to IN_PROGRESS', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.getState().matchUpStatus).toBe('TO_BE_PLAYED');
    engine.addGame({ winner: 0 });
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
  });

  test('detects set completion at 6-0', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });

    const set = engine.getState().score.sets[0];
    expect(set.winningSide).toBe(1);
    expect(set.side1Score).toBe(6);
    expect(set.side2Score).toBe(0);
  });

  test('detects set completion at 6-4', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Play to 5-4, then side 1 wins
    for (let i = 0; i < 5; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 4; i++) engine.addGame({ winner: 1 });
    engine.addGame({ winner: 0 }); // 6-4

    const set = engine.getState().score.sets[0];
    expect(set.winningSide).toBe(1);
  });

  test('5-5 does not complete the set (need 2-game lead)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (let i = 0; i < 5; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 5; i++) engine.addGame({ winner: 1 });

    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();
  });

  test('tiebreak game at 6-6 completes set to 7-6', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Alternate games to reach 6-6 (can't play 6 straight — set would complete at 6-0)
    for (let i = 0; i < 6; i++) {
      engine.addGame({ winner: 0 });
      engine.addGame({ winner: 1 });
    }
    // Now at 6-6. Play tiebreak: side 0 wins
    engine.addGame({ winner: 0, tiebreakScore: [7, 5] });

    const set = engine.getState().score.sets[0];
    expect(set.winningSide).toBe(1);
    expect(set.side1Score).toBe(7);
    expect(set.side2Score).toBe(6);
    expect(set.side1TiebreakScore).toBe(7);
    expect(set.side2TiebreakScore).toBe(5);
  });

  test('creates new set after previous set completes', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Win first set 6-0
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    // Next game goes to second set
    engine.addGame({ winner: 1 });

    const sets = engine.getState().score.sets;
    expect(sets.length).toBe(2);
    expect(sets[1].side1Score).toBe(0);
    expect(sets[1].side2Score).toBe(1);
  });

  test('completes match via addGame', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    // Win set 1: 6-0
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    // Win set 2: 6-0
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });

    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);
  });

  test('records ScoreEntry in history', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });

    const entries = engine.getState().history?.entries;
    expect(entries).toBeDefined();
    expect(entries!.length).toBe(1);
    expect(entries![0].type).toBe('game');
    expect(entries![0].data.winner).toBe(0);
  });

  test('tiebreak-only set completion via addGame', () => {
    // Pickleball: best of 3, games to 11, win by 2
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    for (let i = 0; i < 11; i++) engine.addGame({ winner: 0 });

    const set = engine.getState().score.sets[0];
    expect(set.winningSide).toBe(1);
    expect(set.side1Score).toBe(11);
  });

  test('tiebreak-only set needs win by 2', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    for (let i = 0; i < 10; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 10; i++) engine.addGame({ winner: 1 });

    // 10-10, not complete yet
    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();

    engine.addGame({ winner: 0 }); // 11-10
    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();

    engine.addGame({ winner: 0 }); // 12-10
    expect(engine.getState().score.sets[0].winningSide).toBe(1);
  });
});

// ============================================================================
// 4. Mixed-Mode Undo/Redo
// ============================================================================

describe('Phase 2 - Mixed-mode undo/redo', () => {
  // 4.1 Point undo/redo with entries
  test('undo point removes from both entries and points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    expect(engine.getPointCount()).toBe(2);
    expect(engine.getUndoDepth()).toBe(2);

    engine.undo();

    expect(engine.getPointCount()).toBe(1);
    expect(engine.getUndoDepth()).toBe(1);
    expect(engine.getRedoDepth()).toBe(1);
  });

  test('redo point restores entries and state', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    engine.undo();
    engine.redo();

    expect(engine.getPointCount()).toBe(2);
    expect(engine.getRedoDepth()).toBe(0);
  });

  // 4.2 Set undo/redo
  test('undo addSet removes the set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 6, side2Score: 3 });

    // Match complete
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');

    engine.undo(); // Undo second set

    const state = engine.getState();
    expect(state.score.sets.length).toBe(1);
    expect(state.matchUpStatus).toBe('IN_PROGRESS');
    expect(state.winningSide).toBeUndefined();
  });

  test('redo addSet restores the set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 6, side2Score: 3 });

    engine.undo(); // Remove second set
    engine.redo(); // Restore it

    expect(engine.getState().score.sets.length).toBe(2);
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
  });

  test('undo all sets returns to initial state', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 3, side2Score: 6 });

    engine.undo(2); // Undo both sets

    expect(engine.getState().score.sets.length).toBe(0);
    expect(engine.getState().matchUpStatus).toBe('TO_BE_PLAYED');
  });

  // 4.3 Game undo/redo
  test('undo addGame removes the game', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });

    engine.undo(); // Undo the side-2 game

    const set = engine.getState().score.sets[0];
    expect(set.side1Score).toBe(2);
    expect(set.side2Score).toBe(0);
  });

  test('redo addGame restores the game', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });

    engine.undo();
    engine.redo();

    const set = engine.getState().score.sets[0];
    expect(set.side1Score).toBe(1);
    expect(set.side2Score).toBe(1);
  });

  test('undo game that completed a set reverts set completion', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (let i = 0; i < 5; i++) engine.addGame({ winner: 0 });
    engine.addGame({ winner: 0 }); // 6-0, set complete

    expect(engine.getState().score.sets[0].winningSide).toBe(1);

    engine.undo(); // Undo the 6th game

    const set = engine.getState().score.sets[0];
    expect(set.side1Score).toBe(5);
    expect(set.winningSide).toBeUndefined();
  });

  // 4.4 Mixed point + set undo
  test('mixed-mode: points then sets, undo preserves order', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Add some points
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    // Then add a set
    engine.addSet({ side1Score: 6, side2Score: 4 });

    const entries = engine.getState().history?.entries;
    expect(entries!.length).toBe(3);
    expect(entries![0].type).toBe('point');
    expect(entries![1].type).toBe('point');
    expect(entries![2].type).toBe('set');

    // Undo the set
    engine.undo();
    expect(engine.getState().score.sets.length).toBe(1); // Only the set from points
    expect(engine.getState().history?.entries?.length).toBe(2);

    // Undo a point
    engine.undo();
    expect(engine.getPointCount()).toBe(1);
    expect(engine.getState().history?.entries?.length).toBe(1);
  });

  // 4.5 Mixed game + point undo
  test('mixed-mode: games then points, undo follows LIFO', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 0 });
    engine.addPoint({ winner: 1 });

    expect(engine.getState().history?.entries?.length).toBe(3);

    // Undo the point (last action)
    engine.undo();
    expect(engine.getState().history?.entries?.length).toBe(2);
    expect(engine.getPointCount()).toBe(0);

    // Undo a game
    engine.undo();
    expect(engine.getState().history?.entries?.length).toBe(1);
    expect(engine.getState().score.sets[0].side1Score).toBe(1);
  });

  // 4.6 Redo stack cleared on new action
  test('new action clears redo stack', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.undo();

    expect(engine.canRedo()).toBe(true);

    engine.addPoint({ winner: 0 }); // New action
    expect(engine.canRedo()).toBe(false);
  });

  test('addSet clears redo stack', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.undo();

    expect(engine.canRedo()).toBe(true);

    engine.addSet({ side1Score: 3, side2Score: 6 }); // New action
    expect(engine.canRedo()).toBe(false);
  });

  test('addGame clears redo stack', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.undo();

    expect(engine.canRedo()).toBe(true);

    engine.addGame({ winner: 1 }); // New action
    expect(engine.canRedo()).toBe(false);
  });

  // 4.7 Edge cases
  test('undo on empty engine returns false', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.undo()).toBe(false);
  });

  test('redo on empty stack returns false', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.redo()).toBe(false);
  });

  test('undo count larger than entries works', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addSet({ side1Score: 6, side2Score: 4 });

    engine.undo(10); // Only 2 entries exist

    expect(engine.getState().score.sets.length).toBe(0);
    expect(engine.getPointCount()).toBe(0);
    expect(engine.getRedoDepth()).toBe(2);
  });

  test('multi-redo restores correct order', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addSet({ side1Score: 3, side2Score: 6 });
    engine.addSet({ side1Score: 7, side2Score: 5 });

    engine.undo(3); // Undo all
    expect(engine.getState().score.sets.length).toBe(0);

    engine.redo(3); // Redo all
    expect(engine.getState().score.sets.length).toBe(3);
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1); // 2-1 in sets
  });
});

// ============================================================================
// 5. getInputMode()
// ============================================================================

describe('Phase 2 - getInputMode()', () => {
  test('returns "none" for fresh engine', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.getInputMode()).toBe('none');
  });

  test('returns "points" for point-only input', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    expect(engine.getInputMode()).toBe('points');
  });

  test('returns "sets" for set-only input', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });

    expect(engine.getInputMode()).toBe('sets');
  });

  test('returns "games" for game-only input', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });

    expect(engine.getInputMode()).toBe('games');
  });

  test('returns "mixed" for points + sets', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addSet({ side1Score: 6, side2Score: 4 });

    expect(engine.getInputMode()).toBe('mixed');
  });

  test('returns "mixed" for games + points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addPoint({ winner: 1 });

    expect(engine.getInputMode()).toBe('mixed');
  });

  test('endSegment alone does not count as a mode', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    // Need to have a set to end
    engine.addPoint({ winner: 0 });
    engine.endSegment();

    // Only point entries count for mode (endSegment is filtered out)
    expect(engine.getInputMode()).toBe('points');
  });

  test('setInitialScore alone does not count as a mode', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 4, winningSide: 1 }],
    });

    expect(engine.getInputMode()).toBe('none');
  });
});

// ============================================================================
// 6. Undo/Redo with endSegment
// ============================================================================

describe('Phase 2 - endSegment undo/redo', () => {
  test('undo endSegment reverts segment completion', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });

    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.endSegment();

    // After endSegment, set 1 should be won by side 1 (2-1)
    expect(engine.getState().score.sets[0].winningSide).toBe(1);

    engine.undo(); // Undo endSegment

    // Set should no longer be complete
    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();
  });

  test('redo endSegment restores segment completion', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });

    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.endSegment();

    engine.undo(); // Undo endSegment
    engine.redo(); // Redo it

    expect(engine.getState().score.sets[0].winningSide).toBe(1);
  });
});

// ============================================================================
// 7. canUndo / canRedo edge cases
// ============================================================================

describe('Phase 2 - canUndo/canRedo', () => {
  test('canUndo true with entries', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    expect(engine.canUndo()).toBe(true);
  });

  test('canUndo false when empty', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.canUndo()).toBe(false);
  });

  test('getUndoDepth counts entries', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.addGame({ winner: 1 });

    expect(engine.getUndoDepth()).toBe(3);
  });
});

// ============================================================================
// 8. Comprehensive: Full match via addSet with undo/redo
// ============================================================================

describe('Phase 2 - Full match lifecycle with addSet', () => {
  test('complete 3-set match, undo last set, redo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addSet({ side1Score: 6, side2Score: 4 }); // 1-0
    engine.addSet({ side1Score: 3, side2Score: 6 }); // 1-1
    engine.addSet({ side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3 }); // 2-1

    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);

    engine.undo(); // Undo 3rd set
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
    expect(engine.getState().winningSide).toBeUndefined();
    expect(engine.getState().score.sets.length).toBe(2);

    engine.redo(); // Redo 3rd set
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);
    expect(engine.getState().score.sets.length).toBe(3);

    // Verify tiebreak preserved
    const set3 = engine.getState().score.sets[2];
    expect(set3.side1TiebreakScore).toBe(7);
    expect(set3.side2TiebreakScore).toBe(3);
  });
});

// ============================================================================
// 9. editPoint with entries
// ============================================================================

describe('Phase 2 - editPoint with entries', () => {
  test('editPoint updates entry data and rebuilds', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    // Edit the second point's winner
    engine.editPoint(1, { winner: 1 }, { recalculate: true });

    const points = engine.getState().history?.points;
    expect(points![1].winner).toBe(1);

    // Entry data should also be updated
    const entries = engine.getState().history?.entries;
    const pointEntries = entries!.filter((e) => e.type === 'point');
    expect(pointEntries[1].data.winner).toBe(1);
  });
});

/**
 * ScoringEngine Tests
 *
 * Tests for stateful engine with native undo/redo
 */

import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, test, expect, beforeEach } from 'vitest';

describe('ScoringEngine - Basic Operations', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
  });

  test('should create engine with initial state', () => {
    expect(engine.getPointCount()).toBe(0);
    expect(engine.getFormat()).toBe('SET3-S:6/TB7');
    expect(engine.isComplete()).toBe(false);
  });

  test('should add points', () => {
    engine.addPoint({ winner: 0 });
    expect(engine.getPointCount()).toBe(1);

    engine.addPoint({ winner: 1 });
    expect(engine.getPointCount()).toBe(2);
  });

  test('should get score', () => {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    const score = engine.getScore();
    expect(score.points).toEqual([2, 0]); // 30-0
    expect(score.games).toEqual([0, 0]);
  });

  test('should get scoreboard', () => {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    const scoreboard = engine.getScoreboard();
    expect(scoreboard).toContain('30');
  });
});

describe('ScoringEngine - Undo/Redo', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
  });

  test('should undo single point', () => {
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 1 }); // 15-15

    expect(engine.getScore().points).toEqual([1, 1]); // 15-15

    engine.undo();
    expect(engine.getScore().points).toEqual([1, 0]); // 15-0
  });

  test('should undo multiple points', () => {
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0
    engine.addPoint({ winner: 0 }); // 40-0

    expect(engine.getScore().points).toEqual([3, 0]); // 40-0

    engine.undo(2); // Undo 2 points
    expect(engine.getScore().points).toEqual([1, 0]); // 15-0
  });

  test('should redo after undo', () => {
    engine.addPoint({ winner: 0 }); // 15-0
    engine.addPoint({ winner: 0 }); // 30-0

    engine.undo(); // Back to 15-0
    expect(engine.getScore().points).toEqual([1, 0]); // 15-0

    engine.redo(); // Forward to 30-0
    expect(engine.getScore().points).toEqual([2, 0]); // 30-0
  });

  test('should clear redo stack on new point', () => {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    engine.undo(); // 15-0, redo available
    expect(engine.canRedo()).toBe(true);

    engine.addPoint({ winner: 1 }); // 15-15, redo cleared
    expect(engine.canRedo()).toBe(false);
  });

  test('should handle undo to initial state', () => {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    engine.undo(2); // Back to 0-0
    expect(engine.getPointCount()).toBe(0);
    expect(engine.getScore().points).toEqual([0, 0]);
  });

  test('should handle undo when no history', () => {
    const result = engine.undo();
    expect(result).toBe(false); // Can't undo initial state
  });

  test('should handle redo when no redo stack', () => {
    const result = engine.redo();
    expect(result).toBe(false);
  });

  test('should track undo/redo availability', () => {
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);

    engine.addPoint({ winner: 0 });
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);

    engine.undo();
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(true);
  });

  test('should get undo/redo depths', () => {
    expect(engine.getUndoDepth()).toBe(0);
    expect(engine.getRedoDepth()).toBe(0);

    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    expect(engine.getUndoDepth()).toBe(2);

    engine.undo();
    expect(engine.getUndoDepth()).toBe(1);
    expect(engine.getRedoDepth()).toBe(1);
  });
});

describe('ScoringEngine - Game Boundaries', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
  });

  test('should undo across game boundary', () => {
    // Play first game: 0000 (player 0 wins)
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    const score = engine.getScore();
    expect(score.sets[0].side1Score).toBe(1); // 1-0 in games

    // Add points into second game
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 });

    // Undo back into first game
    engine.undo(3);

    const scoreAfterUndo = engine.getScore();
    expect(scoreAfterUndo.sets[0].side1Score).toBe(0); // Back to 0-0 in games
    expect(engine.getPointCount()).toBe(3);
  });

  test('should undo complete game', () => {
    // Play one game
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    expect(engine.getScore().sets[0].side1Score).toBe(1);

    // Undo entire game
    engine.undo(4);

    expect(engine.getPointCount()).toBe(0);
    expect(engine.getScore().sets).toHaveLength(0); // No sets started
  });
});

describe('ScoringEngine - Set Boundaries', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
  });

  test('should undo across set boundary', () => {
    // Play 6-0 first set (24 points)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        engine.addPoint({ winner: 0 });
      }
    }

    expect(engine.getScore().sets).toHaveLength(1);
    expect(engine.getScore().sets[0].side1Score).toBe(6);
    expect(engine.getScore().sets[0].winningSide).toBe(1);

    // Start second set
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 });

    // Undo into first set
    engine.undo(3);

    const score = engine.getScore();
    expect(score.sets).toHaveLength(1);
    expect(score.sets[0].winningSide).toBeUndefined(); // Set not complete
  });
});

describe('ScoringEngine - State Management', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
  });

  test('should get state as JSON', () => {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    const state = engine.getState();
    expect(state.matchUpFormat).toBe('SET3-S:6/TB7');
    expect(state.history?.points).toHaveLength(2);
    expect(state.matchUpStatus).toBe('IN_PROGRESS');
  });

  test('should set state from JSON', () => {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    const state = engine.getState();

    // Create new engine and load state
    const engine2 = new ScoringEngine();
    engine2.setState(state);

    expect(engine2.getPointCount()).toBe(2);
    expect(engine2.getScore().points).toEqual([1, 1]); // 15-15
  });

  test('should reset to initial state', () => {
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });

    expect(engine.getPointCount()).toBe(3);

    engine.reset();

    expect(engine.getPointCount()).toBe(0);
    expect(engine.canUndo()).toBe(false);
    expect(engine.canRedo()).toBe(false);
  });
});

// Note: maxHistoryDepth was removed - we now use points-based undo
// which has minimal memory footprint (~100 bytes per point vs ~5KB per snapshot)

describe('ScoringEngine - Match Completion', () => {
  test('should detect match completion', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:TB10' });

    // Play match tiebreak to 10-8 (need alternating to reach proper scores)
    const points: any = [];
    // Build to 10-8 pattern
    for (let i = 0; i < 10; i++) points.push(0);
    for (let i = 0; i < 8; i++) points.push(1);

    // Add points
    points.forEach((winner) => engine.addPoint({ winner: winner as 0 | 1 }));

    // The first ten points win the tiebreak 10-0 and complete the match. The eight that follow
    // arrive after completion and are ignored: a finished match takes no more points (addPoint
    // guards this since 2026-10-01; before, they were counted, and this test asserted 18).
    expect(engine.isComplete()).toBe(true);
    expect(engine.getWinner()).toBe(1);
    expect(engine.getPointCount()).toBe(10);
  });
});

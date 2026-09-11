/**
 * Undo/Redo Tests - v4.0 with ScoringEngine
 *
 * Tests native undo/redo across all scenarios using ScoringEngine.
 * All 19 tests now use mutation engine with snapshot-based undo.
 */

import { describe, test, expect } from 'vitest';
import { ScoringEngine } from '@Assemblies/governors/scoreGovernor';

describe('Undo/Redo - Game Boundaries', () => {
  test('should undo across game boundary in regular set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play first game: 0000 (player 0 wins)
    for (let i = 0; i < 4; i++) {
      engine.addPoint({ winner: 0 });
    }

    let state = engine.getState();
    expect(state.score.sets[0].side1Score).toBe(1); // 1-0 in games

    // Play into second game
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 });

    // Undo 3 points (back into first game)
    engine.undo(3);

    state = engine.getState();
    expect(state.score.sets[0].side1Score).toBe(0); // Back to 0-0
    expect(engine.getPointCount()).toBe(3);
  });

  test('should redo across game boundary', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play 5 points across game boundary
    for (let i = 0; i < 5; i++) {
      engine.addPoint({ winner: 0 });
    }

    expect(engine.getPointCount()).toBe(5);

    // Undo 2 points
    engine.undo(2);
    expect(engine.getPointCount()).toBe(3);

    // Redo 2 points
    engine.redo(2);
    expect(engine.getPointCount()).toBe(5);
  });
});

describe('Undo/Redo - Set Boundaries', () => {
  test('should undo across set boundary', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play 6-0 first set
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }

    let state = engine.getState();
    expect(state.score.sets[0].winningSide).toBe(1);

    // Start second set
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 });

    // Undo back into first set
    engine.undo(3);

    state = engine.getState();
    expect(state.score.sets[0].winningSide).toBeUndefined();
  });

  test('should undo complete set and redo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play 6-0 first set
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }

    let state = engine.getState();
    expect(state.score.sets[0].winningSide).toBe(1);

    // Undo 5 points
    engine.undo(5);
    state = engine.getState();
    expect(state.score.sets[0].winningSide).toBeUndefined();

    // Redo
    engine.redo(5);
    state = engine.getState();
    expect(state.score.sets[0].winningSide).toBe(1);
  });
});

describe('Undo/Redo - Tiebreak Boundaries', () => {
  test('should undo into and out of tiebreak', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play to 6-6
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 1 });
      }
    }

    const beforeTiebreak = engine.getPointCount();
    expect(beforeTiebreak).toBe(48); // 12 games * 4 points

    // Play into tiebreak
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });

    expect(engine.getPointCount()).toBe(51);

    // Undo back before tiebreak started
    engine.undo(3);
    expect(engine.getPointCount()).toBe(beforeTiebreak);
  });

  test('should undo from completed tiebreak', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play to 6-6
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 1 });
      }
    }

    // Win tiebreak 7-5
    for (let i = 0; i < 7; i++) {
      engine.addPoint({ winner: 0 });
    }
    for (let i = 0; i < 5; i++) {
      engine.addPoint({ winner: 1 });
    }

    const afterTiebreak = engine.getPointCount();

    let state = engine.getState();
    expect(state.score.sets[0].winningSide).toBe(1);

    // Undo 3 points
    engine.undo(3);

    expect(engine.getPointCount()).toBe(afterTiebreak - 3);

    // Redo those 3 points back
    engine.redo(3);
    expect(engine.getPointCount()).toBe(afterTiebreak);

    state = engine.getState();
    expect(state.score.sets[0].winningSide).toBe(1); // Set complete again
  });
});

describe('Undo/Redo - Match Tiebreak Format (S:TB10)', () => {
  test('should undo in match tiebreak', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:TB10' });

    // Play some points
    for (let i = 0; i < 10; i++) {
      engine.addPoint({ winner: 0 });
    }

    expect(engine.getPointCount()).toBe(10);

    // Undo 3 points
    engine.undo(3);
    expect(engine.getPointCount()).toBe(7);
  });

  test('should undo completed match tiebreak', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:TB10' });

    // Play to 10-8 (simplified - just add points)
    for (let i = 0; i < 18; i++) {
      engine.addPoint({ winner: (i % 2) as 0 | 1 });
    }

    expect(engine.getPointCount()).toBe(18);

    // Undo 5 points
    engine.undo(5);
    expect(engine.getPointCount()).toBe(13);
  });
});

describe('Undo/Redo - Short Set Format (S:4/TB7)', () => {
  test('should undo in short set format', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:4/TB7' });

    // Play 2 games
    for (let g = 0; g < 2; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }

    let state = engine.getState();
    expect(state.score.sets[0].side1Score).toBe(2);

    // Undo one game
    engine.undo(4);

    state = engine.getState();
    expect(state.score.sets[0].side1Score).toBe(1);
  });

  test('should undo across tiebreak in short set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:4/TB7' });

    // Play to 4-4
    for (let g = 0; g < 4; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }
    for (let g = 0; g < 4; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 1 });
      }
    }

    const beforeTiebreak = engine.getPointCount();
    expect(beforeTiebreak).toBe(32); // 8 games * 4 points

    // Play into tiebreak
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    expect(engine.getPointCount()).toBe(34);

    // Undo back before tiebreak
    engine.undo(2);
    expect(engine.getPointCount()).toBe(beforeTiebreak);
  });
});

describe('Undo/Redo - Advantage Set Format', () => {
  test('should undo in advantage final set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:6/TB7-F:6' });

    // Play 3 games
    for (let g = 0; g < 3; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }

    expect(engine.getPointCount()).toBe(12);

    // Undo 2 games
    engine.undo(8);
    expect(engine.getPointCount()).toBe(4);
  });

  test('should handle undo in long advantage set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:6/TB7-F:6' });

    // Play 10 games
    for (let g = 0; g < 10; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: (g % 2) as 0 | 1 });
      }
    }

    expect(engine.getPointCount()).toBe(40);

    // Undo 5 games
    engine.undo(20);
    expect(engine.getPointCount()).toBe(20);
  });
});

describe('Undo/Redo - Multiple Cycles', () => {
  test('should handle multiple undo/redo cycles', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Add 10 points
    for (let i = 0; i < 10; i++) {
      engine.addPoint({ winner: (i % 2) as 0 | 1 });
    }

    expect(engine.getPointCount()).toBe(10);

    // Undo 5
    engine.undo(5);
    expect(engine.getPointCount()).toBe(5);

    // Redo 3
    engine.redo(3);
    expect(engine.getPointCount()).toBe(8);

    // Undo 2
    engine.undo(2);
    expect(engine.getPointCount()).toBe(6);

    // Redo 4
    engine.redo(2);
    expect(engine.getPointCount()).toBe(8);
  });

  test('should handle undo to start of match', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Add 5 points
    for (let i = 0; i < 5; i++) {
      engine.addPoint({ winner: 0 });
    }

    // Undo all
    engine.undo(5);

    expect(engine.getPointCount()).toBe(0);
    expect(engine.canUndo()).toBe(false);
  });

  test('should handle undo when no points played', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    const result = engine.undo();
    expect(result).toBe(false);
    expect(engine.getPointCount()).toBe(0);
  });

  test('should handle undo more points than exist', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Add 5 points
    for (let i = 0; i < 5; i++) {
      engine.addPoint({ winner: 0 });
    }

    // Try to undo 10 (more than exist)
    engine.undo(10);

    // Should undo all 5
    expect(engine.getPointCount()).toBe(0);
  });

  test('should maintain match format through undo/redo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Add and undo points
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.undo();
    engine.redo();

    const state = engine.getState();
    expect(state.matchUpFormat).toBe('SET3-S:6/TB7');
  });

  test('should handle undo at exact game boundary', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play exactly 1 game
    for (let i = 0; i < 4; i++) {
      engine.addPoint({ winner: 0 });
    }

    let state = engine.getState();
    expect(state.score.sets[0].side1Score).toBe(1);

    // Undo exactly 1 game
    engine.undo(4);

    expect(engine.getPointCount()).toBe(0);
  });

  test('should handle undo at exact set boundary', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play exactly 1 set (6-0)
    for (let g = 0; g < 6; g++) {
      for (let p = 0; p < 4; p++) {
        engine.addPoint({ winner: 0 });
      }
    }

    let state = engine.getState();
    expect(state.score.sets).toHaveLength(1);
    expect(state.score.sets[0].winningSide).toBe(1);

    // Undo entire set
    engine.undo(24);

    expect(engine.getPointCount()).toBe(0);
  });
});

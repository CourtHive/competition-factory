/**
 * v4.0 Tests - addPoint
 */

import { describe, test, expect } from 'vitest';
import { createMatchUp, addPoint, getScore } from '@Assemblies/governors/scoreGovernor';

describe('addPoint', () => {
  test('should add a point to a new match', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    matchUp = addPoint(matchUp, { winner: 0 });
    
    const score = getScore(matchUp);
    expect(score.points).toEqual([1, 0]);
    expect(score.games).toEqual([0, 0]);
    expect(matchUp.matchUpStatus).toBe('IN_PROGRESS');
  });

  test('should mutate matchUp in place (v3 adapter compatibility)', () => {
    const original = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    const updated = addPoint(original, { winner: 0 });
    
    // NOTE: v4 addPoint now mutates in place (no structuredClone) for v3 adapter compatibility
    // Original and updated are the SAME object
    expect(updated).toBe(original);
    expect(original.history?.points.length).toBe(1);
    expect(original.matchUpStatus).toBe('IN_PROGRESS');
  });

  test('should track point history', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 1 });
    matchUp = addPoint(matchUp, { winner: 0 });
    
    expect(matchUp.history?.points).toHaveLength(3);
    expect(matchUp.history?.points[0].winner).toBe(0);
    expect(matchUp.history?.points[1].winner).toBe(1);
    expect(matchUp.history?.points[2].winner).toBe(0);
  });

  test('should score a complete game', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    // Play 4 points to win game (0-0, 15-0, 30-0, 40-0, game)
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 0 });
    
    const score = getScore(matchUp);
    expect(score.games).toEqual([1, 0]);
    expect(score.points).toEqual([0, 0]); // New game started
  });

  test('should handle deuce and advantage', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    // Get to 40-40 (deuce)
    matchUp = addPoint(matchUp, { winner: 0 }); // 15-0
    matchUp = addPoint(matchUp, { winner: 0 }); // 30-0
    matchUp = addPoint(matchUp, { winner: 0 }); // 40-0
    matchUp = addPoint(matchUp, { winner: 1 }); // 40-15
    matchUp = addPoint(matchUp, { winner: 1 }); // 40-30
    matchUp = addPoint(matchUp, { winner: 1 }); // 40-40 (deuce)
    
    let score = getScore(matchUp);
    expect(score.points).toEqual([3, 3]);
    expect(score.games).toEqual([0, 0]);
    
    // Advantage player 0
    matchUp = addPoint(matchUp, { winner: 0 });
    score = getScore(matchUp);
    expect(score.points).toEqual([4, 3]);
    
    // Win game
    matchUp = addPoint(matchUp, { winner: 0 });
    score = getScore(matchUp);
    expect(score.games).toEqual([1, 0]);
  });

  test('should score a complete set', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    // Win 6 games straight (6-0)
    for (let game = 0; game < 6; game++) {
      for (let point = 0; point < 4; point++) {
        matchUp = addPoint(matchUp, { winner: 0 });
      }
    }
    
    getScore(matchUp);
    expect(matchUp.score.sets).toHaveLength(1);
    expect(matchUp.score.sets[0].winningSide).toBe(1); // Side 1 won
    expect(matchUp.score.sets[0].side1Score).toBe(6);
    expect(matchUp.score.sets[0].side2Score).toBe(0);
  });

  test('should be JSON serializable after adding points', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 1 });
    
    // Should be able to stringify and parse
    const json = JSON.stringify(matchUp);
    const parsed = JSON.parse(json);
    
    expect(parsed.history.points).toHaveLength(2);
    expect(parsed.matchUpStatus).toBe('IN_PROGRESS');
  });

  test('should include timestamps', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    matchUp = addPoint(matchUp, { winner: 0 });
    
    expect(matchUp.history?.points[0].timestamp).toBeDefined();
    expect(new Date(matchUp.history!.points[0].timestamp!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('should accept custom point properties', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    
    matchUp = addPoint(matchUp, { 
      winner: 0,
      server: 0,
      rallyLength: 15,
      timestamp: '2026-01-20T00:00:00.000Z'
    });
    
    const point = matchUp.history!.points[0];
    expect(point.server).toBe(0);
    expect(point.rallyLength).toBe(15);
    expect(point.timestamp).toBe('2026-01-20T00:00:00.000Z');
  });
});

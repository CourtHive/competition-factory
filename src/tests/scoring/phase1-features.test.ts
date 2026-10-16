/**
 * Phase 1 Feature Tests - Full matchUpFormat Support
 *
 * Comprehensive tests for:
 * 1. Tiebreak-only sets (pickleball, squash, badminton, fencing, volleyball, esports)
 * 2. Rally scoring (@RALLY modifier)
 * 3. Timed sets + endSegment
 * 4. Aggregate + exactly formats (INTENNSE)
 * 5. pointsTo decorations
 * 6. serveSide inference
 * 7. Override decorations
 * 8. Hard boundaries
 * 9. Late arrival / setInitialScore
 * 10. editPoint
 */

import { createMatchUp, addPoint, getScore } from '@Assemblies/governors/scoreGovernor';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, test, expect } from 'vitest';

// constants
import { IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

// ============================================================================
// 1. Tiebreak-Only Sets
// ============================================================================

describe('Phase 1 - Tiebreak-Only Sets', () => {
  test('pickleball SET3-S:TB11 (best of 3, first to 11)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });

    // Side 0 wins first set 11-0
    for (let i = 0; i < 11; i++) {
      engine.addPoint({ winner: 0 });
    }

    const state = engine.getState();
    expect(state.score.sets).toHaveLength(1);
    expect(state.score.sets[0].winningSide).toBe(1);
    expect(state.score.sets[0].side1TiebreakScore).toBe(11);
    expect(state.score.sets[0].side2TiebreakScore).toBe(0);
    // TODS convention: tiebreak-only sets have side scores 1-0
    expect(state.score.sets[0].side1Score).toBe(1);
    expect(state.score.sets[0].side2Score).toBe(0);
    expect(state.score.sets[0].isTiebreakOnly).toBe(true);
    expect(engine.isComplete()).toBe(false); // Best of 3, need 2 sets
  });

  test('pickleball full match (3 sets)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });

    // Side 0 wins set 1: 11-0
    for (let i = 0; i < 11; i++) engine.addPoint({ winner: 0 });
    // Side 1 wins set 2: 11-0
    for (let i = 0; i < 11; i++) engine.addPoint({ winner: 1 });
    // Side 0 wins set 3: 11-0
    for (let i = 0; i < 11; i++) engine.addPoint({ winner: 0 });

    expect(engine.isComplete()).toBe(true);
    expect(engine.getWinner()).toBe(1); // Side 1 (index 0) = winningSide 1
    expect(engine.getState().score.sets).toHaveLength(3);
  });

  test('pickleball deuce/extended play (must win by 2)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });

    // Both to 10
    for (let i = 0; i < 10; i++) {
      engine.addPoint({ winner: 0 });
      engine.addPoint({ winner: 1 });
    }

    // At 10-10, need to win by 2
    engine.addPoint({ winner: 0 }); // 11-10 — not enough
    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();

    engine.addPoint({ winner: 0 }); // 12-10 — set won!
    expect(engine.getState().score.sets[0].winningSide).toBe(1);
    expect(engine.getState().score.sets[0].side1TiebreakScore).toBe(12);
    expect(engine.getState().score.sets[0].side2TiebreakScore).toBe(10);
  });

  test('badminton SET3-S:TB21 (first to 21)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB21' });

    // Side 0 wins first set 21-0
    for (let i = 0; i < 21; i++) engine.addPoint({ winner: 0 });

    expect(engine.getState().score.sets[0].winningSide).toBe(1);
    expect(engine.getState().score.sets[0].side1TiebreakScore).toBe(21);
  });

  test('fencing SET1-S:TB5 (single set to 5)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:TB5' });

    for (let i = 0; i < 5; i++) engine.addPoint({ winner: 0 });

    expect(engine.isComplete()).toBe(true);
    expect(engine.getWinner()).toBe(1);
    expect(engine.getState().score.sets).toHaveLength(1);
  });

  test('squash SET5-S:TB11 (best of 5 to 11)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:TB11' });

    // Side 0 wins 3 sets
    for (let set = 0; set < 3; set++) {
      for (let i = 0; i < 11; i++) engine.addPoint({ winner: 0 });
    }

    expect(engine.isComplete()).toBe(true);
    expect(engine.getWinner()).toBe(1);
    expect(engine.getState().score.sets).toHaveLength(3);
  });
});

// ============================================================================
// 2. Timed Sets + endSegment
// ============================================================================

describe('Phase 1 - Timed Sets + endSegment', () => {
  test('timed set does NOT auto-complete', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });

    // Score 5 goals
    for (let i = 0; i < 5; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });

    // Set should NOT be complete (timed = needs endSegment)
    const currentSet = engine.getState().score.sets[0];
    expect(currentSet.winningSide).toBeUndefined();
    expect(currentSet.side1Score).toBe(5);
    expect(currentSet.side2Score).toBe(3);
    expect(currentSet.isTimed).toBe(true);
  });

  test('endSegment finalizes timed set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });

    // Score some goals
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 1; i++) engine.addPoint({ winner: 1 });

    // End the segment
    engine.endSegment();

    const set = engine.getState().score.sets[0];
    expect(set.winningSide).toBe(1); // Side 1 won (3-1)
    expect(engine.isComplete()).toBe(false); // Best of 3
  });

  test('endSegment records history entry', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });

    engine.addPoint({ winner: 0 });
    engine.endSegment({ reason: 'time' });

    const entries = engine.getState().history?.entries;
    expect(entries).toBeDefined();
    expect(entries!.length).toBe(2); // 1 point + 1 endSegment
    expect(entries![0].type).toBe('point');
    expect(entries![1].type).toBe('endSegment');
    expect(entries![1].data.reason).toBe('time');
  });
});

// ============================================================================
// 3. Aggregate + Exactly Formats
// ============================================================================

describe('Phase 1 - Aggregate + Exactly Formats', () => {
  test('INTENNSE SET7XA-S:T10P — all 7 sets must be played', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });

    // Play 7 timed sets, side 0 wins most
    for (let set = 0; set < 7; set++) {
      const winner = set < 4 ? 0 : 1; // Side 0 wins 4, side 1 wins 3
      for (let i = 0; i < 5; i++) engine.addPoint({ winner: winner });
      for (let i = 0; i < 2; i++) engine.addPoint({ winner: (1 - winner) as 0 | 1 });
      engine.endSegment();
    }

    // Match should be complete: aggregate scoring, all 7 sets played
    expect(engine.isComplete()).toBe(true);
    // Side 0 scored 4×5 + 3×2 = 26 goals, side 1 scored 4×2 + 3×5 = 23 goals
    expect(engine.getWinner()).toBe(1); // Side 1 (index 0)
  });

  test('INTENNSE — does NOT complete before all 7 sets', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });

    // Play only 4 sets (side 0 dominates)
    for (let set = 0; set < 4; set++) {
      for (let i = 0; i < 5; i++) engine.addPoint({ winner: 0 });
      engine.endSegment();
    }

    // Should NOT be complete yet (need 7 sets)
    expect(engine.isComplete()).toBe(false);
    expect(engine.getWinner()).toBeUndefined();
  });
});

// ============================================================================
// 4. pointsTo Decorations
// ============================================================================

describe('Phase 1 - pointsTo Decorations', () => {
  test('standard tennis: pointsToGame at start of match', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0 });

    const point = matchUp.history!.points[0];
    expect(point.pointsToGame).toBeDefined();
    expect(point.pointsToGame![0]).toBe(4); // Need 4 points at love
    expect(point.pointsToGame![1]).toBe(4);
  });

  test('standard tennis: pointsToGame after 30-0', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 0 }); // 3rd point, score was 30-0

    const thirdPoint = matchUp.history!.points[2];
    // At time of 3rd point, score was 30-0 (2-0 raw)
    expect(thirdPoint.pointsToGame![0]).toBe(2); // 2 more points to win
    expect(thirdPoint.pointsToGame![1]).toBe(4); // Still need all 4
  });

  test('pointsToGame at deuce', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    // Get to 40-40 (3-3 raw)
    for (let i = 0; i < 3; i++) matchUp = addPoint(matchUp, { winner: 0 });
    for (let i = 0; i < 3; i++) matchUp = addPoint(matchUp, { winner: 1 });

    // The 7th point is at deuce (3-3)
    matchUp = addPoint(matchUp, { winner: 0 });
    const deucePoint = matchUp.history!.points[6];
    // At 3-3 (deuce), need 2 points to win
    expect(deucePoint.pointsToGame![0]).toBe(2);
    expect(deucePoint.pointsToGame![1]).toBe(2);
  });

  test('gamesToSet at start', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0 });

    const point = matchUp.history!.points[0];
    expect(point.gamesToSet).toBeDefined();
    expect(point.gamesToSet![0]).toBe(6);
    expect(point.gamesToSet![1]).toBe(6);
  });

  test('pointsToSet decreases as game progresses', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

    for (let i = 0; i < 4; i++) {
      matchUp = addPoint(matchUp, { winner: 0 });
    }

    // First point was at 0-0 game, 0-0 set: 24 points to set
    const first = matchUp.history!.points[0];
    expect(first.pointsToSet![0]).toBe(24);

    // After completing game (4th point): pointsToSet should have dropped
    const fourth = matchUp.history!.points[3];
    // At 40-0 (3-0 raw), need 1 more point for game + 5 more games × 4 = 21
    expect(fourth.pointsToSet![0]).toBe(21);
  });

  test('pointsToMatch at start', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0 });

    const point = matchUp.history!.points[0];
    expect(point.pointsToMatch).toBeDefined();
    // Best of 3: need 2 sets × 24 points per set = 48 minimum
    expect(point.pointsToMatch![0]).toBe(48);
    expect(point.pointsToMatch![1]).toBe(48);
  });

  test('tiebreak-only sets: pointsToGame = pointsToSet', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:TB11' });
    matchUp = addPoint(matchUp, { winner: 0 });

    const point = matchUp.history!.points[0];
    expect(point.pointsToGame![0]).toBe(11);
    expect(point.pointsToSet![0]).toBe(11);
  });

  test('timed sets: no pointsTo decorations', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:T10P' });
    matchUp = addPoint(matchUp, { winner: 0 });

    const point = matchUp.history!.points[0];
    // Timed sets can't calculate deterministic pointsTo
    expect(point.pointsToGame).toBeUndefined();
  });

  test('breakpoint detection', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play to 0-40 (side 1 is serving at game start, side 1 has 0, side 2 has 3)
    // Server = side 0 (game 0 = side 0 serves)
    matchUp = addPoint(matchUp, { winner: 1 }); // 0-15
    matchUp = addPoint(matchUp, { winner: 1 }); // 0-30
    matchUp = addPoint(matchUp, { winner: 1 }); // 0-40

    // At 0-40 with server=0, receiver (side 1) needs 1 point => breakpoint
    const thirdPoint = matchUp.history!.points[2];
    expect(thirdPoint.isBreakpoint).toBe(false);
    // The 3rd point was played when score was 0-30 (0-2 raw)
    // Receiver (side 1) needed 2 more points at that time
    // But the 4th point (if there were one) at 0-40 (0-3 raw) would be breakpoint
    // Let's check: at point 3 (0-based index 2), score was 0-2
    // pointsToGame for side 1 (receiver) = 4-2 = 2, not 1 yet
    // We need a 4th point check
    matchUp = addPoint(matchUp, { winner: 1 }); // game won
    const fourthPoint = matchUp.history!.points[3];
    // At time of 4th point, score was 0-3 (0-40), receiver needs 1 point
    expect(fourthPoint.isBreakpoint).toBe(true);
  });
});

// ============================================================================
// 5. serveSide Inference
// ============================================================================

describe('Phase 1 - Serve Side Inference', () => {
  test('standard tennis: deuce at start of game', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0 });

    // First point: 0 total points in game = deuce side
    const point = matchUp.history!.points[0];
    expect(point.serveSide).toBe('deuce');
  });

  test('standard tennis: ad after first point', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 0 });

    // Second point: 1 total points in game = ad side
    const secondPoint = matchUp.history!.points[1];
    expect(secondPoint.serveSide).toBe('ad');
  });

  test('standard tennis: alternates deuce/ad', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    for (let i = 0; i < 4; i++) matchUp = addPoint(matchUp, { winner: 0 });

    const sides = matchUp.history!.points.map((p) => p.serveSide);
    expect(sides).toEqual(['deuce', 'ad', 'deuce', 'ad']);
  });

  test('timed sets: no serve side', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:T10P' });
    matchUp = addPoint(matchUp, { winner: 0 });

    expect(matchUp.history!.points[0].serveSide).toBeUndefined();
  });

  test('tiebreak-only: deuce/ad by point parity', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:TB11' });
    matchUp = addPoint(matchUp, { winner: 0 });
    matchUp = addPoint(matchUp, { winner: 0 });

    expect(matchUp.history!.points[0].serveSide).toBe('deuce'); // 0 points = even
    expect(matchUp.history!.points[1].serveSide).toBe('ad'); // 1 point = odd
  });
});

// ============================================================================
// 6. Override Decorations
// ============================================================================

describe('Phase 1 - Override Decorations', () => {
  test('wrongSide passed through addPoint', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0, wrongSide: true });

    expect(matchUp.history!.points[0].wrongSide).toBe(true);
  });

  test('wrongServer passed through addPoint', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0, wrongServer: true });

    expect(matchUp.history!.points[0].wrongServer).toBe(true);
  });

  test('penaltyPoint passed through addPoint', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    matchUp = addPoint(matchUp, { winner: 0, penaltyPoint: true });

    expect(matchUp.history!.points[0].penaltyPoint).toBe(true);
  });

  test('decoratePoint adds metadata after the fact', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });

    engine.decoratePoint(0, { wrongSide: true, rallyLength: 12 });

    const point = engine.getState().history!.points[0];
    expect(point.wrongSide).toBe(true);
    expect(point.rallyLength).toBe(12);
  });
});

// ============================================================================
// 7. Hard Boundaries
// ============================================================================

describe('Phase 1 - Hard Boundaries', () => {
  test('markHardBoundary stores on set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play a game
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });

    engine.markHardBoundary({ setIndex: 0, gameIndex: 0 });

    const set = engine.getState().score.sets[0];
    expect(set.hardBoundaries).toEqual([0]);
  });

  test('markHardBoundary ignores duplicates', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });

    engine.markHardBoundary({ setIndex: 0, gameIndex: 0 });
    engine.markHardBoundary({ setIndex: 0, gameIndex: 0 });

    expect(engine.getState().score.sets[0].hardBoundaries).toEqual([0]);
  });

  test('multiple hard boundaries are sorted', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play 3 games
    for (let game = 0; game < 3; game++) {
      for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });
    }

    engine.markHardBoundary({ setIndex: 0, gameIndex: 2 });
    engine.markHardBoundary({ setIndex: 0, gameIndex: 0 });

    expect(engine.getState().score.sets[0].hardBoundaries).toEqual([0, 2]);
  });
});

// ============================================================================
// 8. editPoint
// ============================================================================

describe('Phase 1 - editPoint', () => {
  test('editPoint without recalculate updates metadata only', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    // Edit first point's metadata without recalculation
    engine.editPoint(0, { rallyLength: 10 }, { recalculate: false });

    const point = engine.getState().history!.points[0];
    expect(point.rallyLength).toBe(10);
    expect(point.winner).toBe(0); // Unchanged
  });

  test('editPoint with recalculate rebuilds state', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    // Play 4 points for side 0 (win a game)
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });

    const scoreBefore = engine.getScore();
    expect(scoreBefore.games).toEqual([1, 0]);

    // Change first point to side 1 and recalculate
    engine.editPoint(0, { winner: 1 }, { recalculate: true });

    // After edit: first 3 points are 1,0,0,0 → game still won by side 0 (3 vs 1)
    // Actually: 1,0,0,0 means side1=3, side2=1 → 40-15 → not yet won
    const scoreAfter = engine.getScore();
    expect(scoreAfter.games).toEqual([0, 0]); // Game not complete
    expect(scoreAfter.points).toEqual([3, 1]); // 40-15
  });

  test('editPoint without recalculate preserves scoring state', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });
    expect(engine.getScore().games).toEqual([1, 0]);

    // Edit without recalculate — scoring stays the same
    engine.editPoint(0, { winner: 1 }, { recalculate: false });
    expect(engine.getScore().games).toEqual([1, 0]); // Still 1-0
  });

  test('editPoint clears undo stack', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.undo(); // Undo 1 point
    expect(engine.canRedo()).toBe(true);

    engine.editPoint(0, { rallyLength: 5 });
    expect(engine.canRedo()).toBe(false); // Undo stack cleared
  });
});

// ============================================================================
// 9. Late Arrival / setInitialScore
// ============================================================================

describe('Phase 1 - Late Arrival / setInitialScore', () => {
  test('set initial score with completed set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 4 }],
    });

    const state = engine.getState();
    expect(state.matchUpStatus).toBe(IN_PROGRESS);
    expect(state.score.sets).toHaveLength(1);
    expect(state.score.sets[0].winningSide).toBe(1); // Side 1 won (6-4)
    expect(state.score.sets[0].side1Score).toBe(6);
    expect(state.score.sets[0].side2Score).toBe(4);
  });

  test('set initial score with current set and game', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 4 }],
      currentSetScore: { side1Score: 3, side2Score: 2 },
      currentGameScore: { side1Points: 2, side2Points: 1 }, // 30-15
    });

    const state = engine.getState();
    expect(state.score.sets).toHaveLength(2); // Completed set + current set
    expect(state.score.sets[1].side1Score).toBe(3);
    expect(state.score.sets[1].side2Score).toBe(2);
    expect(state.score.sets[1].side1GameScores![0]).toBe(2);
    expect(state.score.sets[1].side2GameScores![0]).toBe(1);
  });

  test('addPoint after setInitialScore continues from that state', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 4 }],
      currentSetScore: { side1Score: 3, side2Score: 2 },
    });

    // Add points from current position
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });

    const state = engine.getState();
    // Should have completed a game in the current set
    expect(state.score.sets[1].side1Score).toBe(4);
    expect(state.score.sets[1].side2Score).toBe(2);
  });

  test('setInitialScore records history entry', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 3 }],
    });

    const entries = engine.getState().history?.entries;
    expect(entries).toBeDefined();
    expect(entries!.length).toBe(1);
    expect(entries![0].type).toBe('setInitialScore');
  });

  test('undo after setInitialScore preserves initial score', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 4 }],
      currentSetScore: { side1Score: 3, side2Score: 2 },
    });

    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });

    // Undo both points
    engine.undo(2);

    const state = engine.getState();
    // Should be back to initial score, not 0-0
    expect(state.score.sets).toHaveLength(2);
    expect(state.score.sets[0].side1Score).toBe(6);
    expect(state.score.sets[0].side2Score).toBe(4);
    expect(state.score.sets[1].side1Score).toBe(3);
    expect(state.score.sets[1].side2Score).toBe(2);
  });

  test('reset clears initial score', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });

    engine.setInitialScore({
      sets: [{ side1Score: 6, side2Score: 4 }],
    });

    engine.reset();

    const state = engine.getState();
    expect(state.score.sets).toHaveLength(0);
    expect(state.matchUpStatus).toBe(TO_BE_PLAYED);
  });
});

// ============================================================================
// 10. Match Tiebreak
// ============================================================================

describe('Phase 1 - Match Tiebreak', () => {
  test('SET3-S:6/TB7-F:TB10 match tiebreak in final set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });

    // Side 0 wins first set 6-0
    for (let game = 0; game < 6; game++) {
      for (let pt = 0; pt < 4; pt++) engine.addPoint({ winner: 0 });
    }

    // Side 1 wins second set 6-0
    for (let game = 0; game < 6; game++) {
      for (let pt = 0; pt < 4; pt++) engine.addPoint({ winner: 1 });
    }

    expect(engine.isComplete()).toBe(false);

    // Third set is a match tiebreak to 10
    for (let i = 0; i < 10; i++) engine.addPoint({ winner: 0 });

    expect(engine.isComplete()).toBe(true);
    expect(engine.getWinner()).toBe(1);

    // Verify tiebreak scores stored
    const finalSet = engine.getState().score.sets[2];
    expect(finalSet.side1TiebreakScore).toBe(10);
    expect(finalSet.side2TiebreakScore).toBe(0);
  });
});

// ============================================================================
// 11. NoAD Games
// ============================================================================

describe('Phase 1 - NoAD Games', () => {
  test('SET3-S:6NOAD/TB7 golden point at deuce', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6NOAD/TB7' });

    // Get to deuce (3-3)
    for (let i = 0; i < 3; i++) matchUp = addPoint(matchUp, { winner: 0 });
    for (let i = 0; i < 3; i++) matchUp = addPoint(matchUp, { winner: 1 });

    // At deuce in NoAD: next point wins
    matchUp = addPoint(matchUp, { winner: 0 });

    const score = getScore(matchUp);
    expect(score.games).toEqual([1, 0]); // Game won at 4-3 (no advantage needed)
  });
});

// ============================================================================
// 12. Engine State Management
// ============================================================================

describe('Phase 1 - Engine State Management', () => {
  test('JSON serialization round-trip', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });

    for (let i = 0; i < 5; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 1 });

    const state = engine.getState();
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    // Verify deserialized state has decorations
    expect(parsed.history.points[0].pointsToGame).toBeDefined();
    expect(parsed.history.points[0].serveSide).toBeDefined();
  });
});

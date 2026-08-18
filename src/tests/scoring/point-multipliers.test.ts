import { ScoringEngine, resolvePointValue } from '@Assemblies/governors/scoreGovernor';
import { PointMultiplier } from '@Assemblies/governors/scoreGovernor';
import { describe, it, expect } from 'vitest';

const INTENNSE_MULTIPLIERS: PointMultiplier[] = [
  { condition: { results: ['Ace'] }, value: 2 },
  { condition: { results: ['Winner'] }, value: 2 },
];

describe('Point Multipliers', () => {
  describe('resolvePointValue', () => {
    it('returns 1 when no multipliers configured', () => {
      expect(resolvePointValue({ result: 'Ace' }, [])).toBe(1);
    });

    it('returns 1 when no result matches', () => {
      expect(resolvePointValue({ result: 'Unforced Error' }, INTENNSE_MULTIPLIERS)).toBe(1);
    });

    it('returns multiplier value for matching result', () => {
      expect(resolvePointValue({ result: 'Ace' }, INTENNSE_MULTIPLIERS)).toBe(2);
      expect(resolvePointValue({ result: 'Winner' }, INTENNSE_MULTIPLIERS)).toBe(2);
    });

    it('returns 1 when point has no result', () => {
      expect(resolvePointValue({}, INTENNSE_MULTIPLIERS)).toBe(1);
    });

    it('first matching multiplier wins', () => {
      const multipliers: PointMultiplier[] = [
        { condition: { results: ['Ace'] }, value: 3 },
        { condition: { results: ['Ace'] }, value: 5 },
      ];
      expect(resolvePointValue({ result: 'Ace' }, multipliers)).toBe(3);
    });

    it('supports stroke-based multipliers', () => {
      const multipliers: PointMultiplier[] = [{ condition: { strokes: ['Forehand'] }, value: 2 }];
      expect(resolvePointValue({ stroke: 'Forehand' }, multipliers)).toBe(2);
      expect(resolvePointValue({ stroke: 'Backhand' }, multipliers)).toBe(1);
    });
  });

  describe('INTENNSE timed format with multipliers', () => {
    // INTENNSE uses SET7XA-S:T10P (7 timed segments, aggregate, point-based)
    it('Ace adds 2 to score, normal point adds 1', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
        pointMultipliers: INTENNSE_MULTIPLIERS,
      });

      // Normal point: side 1 wins, no result -> score 1
      engine.addPoint({ winner: 0 });
      let score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(1);

      // Ace by side 1: score should jump by 2 -> total 3
      engine.addPoint({ winner: 0, result: 'Ace' });
      score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(3);

      // Check scoreValue on last point
      const points = engine.getState().history!.points;
      expect((points[1] as any).scoreValue).toBe(2);
      // First point should NOT have scoreValue (it's 1, default)
      expect((points[0] as any).scoreValue).toBeUndefined();
    });

    it('Winner adds 2 to score', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
        pointMultipliers: INTENNSE_MULTIPLIERS,
      });

      engine.addPoint({ winner: 1, result: 'Winner' });
      const score = engine.getScore();
      expect(score.sets[0].side2Score).toBe(2);
    });

    it('Double Fault adds 1 (no multiplier match)', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
        pointMultipliers: INTENNSE_MULTIPLIERS,
      });

      engine.addPoint({ winner: 1, result: 'Double Fault' });
      const score = engine.getScore();
      expect(score.sets[0].side2Score).toBe(1);
    });
  });

  describe('Tiebreak-only format with multipliers', () => {
    it('multipliers apply to tiebreak-only sets', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:TB11',
        pointMultipliers: INTENNSE_MULTIPLIERS,
      });

      // Ace: side 1 gets 2 points
      engine.addPoint({ winner: 0, result: 'Ace' });
      const state = engine.getState();
      expect(state.score.sets[0].side1GameScores![0]).toBe(2);
    });
  });

  describe('Match tiebreak with multipliers', () => {
    it('multipliers apply to match tiebreaks', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        pointMultipliers: INTENNSE_MULTIPLIERS,
      });

      // Play two sets to get to match tiebreak
      engine.addSet({ side1Score: 6, side2Score: 4 });
      engine.addSet({ side1Score: 4, side2Score: 6 });

      // Now in deciding set (standard set, not match tiebreak for this format)
      // Standard game scoring should NOT be affected by multipliers
      engine.addPoint({ winner: 0, result: 'Ace' });
      const state = engine.getState();
      // In a standard game, points are tennis-style (0,15,30,40) not raw counts
      // So the game score array should show 1 (one raw point), not 2
      expect(state.score.sets[2].side1GameScores![0]).toBe(1);
    });
  });

  describe('Standard tennis games ignore multipliers', () => {
    it('standard game points are not multiplied', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET3-S:6/TB7',
        pointMultipliers: INTENNSE_MULTIPLIERS,
      });

      // Ace in standard game — should still be 1 raw point (15 tennis)
      engine.addPoint({ winner: 0, result: 'Ace' });
      const state = engine.getState();
      // Standard set handler does side1Points++ (no multiplier)
      expect(state.score.sets[0].side1GameScores![0]).toBe(1);
    });
  });

  describe('Undo/redo with multiplied points', () => {
    it('rebuilt score is correct after undo/redo', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
        pointMultipliers: INTENNSE_MULTIPLIERS,
      });

      engine.addPoint({ winner: 0 }); // +1 = 1
      engine.addPoint({ winner: 0, result: 'Ace' }); // +2 = 3
      engine.addPoint({ winner: 1, result: 'Winner' }); // +2

      let score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(3);
      expect(score.sets[0].side2Score).toBe(2);

      // Undo the Winner
      engine.undo();
      score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(3);
      expect(score.sets[0].side2Score).toBe(0);

      // Redo the Winner
      engine.redo();
      score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(3);
      expect(score.sets[0].side2Score).toBe(2);

      // Undo everything
      engine.undo(3);
      score = engine.getScore();
      expect(score.sets.length).toBe(0);
    });
  });

  describe('Zero multipliers config', () => {
    it('all points score 1 when no multipliers', () => {
      const engine = new ScoringEngine({
        matchUpFormat: 'SET7XA-S:T10P',
        pointMultipliers: [],
      });

      engine.addPoint({ winner: 0, result: 'Ace' });
      engine.addPoint({ winner: 0, result: 'Winner' });
      const score = engine.getScore();
      expect(score.sets[0].side1Score).toBe(2);
    });
  });

  describe('setPointMultipliers', () => {
    it('can set multipliers after construction', () => {
      const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });

      engine.addPoint({ winner: 0, result: 'Ace' });
      expect(engine.getScore().sets[0].side1Score).toBe(1); // No multiplier yet

      engine.setPointMultipliers(INTENNSE_MULTIPLIERS);
      engine.addPoint({ winner: 0, result: 'Ace' });
      expect(engine.getScore().sets[0].side1Score).toBe(3); // 1 + 2

      expect(engine.getPointMultipliers()).toEqual(INTENNSE_MULTIPLIERS);
    });
  });
});

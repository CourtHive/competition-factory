/**
 * ScoringEngine tests for INN4XA-S:O3-M:T50 (BLW wiffle ball)
 *
 * Format: 4 innings exactly, 3 outs per inning, aggregate scoring, 50-min match cap.
 * Winner determined by total runs across all 4 innings (not innings won).
 */

import { describe, test, expect } from 'vitest';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';

const BLW_FORMAT = 'INN4XA-S:O3-M:T50';

describe('ScoringEngine with INN4XA-S:O3-M:T50', () => {
  test('stores format correctly', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });
    expect(engine.getFormat()).toBe(BLW_FORMAT);
  });

  test('requires exactly 4 innings to complete', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    engine.addSet({ side1Score: 3, side2Score: 1 });
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');

    engine.addSet({ side1Score: 0, side2Score: 2 });
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');

    engine.addSet({ side1Score: 5, side2Score: 1 });
    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');

    engine.addSet({ side1Score: 2, side2Score: 0 });
    // Aggregate: 10 vs 4 → side 1 wins
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);
  });

  test('not complete with only 3 innings even with dominant lead', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    engine.addSet({ side1Score: 9, side2Score: 0 });
    engine.addSet({ side1Score: 9, side2Score: 0 });
    engine.addSet({ side1Score: 9, side2Score: 0 });

    expect(engine.getState().matchUpStatus).toBe('IN_PROGRESS');
  });

  test('aggregate scoring determines winner (not innings won)', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    // Side 2 wins 3 of 4 innings but side 1 wins aggregate
    engine.addSet({ side1Score: 9, side2Score: 1 }); // side 1 wins inning
    engine.addSet({ side1Score: 0, side2Score: 1 }); // side 2 wins inning
    engine.addSet({ side1Score: 0, side2Score: 1 }); // side 2 wins inning
    engine.addSet({ side1Score: 0, side2Score: 1 }); // side 2 wins inning

    // Aggregate: 9 vs 4 → side 1 wins despite losing 3 innings
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);
  });

  test('side 2 can win by aggregate', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    engine.addSet({ side1Score: 1, side2Score: 3 });
    engine.addSet({ side1Score: 2, side2Score: 5 });
    engine.addSet({ side1Score: 0, side2Score: 1 });
    engine.addSet({ side1Score: 1, side2Score: 0 });

    // Aggregate: 4 vs 9 → side 2 wins
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(2);
  });

  test('aggregate tie does not complete the match', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    engine.addSet({ side1Score: 3, side2Score: 1 });
    engine.addSet({ side1Score: 1, side2Score: 3 });
    engine.addSet({ side1Score: 2, side2Score: 2 });
    engine.addSet({ side1Score: 1, side2Score: 1 });

    // Aggregate: 7 vs 7 — tied, not complete
    expect(engine.getState().matchUpStatus).not.toBe('COMPLETED');
  });

  test('tied innings have no winningSide', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });
    engine.addSet({ side1Score: 3, side2Score: 3 });

    expect(engine.getState().score.sets[0].winningSide).toBeUndefined();
  });

  test('single-digit scores (0-9) are valid', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    engine.addSet({ side1Score: 0, side2Score: 9 });
    engine.addSet({ side1Score: 9, side2Score: 0 });
    engine.addSet({ side1Score: 5, side2Score: 5 });
    engine.addSet({ side1Score: 1, side2Score: 0 });

    // Aggregate: 15 vs 14 → side 1 wins
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);

    for (const set of engine.getState().score.sets) {
      expect(set.side1Score).toBeGreaterThanOrEqual(0);
      expect(set.side1Score).toBeLessThanOrEqual(9);
      expect(set.side2Score).toBeGreaterThanOrEqual(0);
      expect(set.side2Score).toBeLessThanOrEqual(9);
    }
  });

  test('win by exactly 1 run aggregate', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    engine.addSet({ side1Score: 2, side2Score: 1 });
    engine.addSet({ side1Score: 1, side2Score: 2 });
    engine.addSet({ side1Score: 0, side2Score: 0 });
    engine.addSet({ side1Score: 1, side2Score: 0 });

    // Aggregate: 4 vs 3 → side 1 wins by 1
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.getState().winningSide).toBe(1);
  });

  test('innings have sequential setNumbers', () => {
    const engine = new ScoringEngine({ matchUpFormat: BLW_FORMAT });

    engine.addSet({ side1Score: 1, side2Score: 0 });
    engine.addSet({ side1Score: 0, side2Score: 1 });
    engine.addSet({ side1Score: 1, side2Score: 0 });
    engine.addSet({ side1Score: 1, side2Score: 0 });

    const sets = engine.getState().score.sets;
    expect(sets[0].setNumber).toBe(1);
    expect(sets[1].setNumber).toBe(2);
    expect(sets[2].setNumber).toBe(3);
    expect(sets[3].setNumber).toBe(4);
  });
});

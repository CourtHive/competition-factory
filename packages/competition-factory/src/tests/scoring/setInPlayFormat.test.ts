import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * getSetInPlayFormat() exposes the format the engine judges the set in play by (scoring spec § 3.2), so a
 * consumer offering point, game or set input reads it instead of re-deriving the deciding-set rule
 * (epixodic's classic scorer carried its own copy, which missed the aggregate decider).
 */

function engineAfter(matchUpFormat: string, totals: Array<[number, number]>) {
  const engine = new ScoringEngine({ matchUpFormat });
  for (const [side1Score, side2Score] of totals) engine.addSet({ side1Score, side2Score });
  return engine;
}

describe('getSetInPlayFormat', () => {
  it('is the ordinary set format before anything is scored', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
    expect(engine.getSetInPlayFormat()).toEqual(engine.getFormatStructure()?.setFormat);
    expect(engine.getSetInPlayFormat()?.tiebreakSet).toBeUndefined();
  });

  it('stays the ordinary set format while the match is not at its deciding set', () => {
    const engine = engineAfter('SET3-S:6/TB7-F:TB10', [[6, 3]]);
    expect(engine.getSetInPlayFormat()).toEqual(engine.getFormatStructure()?.setFormat);
  });

  it('is the final-set format in the live deciding set of a best-of format', () => {
    const engine = engineAfter('SET3-S:6/TB7-F:TB10', [
      [6, 3],
      [3, 6],
    ]);
    expect(engine.getSetInPlayFormat()).toEqual(engine.getFormatStructure()?.finalSetFormat);
    expect(engine.getSetInPlayFormat()?.tiebreakSet?.tiebreakTo).toBe(10);
  });

  it('reads the deciding set in a best-of-five only at two sets all', () => {
    const atTwoOne = engineAfter('SET5-S:6/TB7-F:6', [
      [6, 3],
      [3, 6],
      [6, 4],
    ]);
    expect(atTwoOne.getSetInPlayFormat()).toEqual(atTwoOne.getFormatStructure()?.setFormat);

    const atTwoAll = engineAfter('SET5-S:6/TB7-F:6', [
      [6, 3],
      [3, 6],
      [6, 4],
      [4, 6],
    ]);
    expect(atTwoAll.getSetInPlayFormat()).toEqual(atTwoAll.getFormatStructure()?.finalSetFormat);
  });

  it('is the aggregate decider format only in set N + 1, after the exactly sets', () => {
    const engine = engineAfter('SET2XA-S:T10-F:TB10', [[3, 5]]);
    expect(engine.getSetInPlayFormat()).toEqual(engine.getFormatStructure()?.setFormat);

    engine.addSet({ side1Score: 5, side2Score: 3 });
    expect(engine.isComplete()).toBe(false);
    expect(engine.getSetInPlayFormat()).toEqual(engine.getFormatStructure()?.finalSetFormat);
    expect(engine.getSetInPlayFormat()?.tiebreakSet?.tiebreakTo).toBe(10);
  });

  it('agrees with the input levels the engine reports for the set in play', () => {
    const engine = engineAfter('SET3-S:6/TB7-F:O3', [
      [6, 3],
      [3, 6],
    ]);
    expect(engine.getSetInPlayFormat()?.outs).toBeDefined();
    expect(engine.getInputLevels()).toEqual({ point: false, game: false, set: true });
  });

  it('is undefined for a format that does not parse', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'NOT-A-FORMAT' });
    expect(engine.getSetInPlayFormat()).toBeUndefined();
  });
});

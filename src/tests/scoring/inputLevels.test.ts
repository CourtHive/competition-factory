import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { inputLevels } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';

/*
 * A parser-valid format is not a promise of a point model. Findings S4 and S8 of the 2026-10-17
 * scoring-engine assessment: a segment of outs has no point or game model, so point and game input
 * are refused rather than silently scored as tennis; set totals stay available.
 */

describe('inputLevels', () => {
  it.each([
    ['SET3-S:6/TB7', { point: true, game: true, set: true }],
    ['SET3-S:TB11', { point: true, game: true, set: true }],
    ['SET1-S:T10P', { point: true, game: true, set: true }],
    ['SET1-S:P32', { point: true, game: false, set: true }],
    ['INN4XA-S:O3-M:T50', { point: false, game: false, set: true }],
    ['HAL2A-S:O3', { point: false, game: false, set: true }],
    ['INN3X-S:6/TB7', { point: true, game: true, set: true }],
  ])('%s', (format, levels) => {
    expect(inputLevels(parse(format)?.setFormat)).toEqual(levels);
  });
});

describe('S4: outs segments take set totals, not points or games', () => {
  it('refuses a point instead of scoring it as tennis, and records nothing', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'INN4XA-S:O3-M:T50' });
    expect(() => engine.addPoint({ winner: 0 })).toThrow(/set totals/);
    expect(engine.getState().history?.points ?? []).toEqual([]);
    expect(engine.getState().history?.entries ?? []).toEqual([]);
    expect(engine.getScore().sets).toEqual([]);
    expect(engine.canUndo()).toBe(false);
  });

  it('refuses a game', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'HAL2A-S:O3' });
    expect(() => engine.addGame({ winner: 0 })).toThrow(/set totals/);
    expect(engine.getScore().sets).toEqual([]);
  });

  it('takes set totals, and reports its input levels', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'INN4XA-S:O3-M:T50' });
    expect(engine.getInputLevels()).toEqual({ point: false, game: false, set: true });
    engine.addSet({ side1Score: 2, side2Score: 1 });
    expect(engine.getScore().sets[0]).toMatchObject({ side1Score: 2, side2Score: 1 });
  });

  it('a final set of outs refuses points only once it is the set in play', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:O3' });
    expect(engine.getInputLevels().point).toBe(true);
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 1 });
    expect(engine.getScore().scoreString).toBe('6-0, 0-6');
    expect(engine.getInputLevels()).toEqual({ point: false, game: false, set: true });
    expect(() => engine.addPoint({ winner: 0 })).toThrow(/set totals/);
  });

  it('the pure addPoint refuses too', async () => {
    const { addPoint } = await import('@Mutate/scoring/addPoint');
    const { createMatchUp } = await import('@Mutate/scoring/createMatchUp');
    expect(() => addPoint(createMatchUp({ matchUpFormat: 'INN4XA-S:O3' }), { winner: 0 })).toThrow(/set totals/);
  });

  it('an innings format of ordinary sets, and every tiebreak-set sport, still score by the point', () => {
    for (const format of ['INN3X-S:6/TB7', 'SET3-S:TB11', 'SET5-S:TB11', 'SET3-S:TB21']) {
      const engine = new ScoringEngine({ matchUpFormat: format });
      engine.addPoint({ winner: 0 });
      expect({ format, points: engine.getPointCount() }).toEqual({ format, points: 1 });
    }
  });
});

describe('an invalid format', () => {
  it('reports every level, and addPoint still refuses the format itself', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'BOGUS' });
    expect(engine.getInputLevels()).toEqual({ point: true, game: true, set: true });
    expect(() => engine.addPoint({ winner: 0 })).toThrow(/Invalid matchUpFormat/);
  });
});

describe('S8: a hard boundary is an annotation, not an enforced boundary', () => {
  it('is stored on the set, and a rebuild does not keep it', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });
    engine.markHardBoundary({ setIndex: 0, gameIndex: 0 });
    expect(engine.getState().score.sets[0].hardBoundaries).toEqual([0]);
    engine.addPoint({ winner: 1 });
    engine.undo();
    expect(engine.getState().score.sets[0].hardBoundaries).toBeUndefined();
  });
});

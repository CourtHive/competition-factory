import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { LEGACY_REFUSED_INPUT } from '@Mutate/scoring/matchCompletion';
import { describe, expect, it } from 'vitest';

/*
 * Point values (scoring-engine spec § 2.1 rule 7, § 4.4, § 7; § 16 decision 9, CA 2026-10-18): "A
 * scoreValue other than 1 is refused where a point is not a unit": a segment whose points build games, and
 * a combined total. "A configured multiplier applies only to a segment scored in units; in a game-building
 * segment it is not consulted." v1 recorded the value on the point and ignored it (SET3-S:6/TB7: two points
 * of value 2 were 30-0), and in P{n} dropped such a point silently.
 *
 * The replay rule (§ 12.8): a stored point v1 accepted with such a value replays as v1 replayed it.
 */

describe('§ 4.4 a scoreValue other than 1 is refused where a point is not a unit (CA 2026-10-18, decision 9)', () => {
  it.each(['SET3-S:6/TB7', 'SET3-S:T10', 'SET1-S:P32'])('%s refuses a point of value 2, writing nothing', (format) => {
    const engine = new ScoringEngine({ matchUpFormat: format });
    expect(() => engine.addPoint({ winner: 0, scoreValue: 2 })).toThrow(/not a unit/);
    expect(engine.getState().history?.points ?? []).toEqual([]);
    expect(engine.getState().history?.entries ?? []).toEqual([]);
  });

  it('the tiebreak a level timed segment plays at time is game-building too', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.endSegment();
    expect(() => engine.addPoint({ winner: 0, scoreValue: 3 })).toThrow(/not a unit/);
  });

  it.each(['SET3-S:TB11', 'SET3-S:T10P', 'SET2XA-S:T10', 'SET3-S:6/TB7-F:TB10'])(
    '%s takes it: a point there is a unit',
    (format) => {
      const engine = new ScoringEngine({ matchUpFormat: format });
      if (format.includes('-F:TB10')) {
        engine.addSet({ side1Score: 6, side2Score: 0 });
        engine.addSet({ side1Score: 0, side2Score: 6 });
      }
      expect(engine.addPoint({ winner: 0, scoreValue: 2 })).toEqual({ recorded: true });
      expect(engine.getState().history!.points.at(-1)!.scoreValue).toEqual(2);
    },
  );

  it('a value of exactly 1 is accepted everywhere', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine.addPoint({ winner: 0, scoreValue: 1 })).toEqual({ recorded: true });
  });
});

describe('§ 4.4 a multiplier is not consulted where points build games (decision 9)', () => {
  it('SET3-S:6/TB7 with a Winner multiplier: the point is one point, and records no value', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET3-S:6/TB7',
      pointMultipliers: [{ condition: { results: ['Winner'] }, value: 2 }],
    });
    engine.addPoint({ winner: 0, result: 'Winner' });
    expect(engine.getState().history!.points[0].scoreValue).toBeUndefined();
    expect(engine.getScore().pointDisplay).toEqual(['15', '0']);
  });

  it('a timed points segment keeps consulting it', () => {
    // a guard: a unit-scored segment keeps v1's multiplier
    const engine = new ScoringEngine({
      matchUpFormat: 'SET3-S:T10P',
      pointMultipliers: [{ condition: { results: ['Winner'] }, value: 2 }],
    });
    engine.addPoint({ winner: 0, result: 'Winner' });
    expect(engine.getState().score.sets[0].side1Score).toEqual(2);
  });
});

describe('§ 12.8 a stored point v1 accepted with a value replays as v1 replayed it', () => {
  it('a SET3-S:6/TB7 point of value 2 is still one point after a rebuild, flagged', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    const state = engine.getState();
    state.history!.entries![0].data.scoreValue = 2;
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    loaded.addPoint({ winner: 0 });
    loaded.undo();
    expect(loaded.getScore().pointDisplay).toEqual(['15', '0']);
    expect(loaded.getLegacyShapes()).toContain(LEGACY_REFUSED_INPUT);
  });
});

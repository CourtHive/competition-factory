import { ScoringEngine, getScore, getScoreboard } from '@Assemblies/governors/scoreGovernor';
import collection from '../../fixtures/overtime/officialResults.json';
import { describe, expect, it } from 'vitest';

type Fixture = (typeof collection.results)[number];
const FORMAT = 'SET2XA-S:T10P-O:2X/T5P-F:TB3';
const scorePair = (score: number[]) => ({ side1Score: score[0], side2Score: score[1] });
/** Exercise the JSON wire contract, rather than just cloning objects in memory. */
function wireRoundTrip<T>(value: T): T {
  const encoded = JSON.stringify(value);
  return JSON.parse(encoded) as T;
}
function playTotals(fixture: Fixture) {
  const engine = new ScoringEngine({ matchUpFormat: fixture.format });
  for (const period of fixture.periods) expect(engine.addSet(scorePair(period.score))).toEqual({ recorded: true });
  return engine;
}
function expectResult(engine: ScoringEngine, fixture: Fixture) {
  const state = engine.getState();
  expect(state.matchUpStatus).toBe('COMPLETED');
  expect(state.winningSide).toBe(fixture.scope === 'full' ? (fixture.officialWinner ?? undefined) : undefined);
  expect(state.score.overtime).toMatchObject({ aggregateScore: fixture.playedScore, decidedIn: 'OVERTIME' });
  expect(engine.getScore().overtime).toEqual(state.score.overtime);
  expect(getScore(state)).toEqual(engine.getScore());
  expect(getScoreboard(state)).toBe(engine.getScoreboard());
  for (const [index, period] of state.score.sets.entries()) {
    expect(period.phase).toBe(index < fixture.regulationPeriods ? 'REGULATION' : 'OVERTIME');
    expect(period.periodNumber).toBe(
      index < fixture.regulationPeriods ? index + 1 : index + 1 - fixture.regulationPeriods,
    );
  }
}

describe('public overtime score records and views', () => {
  it.each(collection.results)(
    '$id: public class reproduces the published covered result with phase-aware records',
    (fixture) => {
      expectResult(playTotals(fixture), fixture);
    },
  );

  it.each(collection.results)(
    '$id: undo, save/reload supplementary state, and redo preserve the decision',
    (fixture) => {
      const engine = playTotals(fixture);
      const complete = engine.getState();
      expect(engine.undo()).toBe(true);
      expect(engine.isComplete()).toBe(false);
      const undone = engine.getState();
      const supplementary = engine.getSupplementaryState();
      const restored = new ScoringEngine();
      restored.setState(wireRoundTrip(undone));
      restored.loadSupplementaryState(wireRoundTrip(supplementary));
      expect(restored.getState()).toEqual(undone);
      expect(restored.redo()).toBe(true);
      expect(restored.getState()).toEqual(complete);
      expectResult(restored, fixture);
    },
  );

  it.each(collection.results)('$id: an initial score agrees with period-by-period entry', (fixture) => {
    const engine = new ScoringEngine({ matchUpFormat: fixture.format });
    engine.setInitialScore({ sets: fixture.periods.map((period) => scorePair(period.score)) });
    expect(engine.getState().score).toEqual(playTotals(fixture).getState().score);
    expectResult(engine, fixture);
  });

  it.each(collection.results)(
    '$id: public goal/point replay, period ends, and completed record reload agree',
    (fixture) => {
      const engine = new ScoringEngine({ matchUpFormat: fixture.format });
      for (const period of fixture.periods) {
        const goals =
          period.goals ??
          period.score.flatMap((score, side) => Array.from({ length: score }, () => ({ side: side + 1 })));
        if (!goals.length) engine.addSet(scorePair([0, 0]));
        else {
          for (const goal of goals) engine.addPoint({ winner: goal.side === 1 ? 0 : 1 });
          if (!engine.isComplete()) engine.endSegment();
        }
      }
      expectResult(engine, fixture);
      const saved = wireRoundTrip(engine.getState());
      const restored = new ScoringEngine();
      restored.setState(saved);
      expect(restored.getState()).toEqual(saved);
      expectResult(restored, fixture);
    },
  );

  it('the active set format changes from regulation to overtime to the final decider', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    expect(engine.getSetInPlayFormat()?.minutes).toBe(10);
    engine.addSet(scorePair([1, 1]));
    engine.addSet(scorePair([0, 0]));
    expect(engine.getSetInPlayFormat()?.minutes).toBe(5);
    expect(engine.getScore().overtime).toMatchObject({ phase: 'OVERTIME', periodNumber: 1 });
    engine.addSet(scorePair([2, 0]));
    engine.addSet(scorePair([0, 2]));
    expect(engine.getSetInPlayFormat()?.tiebreakSet?.tiebreakTo).toBe(3);
    expect(engine.getScore().overtime).toMatchObject({
      phase: 'DECIDER',
      periodNumber: 1,
      aggregateScore: [3, 3],
      decidingScore: [0, 0],
    });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 });
    expect(engine.getScoreboard()).toBe('3-3 (Decider: 0-2)');
    engine.addPoint({ winner: 1 });
    expect(engine.getWinner()).toBe(2);
    expect(engine.getState().score.overtime).toMatchObject({
      aggregateScore: [3, 3],
      decidingScore: [0, 3],
      decidedIn: 'DECIDER',
    });
    expect(engine.getScoreboard({ perspective: 1 })).toBe('3-3 (Decider: 3-0)');
    expect(engine.getState().history?.points.at(-1)).toMatchObject({ phase: 'DECIDER', periodNumber: 1 });
    expect(getScore(engine.getState())).toEqual(engine.getScore());
  });

  it('a sudden-death point exposes match-point flags and can be edited or removed without legacy rescue', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'PER3XA-S:T20P-O:USD/T20P' });
    for (const pair of [
      [1, 0],
      [0, 1],
      [0, 0],
    ])
      engine.addSet(scorePair(pair));
    engine.addPoint({ winner: 0, scoreValue: 0 });
    expect(engine.getScore().situation).toMatchObject({ isMatchPoint: true, isGoldenPoint: true });
    expect(getScore(engine.getState()).situation).toEqual(engine.getScore().situation);
    engine.addPoint({ winner: 0 });
    expect(engine.getWinner()).toBe(1);
    engine.editPoint(1, { winner: 1 });
    expect(engine.getWinner()).toBe(2);
    expect(engine.getState().history?.points.at(-1)).toMatchObject({ phase: 'OVERTIME', periodNumber: 1 });
    engine.removePoint(1);
    expect(engine.isComplete()).toBe(false);
    expect(engine.getScoreboard()).toBe('1-1 (OT 1)');
    expect(engine.getLegacyShapes()).toEqual([]);
  });

  it('correcting an early overtime point cannot resurrect later periods past a new winner', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P-O:3/T5P' });
    engine.addSet(scorePair([0, 0]));
    engine.addSet(scorePair([0, 0]));
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.endSegment();
    engine.addPoint({ winner: 1 });
    engine.endSegment();
    expect(engine.getWinner()).toBe(2);
    engine.editPoint(1, { winner: 0 });
    expect(engine.getWinner()).toBe(1);
    expect(engine.getState().score.sets).toHaveLength(3);
    expect(engine.getState().score.overtime?.aggregateScore).toEqual([2, 0]);
    expect(engine.getLegacyShapes()).toEqual([]);
    engine.setState(engine.getState());
    expect(engine.getState().score.sets).toHaveLength(3);
    expect(engine.getWinner()).toBe(1);
  });

  it('an open timed overtime baseline and a score-only record can resume without losing the partial score', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P-O:1/T5P' });
    engine.setInitialScore({ sets: [scorePair([0, 0]), scorePair([0, 0])], currentSetScore: scorePair([2, 1]) });
    expect(engine.getScore().points).toEqual([2, 1]);
    const saved = engine.getState();
    delete saved.history;
    const restored = new ScoringEngine();
    restored.setState(saved);
    expect(restored.isComplete()).toBe(false);
    expect(restored.getScore().overtime?.aggregateScore).toEqual([2, 1]);
    restored.addPoint({ winner: 1 });
    restored.endSegment();
    expect(restored.isComplete()).toBe(true);
    expect(restored.getWinner()).toBeUndefined();
    expect(restored.getScore().overtime?.aggregateScore).toEqual([2, 2]);
  });

  it('phase metadata is rederived on reload rather than trusting forged stored labels', () => {
    const fixture = collection.results.find((fixture) => fixture.id === 'nhl-2022030311')!;
    const engine = playTotals(fixture);
    const saved = engine.getState();
    saved.score.sets[0].phase = 'DECIDER';
    saved.score.sets[0].periodNumber = 99;
    saved.score.overtime!.aggregateScore = [999, 999];
    const restored = new ScoringEngine();
    restored.setState(saved);
    expectResult(restored, fixture);
  });

  it('refuses unsupported overtime and unreplayable point-only records before changing the current state', () => {
    const engine = new ScoringEngine();
    const before = engine.getState();
    const saved = { ...before, matchUpFormat: 'SET2XA-S:T10P-O:1/T5P-M:T60' };
    expect(() => engine.setState(saved)).toThrow(/overtime/i);
    expect(engine.getState()).toEqual(before);
    const source = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P-O:1/T5P' });
    source.addPoint({ winner: 0 });
    const pointsOnly = source.getState();
    delete pointsOnly.history!.entries;
    expect(() => engine.setState(pointsOnly)).toThrow(/timeline/i);
    expect(engine.getState()).toEqual(before);
  });

  it.each(['SET2XA-S:T10P-O:1/T5P-M:T60', 'SET2XA-S:T10P-O:1/TB11', 'SET2XA-S:T10P-O:1/T5P/TB1'])(
    'the public class still refuses unsupported scoring combinations: %s',
    (matchUpFormat) => {
      const engine = new ScoringEngine({ matchUpFormat });
      const before = engine.getState();
      expect(() => engine.addPoint({ winner: 0 })).toThrow(/Invalid matchUpFormat/);
      expect(engine.getState()).toEqual(before);
    },
  );

  it('standalone queries retain service corrections and weighted-rally counts in the final decider', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.setServer(1, { recordEntry: false });
    for (const pair of [
      [1, 1],
      [0, 0],
      [0, 0],
      [0, 0],
    ])
      engine.addSet(scorePair(pair));
    engine.setServer(1);
    engine.addPoint({ winner: 0, scoreValue: 2 });
    expect(getScore(engine.getState())).toEqual(engine.getScore());
    engine.setServer(0, { recordEntry: false });
    expect(getScore(engine.getState())).toEqual(engine.getScore());
    const restored = new ScoringEngine();
    restored.setState(wireRoundTrip(engine.getState()));
    expect(restored.getScore()).toEqual(engine.getScore());
  });

  it('timed baseline game/point counters agree without counting the same units twice', () => {
    const format = 'SET2XA-S:T10P-O:1/T5P';
    const engine = new ScoringEngine({ matchUpFormat: format });
    engine.setInitialScore({
      sets: [scorePair([0, 0]), scorePair([0, 0])],
      currentGameScore: { side1Points: 2, side2Points: 1 },
    });
    expect(engine.getScore().overtime?.aggregateScore).toEqual([2, 1]);
    expect(engine.getScore().points).toEqual([2, 1]);
    const fresh = new ScoringEngine({ matchUpFormat: format });
    const before = fresh.getState();
    expect(() =>
      fresh.setInitialScore({
        sets: [scorePair([0, 0]), scorePair([0, 0])],
        currentSetScore: scorePair([1, 1]),
        currentGameScore: { side1Points: 2, side2Points: 1 },
      }),
    ).toThrow(/must agree/);
    expect(fresh.getState()).toEqual(before);
  });

  it('decorations cannot replace calculated phase labels or write them into timeline facts', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P-O:1SD/T5P' });
    engine.addSet(scorePair([0, 0]));
    engine.addSet(scorePair([0, 0]));
    engine.addPoint({ winner: 0 });
    engine.decoratePoint(0, { phase: 'REGULATION', periodNumber: 99, tag: 'kept' });
    expect(engine.getState().history?.points[0]).toMatchObject({ phase: 'OVERTIME', periodNumber: 1, tag: 'kept' });
    const data = engine.getState().history?.entries?.at(-1)?.data;
    expect(data.phase).toBeUndefined();
    expect(data.periodNumber).toBeUndefined();
    const restored = new ScoringEngine();
    restored.setState(wireRoundTrip(engine.getState()));
    expect(restored.getState().history?.points[0]).toMatchObject({ phase: 'OVERTIME', periodNumber: 1, tag: 'kept' });
  });

  it('a score-only record preserves a partially played final tiebreak when its timeline was deliberately omitted', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    for (const pair of [
      [1, 1],
      [0, 0],
      [0, 0],
      [0, 0],
    ])
      engine.addSet(scorePair(pair));
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    const saved = engine.getState();
    delete saved.history;
    const restored = new ScoringEngine();
    restored.setState(saved);
    expect(restored.getScore().overtime).toMatchObject({ aggregateScore: [1, 1], decidingScore: [2, 0] });
    restored.addPoint({ winner: 0 });
    expect(restored.getWinner()).toBe(1);
    expect(restored.getScore().overtime?.decidingScore).toEqual([3, 0]);
  });
});

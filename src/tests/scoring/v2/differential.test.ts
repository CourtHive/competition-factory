import { getScoringEngine, setScoringEngine } from '@Global/state/globalState';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getScoringDifferentialTally,
  resetScoringDifferentialTally,
  installScoringDifferential,
  ScoringEngineDivergence,
  firstDifference,
} from '@Assemblies/engines/scoring/v2/differential';

// constants and types
import { SCORING_ENGINE_DIFFERENTIAL, SCORING_ENGINE_V1, SCORING_ENGINE_V2 } from '@Constants/scoringEngineConstants';

/*
 * The ScoringEngine selector and its differential mode (scoring-engine v2 plan § 2): every call v1 takes is made on
 * a v2 engine shell beside it, and any difference throws. A differential that cannot report a difference is worth
 * nothing, so several cases here are v1 engines that misbehave on purpose.
 */

/** a stand-in v1 engine whose public surface the differential reads, misbehaving as each case needs */
class FakeEngine {
  state: any;
  legacy: string[] = [];
  constructor(state: Record<string, unknown> = {}) {
    this.state = {
      matchUpFormat: 'SET3-S:6/TB7',
      matchUpStatus: 'TO_BE_PLAYED',
      score: { sets: [] },
      history: { entries: [], points: [] },
      ...state,
    };
  }
  getState() {
    return structuredClone(this.state);
  }
  getSupplementaryState() {
    return { version: 1, pointMultipliers: [] };
  }
  getLegacyShapes() {
    return this.legacy;
  }
  getFormat() {
    return this.state.matchUpFormat;
  }
  /** records any point, valid or not, and never scores it */
  addPoint(data: any) {
    this.state.history.entries.push({ type: 'point', data });
    return { recorded: true };
  }
  /** refuses every game */
  addGame(...facts: unknown[]) {
    throw new Error(`refused ${facts.length} game`);
  }
  undo() {
    return true;
  }
  /** an edit that changes nothing, as `recalculate: false` leaves the score */
  editPoint(...facts: unknown[]) {
    return facts.length;
  }
}
installScoringDifferential(FakeEngine);

beforeEach(() => {
  setScoringEngine(SCORING_ENGINE_DIFFERENTIAL);
  resetScoringDifferentialTally();
});
afterEach(() => {
  setScoringEngine();
});

describe('the selector', () => {
  it('runs v1, v2 alone (the SE2c shell) or the differential; refuses any other mode', () => {
    expect(setScoringEngine(SCORING_ENGINE_V2).success).toEqual(true);
    expect(getScoringEngine()).toEqual(SCORING_ENGINE_V2);
    expect(setScoringEngine('nonsense' as any).error).toBeDefined();
    expect(setScoringEngine().success).toEqual(true);
    expect(getScoringEngine()).toEqual(SCORING_ENGINE_V1);
  });

  it('is inert in v1 mode: a misbehaving engine is not checked', () => {
    setScoringEngine(SCORING_ENGINE_V1);
    const fake = new FakeEngine();
    expect(fake.addPoint({ winner: 3 })).toEqual({ recorded: true });
    expect(getScoringDifferentialTally()).toEqual({});
  });
});

describe('the differential compares v1 with its v2 shell', () => {
  it('agrees with the real v1 engine across actions, and counts what it compared', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 0, 0, 0, 1] as const) engine.addPoint({ winner });
    engine.addGame({ winner: 1 });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.undo();
    engine.redo();
    expect(() => engine.addPoint({ winner: 7 as any })).toThrow();
    const tally = getScoringDifferentialTally();
    // the refused point is compared too: both refused it, and neither wrote anything
    expect(tally['compared:addPoint']).toEqual(6);
    expect(tally['verdict:addPoint']).toEqual(6);
    expect(tally['compared:redo']).toEqual(1);
  });

  it('throws when v1 records an action v2 refuses', () => {
    const fake = new FakeEngine();
    expect(() => fake.addPoint({ winner: 3 })).toThrow(ScoringEngineDivergence);
  });

  it('throws when v1 refuses an action v2 records, and rethrows v1’s refusal where both refuse', () => {
    expect(() => new FakeEngine().addGame({ winner: 0 })).toThrow(ScoringEngineDivergence);
    expect(() => new FakeEngine().addGame({ winner: 5 })).toThrow('refused');
    setScoringEngine(SCORING_ENGINE_V1);
    expect(() => new FakeEngine().addGame({ winner: 0 })).toThrow('refused');
  });

  it('throws when v1’s state differs from its shell’s after the same call, naming the path', () => {
    // the fake records the point but never scores it
    expect(() => new FakeEngine().addPoint({ winner: 0 })).toThrow(/\.(matchUpStatus|sets|points)/);
  });

  it('firstDifference names the first differing path and both values', () => {
    expect(firstDifference({ a: [1, 2] }, { a: [1, 3] })).toEqual({ path: '.a.1', v1: '2', v2: '3' });
    expect(firstDifference({ a: 1 }, { a: 1 })).toBeUndefined();
    expect(firstDifference(1, undefined)).toEqual({ path: '(root)', v1: '1', v2: 'undefined' });
  });
});

describe('what it compares now that v2 has a shell, and the little it does not', () => {
  const loadedFrom = (state: any) => {
    const engine = new ScoringEngine({ matchUpFormat: state.matchUpFormat });
    engine.setState(state);
    return engine;
  };

  it('a stored timeline with a legacy shape: loaded, rebuilt and replayed as v1 replayed it, compared each time', () => {
    const source = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 1, 0] as const) source.addGame({ winner });
    const state = source.getState();
    state.history!.entries!.push({ type: 'endSegment', data: { setNumber: 1 }, timestamp: '2026-10-01T00:00:00Z' });
    const engine = loadedFrom(state);
    resetScoringDifferentialTally();
    engine.addPoint({ winner: 0 });
    engine.undo();
    expect(engine.getLegacyShapes()).toEqual(['refusedInput']);
    const tally = getScoringDifferentialTally();
    expect([tally['compared:addPoint'], tally['compared:undo']]).toEqual([1, 1]);
  });

  it('an edit with recalculate false, and the input after it, are compared as they stand', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 0, 1] as const) engine.addPoint({ winner });
    engine.editPoint(0, { winner: 1 }, { recalculate: false });
    engine.addPoint({ winner: 0 });
    engine.undo();
    const tally = getScoringDifferentialTally();
    expect([tally['compared:editPoint'], tally['compared:addPoint'], tally['compared:undo']]).toEqual([1, 4, 1]);
  });

  it('a record with no timeline is compared: loaded as stored, then rebuilt from its points', () => {
    const source = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 0, 1, 0] as const) source.addPoint({ winner });
    const state = source.getState();
    delete state.history!.entries;
    const engine = loadedFrom(state);
    engine.undo();
    const tally = getScoringDifferentialTally();
    expect([tally['compared:setState'], tally['compared:undo']]).toEqual([1, 1]);
  });

  it('SE2c-D3: a record whose stored score disagrees with its timeline is excused until its next rebuild', () => {
    const source = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    source.addPoint({ winner: 0 });
    const state = source.getState();
    state.score.sets[0].side2Score = 3;
    const engine = loadedFrom(state);
    resetScoringDifferentialTally();
    engine.addPoint({ winner: 0 });
    expect(getScoringDifferentialTally()['pending:SE2c-D3']).toEqual(1);
    engine.undo();
    engine.addPoint({ winner: 0 });
    expect(getScoringDifferentialTally()['pending:SE2c-D3']).toEqual(1);
    expect(getScoringDifferentialTally()['compared:addPoint']).toEqual(2);
  });

  it('a status set outside scoring is not scoring’s to compare, and is counted', () => {
    const fake = new FakeEngine({ matchUpStatus: 'RETIRED' });
    fake.editPoint(0, { winner: 1 });
    expect(getScoringDifferentialTally()).toEqual({ 'deferred:status-outside-scoring': 1 });
  });
});

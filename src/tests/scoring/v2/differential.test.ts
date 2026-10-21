import { getScoringEngine, setScoringEngine } from '@Global/state/globalState';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getScoringDifferentialTally,
  resetScoringDifferentialTally,
  installScoringDifferential,
  ScoringEngineDivergence,
  firstDifference,
  compareStates,
} from '@Assemblies/engines/scoring/v2/differential';

// constants and types
import { SCORING_ENGINE_DIFFERENTIAL, SCORING_ENGINE_V1, SCORING_ENGINE_V2 } from '@Constants/scoringEngineConstants';

/*
 * The ScoringEngine selector and its differential mode (scoring-engine v2 plan § 2): v1 acts, v2 reduces the same
 * configuration and timeline, and any difference throws. A differential that cannot report a difference is worth
 * nothing, so most cases here are v1 engines that misbehave on purpose.
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
  it('runs v1 or the differential; v2 alone waits for the engine shell (SE2c)', () => {
    expect(setScoringEngine(SCORING_ENGINE_V2).error).toBeDefined();
    expect(getScoringEngine()).toEqual(SCORING_ENGINE_DIFFERENTIAL);
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

describe('the differential compares v1 with v2', () => {
  it('agrees with the real v1 engine across actions, and counts what it compared', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    for (const winner of [0, 0, 0, 0, 1] as const) engine.addPoint({ winner });
    engine.addGame({ winner: 1 });
    engine.addSet({ side1Score: 6, side2Score: 4 });
    engine.undo();
    engine.redo();
    expect(() => engine.addPoint({ winner: 7 as any })).toThrow();
    const tally = getScoringDifferentialTally();
    expect(tally['compared:addPoint']).toEqual(5);
    expect(tally['verdict:addPoint']).toEqual(6);
    expect(tally['compared:redo']).toEqual(1);
  });

  it('throws when v1 records an action v2 refuses', () => {
    const fake = new FakeEngine();
    expect(() => fake.addPoint({ winner: 3 })).toThrow(ScoringEngineDivergence);
  });

  it('throws when v1 refuses an action v2 records, and still rethrows otherwise', () => {
    const fake = new FakeEngine();
    expect(() => fake.addGame({ winner: 0 })).toThrow(ScoringEngineDivergence);
    expect(() => fake.addGame({ winner: 5 })).toThrow('refused');
    setScoringEngine(SCORING_ENGINE_V1);
    expect(() => fake.addGame({ winner: 0 })).toThrow('refused');
  });

  it('throws when v1’s score differs from v2’s reduction of the same timeline, naming the path', () => {
    const fake = new FakeEngine({
      matchUpStatus: 'IN_PROGRESS',
      score: { sets: [{ setNumber: 1, side1Score: 0, side2Score: 0 }] },
      history: { entries: [{ type: 'point', data: { winner: 0 } }], points: [] },
    });
    expect(() => compareStates(fake, 'probe')).toThrow(/\.sets\.0/);
    const replayed = new FakeEngine({ history: { entries: [{ type: 'point', data: { winner: 9 } }], points: [] } });
    expect(() => compareStates(replayed, 'probe')).toThrow(/replays entry 0/);
  });

  it('firstDifference names the first differing path and both values', () => {
    expect(firstDifference({ a: [1, 2] }, { a: [1, 3] })).toEqual({ path: '.a.1', v1: '2', v2: '3' });
    expect(firstDifference({ a: 1 }, { a: 1 })).toBeUndefined();
    expect(firstDifference(1, undefined)).toEqual({ path: '(root)', v1: '1', v2: 'undefined' });
  });
});

describe('what the differential defers, by reason, instead of passing silently', () => {
  const deferredBy = (fake: FakeEngine, method = 'probe', stale = false, loaded = false) => {
    resetScoringDifferentialTally();
    compareStates(fake, method, stale, loaded);
    return Object.keys(getScoringDifferentialTally());
  };

  it('legacy shapes, stale edits, statuses outside scoring; every segment kind is compared', () => {
    expect(deferredBy(new FakeEngine({ matchUpFormat: 'SET3-S:T10' }))).toEqual(['compared:probe']);
    const legacy = new FakeEngine();
    legacy.legacy = ['refusedInput'];
    expect(deferredBy(legacy)).toEqual(['deferred:legacy-shapes']);
    expect(deferredBy(new FakeEngine(), 'editPoint', true)).toEqual(['deferred:stale-edit']);
    expect(deferredBy(new FakeEngine({ matchUpStatus: 'RETIRED' }))).toEqual(['deferred:status-outside-scoring']);
  });

  it('records with no timeline, a stored score with an empty one, and legacy entries on a loaded timeline', () => {
    const stored = { score: { sets: [{ setNumber: 1, side1Score: 6, side2Score: 4 }] } };
    expect(deferredBy(new FakeEngine({ ...stored, history: { points: [] } }))).toEqual(['deferred:no-timeline']);
    expect(deferredBy(new FakeEngine({ score: { sets: [] }, history: undefined }))).toEqual(['compared:probe']);
    expect(deferredBy(new FakeEngine(stored))).toEqual(['deferred:stored-score']);
    const loaded = new FakeEngine({ history: { entries: [{ type: 'point', data: { winner: 9 } }], points: [] } });
    expect(deferredBy(loaded, 'setState', false, true)).toEqual(['deferred:legacy-replay']);
  });

  it('an edit with recalculate false is stale until a rebuild; then it is compared again', () => {
    const fake = new FakeEngine();
    fake.editPoint(0, {}, { recalculate: false });
    expect(getScoringDifferentialTally()['deferred:stale-edit']).toEqual(1);
    fake.undo();
    expect(getScoringDifferentialTally()['compared:undo']).toEqual(1);
  });
});

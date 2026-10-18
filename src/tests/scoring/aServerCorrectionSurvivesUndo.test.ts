import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * A server correction survives undo and rebuild (scoring-engine spec § 2.6, § 10.6, § 12.3; § 16 decision 16,
 * CA 2026-10-18): "With recordEntry: false it is not an action of its own: it is recorded attached to the
 * preceding entry, replayed with it, and undone with it, so undoing that point removes the correction too."
 * v1 changed the orientation without a record, and the next rebuild lost it (SET3-S:6/TB7: servers 1, 1,
 * then after one undo the surviving point's server was 0); INTENNSE re-applies it after every point and
 * still showed the wrong server after an undo.
 */

function servers(engine: ScoringEngine) {
  return engine.getState().history!.points.map((point) => point.server);
}

describe('§ 2.6 a recordEntry: false correction is attached to the entry before it (CA 2026-10-18, decision 16)', () => {
  it('SET3-S:6/TB7: servers 1, 1; after one undo the surviving point keeps server 1', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.setServer(1, { recordEntry: false });
    engine.addPoint({ winner: 0 });
    expect(servers(engine)).toEqual([0, 1]);

    engine.addPoint({ winner: 1 });
    engine.undo();
    expect(servers(engine)).toEqual([0, 1]);
    expect(engine.getNextServer()).toEqual(1);
  });

  it('undoing the point takes its correction with it; redo puts both back', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.setServer(1, { recordEntry: false });
    expect(engine.getNextServer()).toEqual(1);

    engine.undo();
    expect(engine.getState().history!.entries).toEqual([]);
    expect(engine.getNextServer()).toEqual(0);
    engine.redo();
    expect(engine.getNextServer()).toEqual(1);
  });

  it('the INTENNSE pattern: winner serves, re-applied after every point, right after an undo and a reload', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P' });
    engine.setServer(1); // the coin toss, a recorded action
    for (const winner of [0, 0, 1, 0] as const) {
      engine.addPoint({ winner });
      engine.setServer(winner, { recordEntry: false });
    }
    expect(servers(engine)).toEqual([1, 0, 0, 1]);
    expect(engine.getNextServer()).toEqual(0);

    engine.undo();
    expect(servers(engine)).toEqual([1, 0, 0]);
    expect(engine.getNextServer()).toEqual(1);

    const reloaded = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P' });
    reloaded.setState(engine.getState());
    reloaded.addPoint({ winner: 1 });
    reloaded.undo();
    expect(servers(reloaded)).toEqual([1, 0, 0]);
    expect(reloaded.getNextServer()).toEqual(1);
  });

  it('undo still pops the point, not the correction', () => {
    // a guard: why recordEntry: false exists (setServer-recordEntry.test.ts)
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.setServer(1, { recordEntry: false });
    expect(engine.getUndoDepth()).toEqual(2);
    engine.undo();
    expect(engine.getPointCount()).toEqual(1);
  });
});

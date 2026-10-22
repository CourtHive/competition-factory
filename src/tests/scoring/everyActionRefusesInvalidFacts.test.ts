import { LEGACY_REFUSED_INPUT } from '@Assemblies/engines/scoring/v2/legacy';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * Every action refuses invalid facts before writing (scoring-engine spec § 1.1, § 2; § 16 decision 10,
 * CA 2026-10-18): "a side out of range, a score that is not a non-negative integer, a format that does not
 * parse (for every action that scores or names a server)." v1 validated only addPoint and editPoint:
 * addGame({ winner: 2 }) scored for side 2, and addSet, endSegment and setInitialScore were not validated;
 * an unparseable format refused only point input.
 *
 * The replay rule (§ 12.8): a stored entry v1 accepted with facts now refused replays as v1 replayed it.
 */

function expectNothingWritten(engine: ScoringEngine, act: () => unknown) {
  const before = engine.getState();
  expect(act).toThrow();
  expect(engine.getState()).toEqual(before);
}

describe('§ 2 every action refuses invalid facts before writing (CA 2026-10-18, decision 10)', () => {
  it('addGame: a winner not 0 or 1, a tiebreakScore that is not two counts', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expectNothingWritten(engine, () => engine.addGame({ winner: 2 as any }));
    expectNothingWritten(engine, () => engine.addGame({} as any));
    expectNothingWritten(engine, () => engine.addGame({ winner: 0, tiebreakScore: [7, -1] }));
    expectNothingWritten(engine, () => engine.addGame({ winner: 0, tiebreakScore: [7] as any }));
  });

  it('addSet: scores that are not non-negative integers, a winningSide not 1 or 2', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expectNothingWritten(engine, () => engine.addSet({ side1Score: -1, side2Score: 6 }));
    expectNothingWritten(engine, () => engine.addSet({ side1Score: 6.5, side2Score: 4 }));
    expectNothingWritten(engine, () => engine.addSet({ side1Score: 6 } as any));
    expectNothingWritten(engine, () => engine.addSet({ side1Score: 7, side2Score: 6, side1TiebreakScore: -7 }));
    expectNothingWritten(engine, () => engine.addSet({ side1Score: 6, side2Score: 4, winningSide: 0 as any }));
  });

  it('endSegment: a setNumber that is not a positive integer, a reason that is not a string', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    engine.addPoint({ winner: 0 });
    expectNothingWritten(engine, () => engine.endSegment({ setNumber: 0 }));
    expectNothingWritten(engine, () => engine.endSegment({ setNumber: 1.5 }));
    expectNothingWritten(engine, () => engine.endSegment({ reason: 7 as any }));
  });

  it('setInitialScore: no sets, invalid set scores, a game score, a server or a winner out of range', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expectNothingWritten(engine, () => engine.setInitialScore({} as any));
    expectNothingWritten(engine, () => engine.setInitialScore({ sets: [{ side1Score: -6, side2Score: 4 }] }));
    expectNothingWritten(engine, () =>
      engine.setInitialScore({ sets: [], currentGameScore: { side1Points: 1, side2Points: -1 } }),
    );
    expectNothingWritten(engine, () => engine.setInitialScore({ sets: [], server: 2 as any }));
    expectNothingWritten(engine, () => engine.setInitialScore({ sets: [], winningSide: 3 }));
  });

  it('setServer: a side not 0 or 1', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expectNothingWritten(engine, () => engine.setServer(2 as any));
  });

  it('an unparseable format refuses every action that scores or names a server, not only addPoint', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'NOT-A-FORMAT' });
    expectNothingWritten(engine, () => engine.addPoint({ winner: 0 }));
    expectNothingWritten(engine, () => engine.addGame({ winner: 0 }));
    expectNothingWritten(engine, () => engine.addSet({ side1Score: 6, side2Score: 4 }));
    expectNothingWritten(engine, () => engine.endSegment());
    expectNothingWritten(engine, () => engine.setInitialScore({ sets: [{ side1Score: 6, side2Score: 4 }] }));
    expectNothingWritten(engine, () => engine.setServer(1));
  });
});

describe('§ 12.8 a stored entry with facts now refused replays as v1 replayed it', () => {
  it('a game v1 recorded with winner 2 still scores for side 2 after a rebuild, flagged', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    const state = engine.getState();
    state.history!.entries!.push({ type: 'game', data: { winner: 2 }, timestamp: '2026-10-01T00:00:00Z' });
    state.score.sets[0].side2Score = 1;
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    loaded.addPoint({ winner: 0 });
    loaded.undo();
    const set = loaded.getState().score.sets[0];
    expect([set.side1Score, set.side2Score]).toEqual([1, 1]);
    expect(loaded.getLegacyShapes()).toContain(LEGACY_REFUSED_INPUT);
  });
});

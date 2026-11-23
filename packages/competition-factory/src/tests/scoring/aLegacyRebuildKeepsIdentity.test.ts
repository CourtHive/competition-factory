import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * A legacy point-only record (points, no `history.entries`) keeps its identity through a rebuild
 * (scoring-engine spec § 12.1, § 12.6 item 2; CA 2026-10-18): "a rebuild ... keeps everything that is not
 * scoring: the matchUp's identity, participants and any metadata a host attached." v1's points-only rebuild
 * (used by undo, editPoint and removePoint when the record has no timeline) started from a fresh matchUp and
 * copied back only each side's lineUp, so an undo on such a record dropped the sides' participants. Since
 * 2026-10-22 such a record takes its timeline on its first action, and the rebuild is the timeline's.
 */

function legacyRecord() {
  const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', matchUpId: 'm-1' });
  for (const winner of [0, 1, 0] as const) engine.addPoint({ winner });
  const state: any = engine.getState();
  delete state.history.entries;
  state.sides = [
    { sideNumber: 1, participantId: 'p-1', participant: { participantName: 'Ada' } },
    { sideNumber: 2, participantId: 'p-2', participant: { participantName: 'Grace' } },
  ];
  state.extensions = [{ name: 'host', value: { court: 4 } }];
  state.drawId = 'd-1';
  return state;
}

function expectIdentity(engine: ScoringEngine) {
  const state: any = engine.getState();
  expect(state.matchUpId).toEqual('m-1');
  expect(state.drawId).toEqual('d-1');
  expect(state.extensions).toEqual([{ name: 'host', value: { court: 4 } }]);
  expect(state.sides.map((side: any) => side.participantId)).toEqual(['p-1', 'p-2']);
  expect(state.sides.map((side: any) => side.participant.participantName)).toEqual(['Ada', 'Grace']);
  // the action first gave the record its timeline (§ 12.6, CA 2026-10-22), one point entry per point
  expect(state.history.entries.filter((entry: any) => entry.type === 'point').length).toEqual(
    state.history.points.length,
  );
}

describe('§ 12.6 item 2 a legacy point-only rebuild keeps identity, participants and metadata (CA 2026-10-18)', () => {
  it('undo', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setState(legacyRecord());
    engine.undo();
    expect(engine.getPointCount()).toEqual(2);
    expectIdentity(engine);
  });

  it('editPoint', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setState(legacyRecord());
    engine.editPoint(1, { winner: 0 });
    expect(engine.getScore().pointDisplay).toEqual(['40', '0']);
    expectIdentity(engine);
  });

  it('removePoint', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setState(legacyRecord());
    engine.removePoint(0);
    expect(engine.getPointCount()).toEqual(2);
    expectIdentity(engine);
  });
});

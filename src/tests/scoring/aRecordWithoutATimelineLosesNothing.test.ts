import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * A record saved without a timeline (§ 12.6 shape 2: points, and perhaps a substitution list, but no entries)
 * takes its timeline on the first action that changes it: its points as point entries, each substitution placed
 * before the point it preceded. Every operation then works on that timeline, so nothing the record holds is lost
 * to an undo, a redo or a rebuild (CA 2026-10-22).
 */

const FORMAT = 'SET1-S:TB7';
const BEFORE = [
  ['a1', 'a2'],
  ['b1', 'b2'],
];
const AFTER = [
  ['a1', 'a3'],
  ['b1', 'b2'],
];

type Engine = ScoringEngine;
const make = (options: Record<string, unknown>): Engine => new ScoringEngine(options);

/** two points, a2 substituted by a3, two more points, and, when asked, a3 substituted by a4 after them */
function savedWithoutTimeline(make: (options: Record<string, unknown>) => Engine, substituteLast = false) {
  const engine = make({ matchUpFormat: FORMAT, isDoubles: true });
  engine.setLineUp(1, [{ participantId: 'a1' }, { participantId: 'a2' }]);
  engine.setLineUp(2, [{ participantId: 'b1' }, { participantId: 'b2' }]);
  engine.addPoint({ winner: 0 });
  engine.addPoint({ winner: 1 });
  engine.substitute({ sideNumber: 1, outParticipantId: 'a2', inParticipantId: 'a3' });
  engine.addPoint({ winner: 0 });
  engine.addPoint({ winner: 0 });
  if (substituteLast) engine.substitute({ sideNumber: 1, outParticipantId: 'a3', inParticipantId: 'a4' });
  const state = engine.getState();
  delete state.history!.entries;
  const loaded = make({ matchUpFormat: FORMAT, isDoubles: true });
  loaded.setState(state);
  return loaded;
}

const players = (engine: Engine) => engine.getState().history!.points.map((point) => point.activePlayers);
const subs = (engine: Engine) => (engine.getState().history!.substitutions ?? []).map((sub) => sub.inParticipantId);
const timeline = (engine: Engine) =>
  engine.getState().history!.entries!.map((entry) => (entry.type === 'point' ? entry.pointIndex : entry.type));

describe('a record without a timeline loses nothing (§ 12.6)', () => {
  it('takes its timeline on its first undo, each substitution before the point it preceded', () => {
    const engine = savedWithoutTimeline(make);
    expect(engine.getState().history!.entries).toBeUndefined();
    expect(engine.getUndoDepth()).toEqual(5);
    expect(engine.undo()).toBe(true);
    expect(timeline(engine)).toEqual([0, 1, 'substitution', 2]);
    expect(subs(engine)).toEqual(['a3']);
    expect(players(engine)).toEqual([BEFORE, BEFORE, AFTER]);
  });

  it('an undo and a redo leave it as it was: the points, their players and the substitution list', () => {
    const engine = savedWithoutTimeline(make);
    engine.undo(3);
    expect(subs(engine)).toEqual([]);
    engine.redo(3);
    expect(subs(engine)).toEqual(['a3']);
    expect(players(engine)).toEqual([BEFORE, BEFORE, AFTER, AFTER]);
    expect(engine.getActivePlayers().side1).toEqual(['a1', 'a3']);
  });

  it('an undo takes back the last action, a substitution after the last point included', () => {
    const engine = savedWithoutTimeline(make, true);
    expect(engine.getActivePlayers().side1).toEqual(['a1', 'a4']);
    engine.undo();
    expect(engine.getPointCount()).toEqual(4);
    expect(engine.getActivePlayers().side1).toEqual(['a1', 'a3']);
    expect(subs(engine)).toEqual(['a3']);
  });

  it('a correction keeps the substitutions: editPoint, removePoint and decoratePoint', () => {
    const edited = savedWithoutTimeline(make);
    edited.editPoint(0, { winner: 1 });
    expect(subs(edited)).toEqual(['a3']);
    expect(players(edited)).toEqual([BEFORE, BEFORE, AFTER, AFTER]);
    const removed = savedWithoutTimeline(make);
    removed.removePoint(0);
    expect(subs(removed)).toEqual(['a3']);
    expect(players(removed)).toEqual([BEFORE, AFTER, AFTER]);
    const decorated = savedWithoutTimeline(make);
    decorated.decoratePoint(3, { shot: 'lob' });
    // a correction that writes no score still gives the record its timeline at once
    expect(timeline(decorated)).toEqual([0, 1, 'substitution', 2, 3]);
    decorated.undo();
    decorated.redo();
    expect((decorated.getState().history!.points[3] as { shot?: string }).shot).toEqual('lob');
    expect(subs(decorated)).toEqual(['a3']);
  });

  it('the players a point recorded stand through a rebuild, whatever the substitution list says', () => {
    const engine = savedWithoutTimeline(make);
    const state = engine.getState();
    // a point recorded with players the list does not put on court
    state.history!.points[3].activePlayers = [
      ['a1', 'a9'],
      ['b1', 'b2'],
    ];
    const loaded = make({ matchUpFormat: FORMAT, isDoubles: true });
    loaded.setState(state);
    loaded.editPoint(0, { winner: 0 });
    expect(players(loaded)[3]).toEqual([
      ['a1', 'a9'],
      ['b1', 'b2'],
    ]);
  });

  it('an undo with nothing to take back starts no timeline', () => {
    const engine = make({ matchUpFormat: FORMAT });
    engine.setState(engine.getState());
    expect(engine.undo()).toBe(false);
    expect(engine.getState().history?.entries).toBeUndefined();
  });
});

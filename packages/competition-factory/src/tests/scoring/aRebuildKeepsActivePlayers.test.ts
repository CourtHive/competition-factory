import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { createMatchUp } from '@Assemblies/governors/scoreGovernor';
import { describe, expect, test } from 'vitest';

// Every point records the players on court when it was played (`activePlayers`). A rebuild of the
// score (undo, redo, a recalculating editPoint, removePoint) replays the timeline, and each point
// must come out of it carrying the same players it went in with, substitutions included.

const FORMAT = 'SET1-S:TB7';
const A_BEFORE = [
  ['a1', 'a2'],
  ['b1', 'b2'],
];
const A_AFTER = [
  ['a1', 'a3'],
  ['b1', 'b2'],
];

// two points, a2 substituted by a3, two more points
function doublesWithSubstitution() {
  const engine = new ScoringEngine({ matchUpFormat: FORMAT, isDoubles: true });
  engine.setLineUp(1, [{ participantId: 'a1' }, { participantId: 'a2' }]);
  engine.setLineUp(2, [{ participantId: 'b1' }, { participantId: 'b2' }]);
  engine.addPoint({ winner: 0 });
  engine.addPoint({ winner: 1 });
  engine.substitute({ sideNumber: 1, outParticipantId: 'a2', inParticipantId: 'a3' });
  engine.addPoint({ winner: 0 });
  engine.addPoint({ winner: 0 });
  return engine;
}

const activePlayers = (engine: ScoringEngine) =>
  (engine.getState().history?.points ?? []).map((point: any) => point.activePlayers);

test('the points record their players as they are played', () => {
  expect(activePlayers(doublesWithSubstitution())).toEqual([A_BEFORE, A_BEFORE, A_AFTER, A_AFTER]);
});

describe('each rebuild keeps every point with the players who played it', () => {
  test('undo', () => {
    const engine = doublesWithSubstitution();
    engine.undo();
    expect(activePlayers(engine)).toEqual([A_BEFORE, A_BEFORE, A_AFTER]);
  });

  test('redo', () => {
    const engine = doublesWithSubstitution();
    engine.undo();
    engine.redo();
    expect(activePlayers(engine)).toEqual([A_BEFORE, A_BEFORE, A_AFTER, A_AFTER]);
  });

  test('a recalculating editPoint', () => {
    const engine = doublesWithSubstitution();
    engine.editPoint(0, { winner: 1 });
    expect(activePlayers(engine)).toEqual([A_BEFORE, A_BEFORE, A_AFTER, A_AFTER]);
  });

  test('removePoint', () => {
    const engine = doublesWithSubstitution();
    engine.removePoint(0);
    expect(activePlayers(engine)).toEqual([A_BEFORE, A_AFTER, A_AFTER]);
  });

  test('in singles, one player per side', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.setLineUp(1, [{ participantId: 'a1' }]);
    engine.setLineUp(2, [{ participantId: 'b1' }]);
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.undo();
    expect(activePlayers(engine)).toEqual([['a1', 'b1']]);
  });
});

describe('an engine loaded from a saved matchUp', () => {
  test('with its supplementary state, undo keeps the players', () => {
    const saved = doublesWithSubstitution();
    const engine = new ScoringEngine({ matchUpFormat: FORMAT, isDoubles: true });
    engine.setState(saved.getState());
    engine.loadSupplementaryState(saved.getSupplementaryState());

    engine.undo();

    expect(activePlayers(engine)).toEqual([A_BEFORE, A_BEFORE, A_AFTER]);
  });

  test('from the matchUp alone, undo keeps the lineUps and the players', () => {
    const saved = doublesWithSubstitution();
    const engine = new ScoringEngine({ matchUpFormat: FORMAT, isDoubles: true });
    engine.setState(saved.getState());

    engine.undo();

    expect(activePlayers(engine)).toEqual([A_BEFORE, A_BEFORE, A_AFTER]);
    expect(engine.getActivePlayers()).toEqual({ side1: ['a1', 'a3'], side2: ['b1', 'b2'] });
  });

  test("never takes a previous matchUp's lineUps", () => {
    const engine = doublesWithSubstitution();
    engine.setState(createMatchUp({ matchUpFormat: FORMAT, isDoubles: true }));
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });

    engine.undo();

    expect(activePlayers(engine)).toEqual([undefined]);
    expect(engine.getActivePlayers()).toEqual({ side1: [], side2: [] });
  });

  test('with no timeline, a rebuild keeps the recorded players and the lineUps', () => {
    const saved = doublesWithSubstitution().getState();
    delete saved.history?.entries;
    const engine = new ScoringEngine({ matchUpFormat: FORMAT, isDoubles: true });
    engine.setState(saved);

    engine.undo();

    expect(activePlayers(engine)).toEqual([A_BEFORE, A_BEFORE, A_AFTER]);
    expect(engine.getActivePlayers()).toEqual({ side1: ['a1', 'a3'], side2: ['b1', 'b2'] });
  });
});

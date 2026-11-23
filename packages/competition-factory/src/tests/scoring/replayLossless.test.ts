import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * A rebuild (undo, redo, editPoint, removePoint, and any of them after a reload) replays the timeline.
 * It must reproduce what the caller recorded: every point input, the late-start baseline, and the
 * scoring configuration the points were scored under. Findings S1, S2 and S10 of the 2026-10-17
 * scoring-engine assessment.
 */

const FORMAT = 'SET3-S:6/TB7';
const TIMED = 'SET1-S:T10P';

function reload(engine: ScoringEngine, options: Record<string, any> = {}): ScoringEngine {
  const loaded = new ScoringEngine({ matchUpFormat: engine.getFormat(), ...options });
  loaded.setState(engine.getState());
  loaded.loadSupplementaryState(engine.getSupplementaryState());
  return loaded;
}

// an unrelated action and its undo: forces a rebuild from the timeline and leaves the record as it was
function rebuild(engine: ScoringEngine): void {
  engine.addPoint({ winner: 1 });
  engine.undo();
}

describe('S1: every recorded point input survives a rebuild', () => {
  const recorded = {
    winner: 0 as const,
    server: 1 as const,
    serverParticipantId: 'P1',
    timestamp: '2026-10-17T12:00:00.000Z',
    rallyLength: 7,
    result: 'Winner' as const,
    penaltyType: 'CODE_VIOLATION',
    wrongSide: true,
    wrongServer: true,
    penaltyPoint: true,
  };

  function expectRecorded(engine: ScoringEngine) {
    const point: any = engine.getState().history!.points[0];
    for (const [key, value] of Object.entries(recorded)) expect({ key, value: point[key] }).toEqual({ key, value });
  }

  it('through undo, redo, editPoint and removePoint of other points', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint(recorded);
    expectRecorded(engine);

    rebuild(engine);
    expectRecorded(engine);

    engine.addPoint({ winner: 1 });
    engine.undo();
    engine.redo();
    expectRecorded(engine);

    engine.editPoint(1, { winner: 0 });
    expectRecorded(engine);

    engine.removePoint(1);
    expectRecorded(engine);
  });

  it('through a reload and a rebuild', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint(recorded);
    const loaded = reload(engine);
    rebuild(loaded);
    expectRecorded(loaded);
  });

  it('a caller-supplied scoreValue keeps its weight: 3-0 stays 3-0', () => {
    const engine = new ScoringEngine({ matchUpFormat: TIMED });
    engine.addPoint({ winner: 0, scoreValue: 3 });
    rebuild(engine);
    expect(engine.getScore().games).toEqual([3, 0]);
    expect(engine.getState().history!.points[0].scoreValue).toEqual(3);
  });

  it('the winningSide spelling replays as the side it named', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({ winningSide: 2 });
    rebuild(engine);
    expect(engine.getState().history!.points[0].winner).toEqual(1);
  });

  it('decorations a host passes beyond the typed options survive too', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    // epixodic replays archived points with these
    engine.addPoint({ winner: 0, hand: 'Forehand', stroke: 'Volley', location: 'net' } as any);
    rebuild(engine);
    const point: any = engine.getState().history!.points[0];
    expect([point.hand, point.stroke, point.location]).toEqual(['Forehand', 'Volley', 'net']);
  });

  it('a calculated server is still not recorded as an input (R2)', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({ winner: 0 });
    const entry: any = engine.getState().history!.entries![0];
    expect(entry.data.server).toBeUndefined();
    expect(entry.data.winner).toEqual(0);
  });

  it('a record with no timeline replays its points with their recorded facts', () => {
    const engine = new ScoringEngine({ matchUpFormat: TIMED });
    engine.addPoint({ winner: 0, scoreValue: 3, wrongSide: true, serverParticipantId: 'P1' });
    engine.addPoint({ winner: 1 });
    const legacy = engine.getState();
    delete legacy.history!.entries;
    delete legacy.history!.points[1].timestamp; // older records do not always carry one

    const loaded = new ScoringEngine({ matchUpFormat: TIMED });
    loaded.setState(legacy);
    loaded.undo();
    const point: any = loaded.getState().history!.points[0];
    expect([point.scoreValue, point.wrongSide, point.serverParticipantId]).toEqual([3, true, 'P1']);
    expect(loaded.getScore().games).toEqual([3, 0]);

    loaded.redo();
    expect(loaded.getState().history!.points.length).toEqual(2);
    expect(loaded.getScore().games).toEqual([3, 1]);
  });
  it('a new point on a record with no timeline keeps the points before it through a rebuild', () => {
    const engine = new ScoringEngine({ matchUpFormat: TIMED });
    engine.addPoint({ winner: 0, scoreValue: 3 });
    engine.addPoint({ winner: 1 });
    const legacy = engine.getState();
    delete legacy.history!.entries;
    delete legacy.history!.points[1].timestamp; // older records do not always carry one

    const loaded = new ScoringEngine({ matchUpFormat: TIMED });
    loaded.setState(legacy);
    loaded.addPoint({ winner: 0 });
    rebuild(loaded);
    expect(loaded.getState().history!.points.length).toEqual(3);
    expect(loaded.getScore().games).toEqual([4, 1]);
  });
});

describe('S2: a late-start baseline survives reload and is part of the timeline', () => {
  function lateStart() {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.setInitialScore({ sets: [], currentSetScore: { side1Score: 3, side2Score: 2 } });
    engine.addPoint({ winner: 0 });
    return engine;
  }

  it('a reloaded late-start match keeps its baseline through a rebuild', () => {
    const engine = lateStart();
    const before = engine.getScore();
    const loaded = reload(engine);
    rebuild(loaded);
    expect(loaded.getScore()).toEqual(before);
    expect(loaded.getScore().sets[0]).toMatchObject({ side1Score: 3, side2Score: 2 });
  });

  it('setState alone is enough: the baseline lives in the timeline', () => {
    const engine = lateStart();
    const loaded = new ScoringEngine({ matchUpFormat: FORMAT });
    loaded.setState(engine.getState());
    rebuild(loaded);
    expect(loaded.getScore().sets[0]).toMatchObject({ side1Score: 3, side2Score: 2 });
  });

  it('undoing the baseline removes it, and redo restores it', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.setInitialScore({ sets: [], currentSetScore: { side1Score: 3, side2Score: 2 } });
    engine.undo();
    expect(engine.getScore().sets).toEqual([]);
    engine.redo();
    expect(engine.getScore().sets[0]).toMatchObject({ side1Score: 3, side2Score: 2 });
  });

  it('a rebuild keeps the matchUp identity and participants', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT, matchUpId: 'M1' });
    const state: any = engine.getState();
    state.sides[0].participant = { participantId: 'A', participantName: 'Ann' };
    state.sides[0].participantId = 'A';
    state.tournamentId = 'T1';
    const createdAt = state.createdAt;
    const loaded = new ScoringEngine({ matchUpFormat: FORMAT });
    loaded.setState(state);
    loaded.addPoint({ winner: 0 });
    rebuild(loaded);
    const after: any = loaded.getState();
    expect([after.matchUpId, after.tournamentId, after.createdAt]).toEqual(['M1', 'T1', createdAt]);
    expect(after.sides[0].participant).toEqual({ participantId: 'A', participantName: 'Ann' });
  });
});

describe('S10: the supplementary state carries the scoring configuration', () => {
  const competitionFormat = {
    matchUpFormat: TIMED,
    pointMultipliers: [{ condition: { results: ['Ace'] }, value: 2 }],
  };

  it('a weighted point keeps its weight after loading into a default engine', () => {
    const engine = new ScoringEngine({ matchUpFormat: TIMED, competitionFormat: competitionFormat as any });
    engine.addPoint({ winner: 0, result: 'Ace' });
    expect(engine.getScore().games).toEqual([2, 0]);

    const loaded = new ScoringEngine();
    loaded.setState(engine.getState());
    loaded.loadSupplementaryState(engine.getSupplementaryState());
    rebuild(loaded);
    expect(loaded.getScore().games).toEqual([2, 0]);
    expect(loaded.getPointMultipliers()).toEqual(competitionFormat.pointMultipliers);
    expect(loaded.getSubstitutionRules()).toEqual(engine.getSubstitutionRules());
  });

  it('is versioned, and an envelope written before the version loads as it always did', () => {
    const engine = new ScoringEngine({ matchUpFormat: TIMED, competitionFormat: competitionFormat as any });
    expect(engine.getSupplementaryState().version).toEqual(1);

    const loaded = new ScoringEngine({ matchUpFormat: TIMED, competitionFormat: competitionFormat as any });
    loaded.loadSupplementaryState({ redoStack: [] });
    expect(loaded.getPointMultipliers()).toEqual(competitionFormat.pointMultipliers);
  });

  it('the saved configuration is what the history was scored under, so it wins over the constructor', () => {
    const engine = new ScoringEngine({ matchUpFormat: TIMED, competitionFormat: competitionFormat as any });
    engine.addPoint({ winner: 0, result: 'Ace' });
    const loaded = reload(engine, { pointMultipliers: [{ condition: { results: ['Ace'] }, value: 5 }] });
    rebuild(loaded);
    expect(loaded.getScore().games).toEqual([2, 0]);
  });
});

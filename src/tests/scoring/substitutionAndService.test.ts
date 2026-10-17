import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * Findings S6 and S7 of the 2026-10-17 scoring-engine assessment. CA 2026-10-17: substitution rules
 * stay advisory (the engine reports violations, the host decides), and an observed court half is a
 * recorded input now; the participant-level service model is deferred.
 */

function doubles(competitionFormat?: any) {
  const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', isDoubles: true, competitionFormat });
  engine.setLineUp(1, [{ participantId: 'A' }, { participantId: 'B' }]);
  engine.setLineUp(2, [{ participantId: 'C' }, { participantId: 'D' }]);
  return engine;
}

describe('S6: substitute checks who is on court and says what it did', () => {
  it('a valid substitution succeeds and is recorded', () => {
    const engine = doubles();
    const result = engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' });
    expect(result).toEqual({ success: true });
    expect(engine.getActivePlayers().side1).toEqual(['E', 'B']);
  });

  it.each([
    [
      'the incoming player is already on court for that side',
      { outParticipantId: 'A', inParticipantId: 'B' },
      'IN_ALREADY_ON_COURT',
    ],
    [
      'the incoming player is on court for the other side',
      { outParticipantId: 'A', inParticipantId: 'C' },
      'IN_ALREADY_ON_COURT',
    ],
    ['the outgoing player is not on that side', { outParticipantId: 'C', inParticipantId: 'E' }, 'OUT_NOT_ON_SIDE'],
    ['a player is substituted for themselves', { outParticipantId: 'A', inParticipantId: 'A' }, 'SAME_PARTICIPANT'],
  ])('refuses when %s, and records nothing', (_label, players, error) => {
    const engine = doubles();
    engine.addPoint({ winner: 0 });
    engine.undo(); // a redo is pending: a refused substitution must leave it
    const before = engine.getState();
    const result = engine.substitute({ sideNumber: 1, ...players });
    expect(result).toEqual({ success: false, error });
    expect(engine.getState()).toEqual(before);
    expect(engine.canRedo()).toBe(true);
  });

  it('refuses when the side has no lineUp', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    const result = engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' });
    expect(result).toEqual({ success: false, error: 'NO_LINEUP' });
  });

  it('a recorded history replays as it was, even one an older engine let through', () => {
    const engine = doubles();
    engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' });
    const state: any = engine.getState();
    // an older engine recorded B coming on for A while B was already on court
    state.history.entries.push({
      type: 'substitution',
      data: { sideNumber: 1, outParticipantId: 'E', inParticipantId: 'B', beforePointIndex: 0 },
      timestamp: '2026-10-17T12:00:00.000Z',
    });
    state.sides[0].lineUp = [{ participantId: 'B' }, { participantId: 'B' }]; // as that engine left it
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', isDoubles: true });
    loaded.setState(state);
    loaded.addPoint({ winner: 0 });
    loaded.undo();
    expect(loaded.getActivePlayers().side1).toEqual(['B', 'B']);
  });
});

describe('S6: the competition rules are advisory: evaluateSubstitution reports, substitute does not refuse', () => {
  it('reports nothing without rules', () => {
    expect(doubles().evaluateSubstitution()).toEqual({ violations: [] });
  });

  it('allowed:false is reported, and the substitution still goes through', () => {
    const engine = doubles({ matchUpFormat: 'SET3-S:6/TB7', substitutionRules: { allowed: false } });
    expect(engine.evaluateSubstitution()).toEqual({ violations: ['NOT_ALLOWED'] });
    expect(engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' })).toEqual({
      success: true,
    });
  });

  it('counts per matchUp and per set', () => {
    const engine = doubles({
      matchUpFormat: 'SET3-S:6/TB7',
      substitutionRules: { allowed: true, maxPerMatchUp: 2, maxPerSegment: 1 },
    });
    engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' });
    expect(engine.evaluateSubstitution()).toEqual({ violations: ['MAX_PER_SEGMENT'] });

    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 }); // set 1 ends; set 2 is in play
    expect(engine.evaluateSubstitution()).toEqual({ violations: [] });

    engine.substitute({ sideNumber: 1, outParticipantId: 'E', inParticipantId: 'F' });
    expect(engine.evaluateSubstitution()).toEqual({ violations: ['MAX_PER_MATCHUP', 'MAX_PER_SEGMENT'] });
  });

  it('a substitution recorded before any point in a set counts in that set', () => {
    const engine = doubles({ matchUpFormat: 'SET3-S:6/TB7', substitutionRules: { allowed: true, maxPerSegment: 1 } });
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });
    engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' });
    engine.addPoint({ winner: 0 });
    expect(engine.evaluateSubstitution()).toEqual({ violations: ['MAX_PER_SEGMENT'] });
  });

  it('an event recorded before setNumber existed is placed by the point it preceded', () => {
    const rules = { allowed: true, maxPerSegment: 1 };
    const engine = doubles({ matchUpFormat: 'SET3-S:6/TB7', substitutionRules: rules });
    engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' }); // before set 1's first point
    for (let i = 0; i < 24; i++) engine.addPoint({ winner: 0 }); // set 1 ends 6-0
    engine.substitute({ sideNumber: 1, outParticipantId: 'E', inParticipantId: 'F' }); // set 2, no point after it yet
    const state: any = engine.getState();
    for (const sub of state.history.substitutions) delete sub.setNumber;

    const loaded = new ScoringEngine({
      matchUpFormat: 'SET3-S:6/TB7',
      isDoubles: true,
      competitionFormat: { matchUpFormat: 'SET3-S:6/TB7', substitutionRules: rules } as any,
    });
    loaded.setState(state);
    // the first is placed in set 1 by the point after it; the second, with none after it, in the set in play
    expect(loaded.evaluateSubstitution()).toEqual({ violations: ['MAX_PER_SEGMENT'] });
  });

  it('BETWEEN_GAMES is reported while a game is under way', () => {
    const engine = doubles({
      matchUpFormat: 'SET3-S:6/TB7',
      substitutionRules: { allowed: true, timing: 'BETWEEN_GAMES' },
    });
    expect(engine.evaluateSubstitution()).toEqual({ violations: [] });
    engine.addPoint({ winner: 0 });
    expect(engine.evaluateSubstitution()).toEqual({ violations: ['TIMING'] });
    for (let i = 0; i < 3; i++) engine.addPoint({ winner: 0 });
    expect(engine.evaluateSubstitution()).toEqual({ violations: [] });
  });

  it('a matchUp type the rules do not allow is reported', () => {
    const engine = doubles({
      matchUpFormat: 'SET3-S:6/TB7',
      substitutionRules: { allowed: true, allowedMatchUpTypes: ['SINGLES'] },
    });
    expect(engine.evaluateSubstitution()).toEqual({ violations: ['MATCHUP_TYPE'] });
  });
});

describe('S7: an observed court half is a recorded input', () => {
  it('is kept beside the expected serveSide, through undo and reload', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0, observedServeSide: 'ad' });
    engine.addPoint({ winner: 0 });
    engine.undo();
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(engine.getState());
    loaded.addPoint({ winner: 1 });
    loaded.undo();
    const point = loaded.getState().history!.points[0];
    expect([point.serveSide, point.observedServeSide]).toEqual(['deuce', 'ad']);
  });

  it('a point without it is as before', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0 });
    expect(engine.getState().history!.points[0].observedServeSide).toBeUndefined();
  });

  it('is refused unless it names a court half', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(() => engine.addPoint({ winner: 0, observedServeSide: 'left' as any })).toThrow(/observedServeSide/);
    expect(engine.getPointCount()).toEqual(0);
  });
});

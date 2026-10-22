import { getScoringEngine, setScoringEngine } from '@Global/state/globalState';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { ScoringEngineV2 } from '@Assemblies/engines/scoring/v2/engine';
import { afterEach, describe, expect, it } from 'vitest';

// constants and types
import { SCORING_ENGINE_V1, SCORING_ENGINE_V2 } from '@Constants/scoringEngineConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/*
 * ScoringEngine v2 (SE2c): the engine shell, held to the spec (§ 2, § 11, § 12) and the API reference directly,
 * whatever engine the selector names. The scoring suites hold it to every expectation they hold v1 to when run with
 * `SCORING_ENGINE=v2`; these cases are the shell's own oracle, so it is covered and checked in every run.
 */

const selected = getScoringEngine();
afterEach(() => {
  setScoringEngine(selected);
});

const engineFor = (matchUpFormat: string, options: Record<string, unknown> = {}) =>
  new ScoringEngineV2({ matchUpFormat, ...options });

function play(engine: ScoringEngineV2, sides: string) {
  for (const side of sides.replaceAll(' ', '')) engine.addPoint({ winner: side === '1' ? 0 : 1 });
}

const love = (side: '1' | '2', games = 1) => side.repeat(4 * games);
const sets = (engine: ScoringEngineV2) =>
  engine.getState().score.sets.map((set) => [set.side1Score, set.side2Score, set.winningSide]);

describe('the selector', () => {
  it('v2 selected: the constructor hands back the v2 shell; v1 selected: the class itself', () => {
    setScoringEngine(SCORING_ENGINE_V2);
    expect(new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' })).toBeInstanceOf(ScoringEngineV2);
    setScoringEngine(SCORING_ENGINE_V1);
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(engine).not.toBeInstanceOf(ScoringEngineV2);
    expect(engine).toBeInstanceOf(ScoringEngine);
  });
});

describe('§ 2 actions: recorded, ignored, or refused before anything is written', () => {
  it('a point, a game and a set total are recorded on the timeline', () => {
    const engine = engineFor('SET3-S:6/TB7');
    expect(engine.addPoint({ winner: 0 })).toEqual({ recorded: true });
    expect(engine.addGame({ winner: 1 })).toEqual({ recorded: true });
    expect(engine.addSet({ side1Score: 6, side2Score: 4 })).toEqual({ recorded: true });
    const entries = engine.getState().history?.entries ?? [];
    expect(entries.map((entry) => entry.type)).toEqual(['point', 'game', 'set']);
    expect(entries[0].pointIndex).toEqual(0);
    // the set total records the winner its rule gave it (§ 2.3 rule 1)
    expect(entries[2].data.winningSide).toEqual(1);
    expect(engine.getInputMode()).toEqual('mixed');
  });

  it('a point naming no winner and input after completion are ignored, and keep the redo stack', () => {
    const engine = engineFor('SET1-S:6/TB7');
    play(engine, love('1', 5) + '1');
    engine.undo();
    expect(engine.addPoint({} as never)).toEqual({ recorded: false, ignored: 'NO_WINNER' });
    expect(engine.canRedo()).toEqual(true);
    engine.redo();
    play(engine, '111');
    expect(engine.isComplete()).toEqual(true);
    expect(engine.addPoint({ winner: 1 })).toEqual({ recorded: false, ignored: 'MATCH_COMPLETED' });
    expect(engine.getWinner()).toEqual(1);
  });

  it('invalid facts throw, naming the field, and write nothing', () => {
    const engine = engineFor('SET3-S:6/TB7');
    expect(() => engine.addPoint({ winningSide: 3 as never })).toThrow(/winningSide/);
    expect(() => engine.addPoint({ winner: 0, winningSide: 2 })).toThrow(/disagree/);
    expect(() => engine.addPoint({ winner: 0, scoreValue: 2 })).toThrow(/not a unit/);
    expect(() => engine.addGame({ winner: 3 as never })).toThrow(/winner/);
    expect(() => engine.endSegment({ setNumber: 0 })).toThrow(/setNumber/);
    expect(() => engine.setInitialScore({} as never)).toThrow(/sets/);
    expect(engine.getState().history).toBeUndefined();
    expect(() => engineFor('NOT-A-FORMAT').addPoint({ winner: 0 })).toThrow(/Invalid matchUpFormat/);
  });

  it('a challenge and an annotation change no score, and undo takes them back last first', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, '1');
    engine.addChallenge({ sideNumber: 2, timestamp: '2026-10-21T00:00:00Z', call: 'out' });
    engine.addAnnotation({ note: 'rain' });
    expect(() => engine.addChallenge({ sideNumber: 3 as never })).toThrow(/sideNumber/);
    const entries = engine.getState().history?.entries ?? [];
    expect(entries.slice(1).map((entry) => [entry.type, entry.data])).toEqual([
      ['challenge', { sideNumber: 2, call: 'out' }],
      ['annotation', { note: 'rain' }],
    ]);
    expect(engine.getInputMode()).toEqual('points');
    engine.undo(2);
    expect(engine.getPointCount()).toEqual(1);
    expect(engine.getUndoDepth()).toEqual(1);
  });
});

describe('§ 11.2, § 11.3 the score and the situation of the next point', () => {
  it('a traditional game in tennis calls, the set in play’s games, and no situation before play', () => {
    const engine = engineFor('SET3-S:6/TB7');
    expect(engine.getScore().situation).toBeUndefined();
    expect(engine.getScore().scoreString).toEqual('0-0');
    play(engine, love('1') + '12');
    expect(engine.getScore()).toMatchObject({ games: [1, 0], points: [1, 1], pointDisplay: ['15', '15'] });
    play(engine, '1122');
    expect(engine.getScore().pointDisplay).toEqual(['40', '40']);
    play(engine, '2');
    expect(engine.getScore().pointDisplay).toEqual(['40', 'A']);
    expect(engine.getScore().scoreString).toEqual('1-0');
  });

  it('game point, break point, set point and match point, by the server who is known', () => {
    const engine = engineFor('SET1-S:6/TB7');
    // side 2 serves the sixth game at 5-0; side 1 at 0-40 is three break points from the match
    play(engine, love('1', 5) + '111');
    expect(engine.getScore().situation).toMatchObject({
      server: 1,
      serverDerived: true,
      isBreakPoint: true,
      isGamePoint: false,
      isSetPoint: true,
      isMatchPoint: true,
      isTiebreak: false,
    });
  });

  it('a tiebreak in numbers, and a No-Ad deciding point is golden', () => {
    const tiebreak = engineFor('SET3-S:6/TB7');
    play(tiebreak, '12'.repeat(6).replaceAll('1', love('1')).replaceAll('2', love('2')) + '12');
    expect(tiebreak.getScore()).toMatchObject({ pointDisplay: ['1', '1'], situation: { isTiebreak: true } });
    const noAd = engineFor('SET3-S:6NOAD');
    play(noAd, '111222');
    expect(noAd.getScore().situation).toMatchObject({ isGoldenPoint: true, isGamePoint: true, isBreakPoint: true });
  });

  it('a set tiebreak shows the loser’s points in the score string', () => {
    const engine = engineFor('SET3-S:6/TB7');
    engine.addSet({ side1Score: 7, side2Score: 6, side1TiebreakScore: 7, side2TiebreakScore: 3 });
    engine.addSet({ side1Score: 6, side2Score: 7, side1TiebreakScore: 5, side2TiebreakScore: 7 });
    expect(engine.getScore().scoreString).toEqual('7-6(3), 6(5)-7');
  });

  it('a timed segment has no points-to; a combined total counts rallies, with its deciding point golden', () => {
    const timed = engineFor('SET3-S:T10P');
    play(timed, '12');
    expect(timed.getScore().situation).toMatchObject({ isMatchPoint: false, isGamePoint: false, isTiebreak: false });
    const combined = engineFor('SET1-S:P4DP');
    play(combined, '1212');
    expect(combined.getScore()).toMatchObject({
      games: [0, 0],
      points: [2, 2],
      pointDisplay: ['2', '2'],
      situation: { isGoldenPoint: true, isMatchPoint: true },
    });
  });

  it('a match that ends level requires a decision (§ 9.7)', () => {
    const engine = engineFor('SET1-S:T10P');
    play(engine, '12');
    engine.endSegment();
    const score = engine.getScore();
    expect([engine.isComplete(), engine.getWinner(), score.decisionRequired]).toEqual([true, undefined, true]);
    expect(score.situation).toMatchObject({ decisionRequired: true, isMatchPoint: false });
  });

  it('the record views: scoreboard, episodes and statistics read the saved shape', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, love('1') + '1');
    expect(engine.getScoreboard()).toContain('1-0');
    expect(engine.getEpisodes()).toHaveLength(5);
    expect(engine.getStatistics().counters).toBeDefined();
    expect(Array.isArray(engine.getStatObjects())).toEqual(true);
  });
});

describe('§ 11.5 events', () => {
  it('fire in order on a point: point, game, set, match; and undo, redo and reset fire their own', () => {
    const calls: string[] = [];
    const record = (name: string) => () => calls.push(name);
    const engine = engineFor('SET1-S:6/TB7', {
      eventHandlers: {
        onPoint: record('point'),
        onGameComplete: ({ gameWinner }: { gameWinner: number }) => calls.push(`game:${gameWinner}`),
        onSetComplete: ({ setWinner }: { setWinner: number }) => calls.push(`set:${setWinner}`),
        onMatchComplete: ({ matchWinner }: { matchWinner: number }) => calls.push(`match:${matchWinner}`),
        onUndo: record('undo'),
        onRedo: record('redo'),
        onReset: record('reset'),
      },
    });
    play(engine, love('1', 6));
    expect(calls.slice(-4)).toEqual(['point', 'game:0', 'set:0', 'match:0']);
    engine.undo();
    engine.redo();
    engine.reset();
    expect(calls.slice(-3)).toEqual(['undo', 'redo', 'reset']);
    expect(engine.getEventHandlers()?.onPoint).toBeDefined();
    engine.setEventHandlers(undefined);
    expect(engine.getEventHandlers()).toBeUndefined();
  });

  it('a timed segment scored in units completes no game; a level close by endSegment fires onMatchTie', () => {
    let games = 0;
    let ties = 0;
    const engine = engineFor('SET1-S:T10P', {
      eventHandlers: { onGameComplete: () => (games += 1), onMatchTie: () => (ties += 1) },
    });
    play(engine, '12');
    engine.endSegment();
    expect([games, ties]).toEqual([0, 1]);
  });
});

describe('§ 12.3 undo and redo', () => {
  it('move entries to the redo stack and back; a recorded action clears it', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, '1122');
    expect(engine.undo(0)).toEqual(false);
    expect(engine.undo(2)).toEqual(true);
    expect([engine.getUndoDepth(), engine.getRedoDepth()]).toEqual([2, 2]);
    expect(engine.redo()).toEqual(true);
    expect(engine.getState().history?.points.map((point) => point.winner)).toEqual([0, 0, 1]);
    play(engine, '1');
    expect(engine.canRedo()).toEqual(false);
    expect(engine.redo()).toEqual(false);
    expect(engine.undo(10)).toEqual(true);
    expect(engine.canUndo()).toEqual(false);
  });
});

describe('§ 12.4 corrections', () => {
  it('editPoint writes every field, both spellings, and rebuilds; refused invalid data changes nothing', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, '1111');
    engine.editPoint(3, { winningSide: 2, result: 'Ace' });
    const point = engine.getState().history!.points[3];
    expect([point.winner, point.winningSide, (point as { result?: string }).result]).toEqual([1, 2, 'Ace']);
    expect(engine.getScore().games).toEqual([0, 0]);
    expect(() => engine.editPoint(0, { winner: 4 as never })).toThrow(/winner/);
    engine.editPoint(9, { winner: 1 });
    expect(engine.getPointCount()).toEqual(4);
  });

  it('with recalculate false the score waits for the next rebuild', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, '1111');
    engine.editPoint(3, { winner: 1 }, { recalculate: false });
    expect(engine.getScore().games).toEqual([1, 0]);
    expect(engine.getState().history!.points[3].winningSide).toEqual(2);
    engine.undo();
    engine.redo();
    expect(engine.getScore().games).toEqual([0, 0]);
  });

  it('removePoint renumbers the later point entries; decoratePoint survives a rebuild', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, '121');
    engine.decoratePoint(2, { shot: 'lob' });
    engine.removePoint(0);
    const state = engine.getState();
    expect(state.history!.entries!.map((entry) => entry.pointIndex)).toEqual([0, 1]);
    expect((state.history!.points[1] as { shot?: string }).shot).toEqual('lob');
    engine.removePoint(0, { recalculate: false });
    expect(engine.getPointCount()).toEqual(1);
    engine.removePoint(5);
    engine.decoratePoint(5, { shot: 'lob' });
    expect(engine.getPointCount()).toEqual(1);
  });

  it('a point added to a record a removal left stale links its entry to its position in the points (§ 12.4)', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, '1122');
    engine.removePoint(3, { recalculate: false });
    play(engine, '11');
    const { entries, points } = engine.getState().history!;
    expect(entries!.map((entry) => entry.pointIndex)).toEqual([0, 1, 2, 3, 4]);
    // the score's count numbers the points (SE2c-D6); the entry's link is the position
    expect(points.map((point) => (point as { index?: number }).index)).toEqual([0, 1, 2, 4, 5]);
    engine.decoratePoint(3, { shot: 'A' });
    engine.decoratePoint(4, { shot: 'B' });
    engine.editPoint(0, { winner: 0 });
    const shots = engine.getState().history!.points.map((point) => (point as { shot?: string }).shot);
    expect(shots).toEqual([undefined, undefined, undefined, 'A', 'B']);
  });

  it('markHardBoundary is an annotation, sorted, and the next rebuild discards it', () => {
    const engine = engineFor('SET3-S:6/TB7');
    play(engine, love('1', 3));
    engine.markHardBoundary({ setIndex: 0, gameIndex: 2 });
    engine.markHardBoundary({ setIndex: 0, gameIndex: 0 });
    expect(engine.getState().score.sets[0].hardBoundaries).toEqual([0, 2]);
    engine.undo();
    expect(engine.getState().score.sets[0].hardBoundaries).toBeUndefined();
  });
});

describe('§ 12.5, § 12.6 persistence', () => {
  it('getState and setState copy at the boundary; the envelope carries the configuration (version 1)', () => {
    const engine = engineFor('SET1-S:T10P', { pointMultipliers: [{ condition: { results: ['Ace'] }, value: 2 }] });
    engine.addPoint({ winner: 0, result: 'Ace' });
    engine.undo();
    const saved = engine.getState();
    saved.matchUpStatus = COMPLETED;
    expect(engine.getState().matchUpStatus).toEqual(TO_BE_PLAYED);
    const loaded = engineFor('SET1-S:T10P');
    loaded.setState(engine.getState());
    loaded.loadSupplementaryState(engine.getSupplementaryState());
    expect(loaded.canRedo()).toEqual(true);
    loaded.redo();
    expect(loaded.getState().score.sets[0].side1Score).toEqual(2);
    expect(loaded.getPointMultipliers()).toEqual([{ condition: { results: ['Ace'] }, value: 2 }]);
  });

  it('an envelope written before the version keeps the engine’s own configuration', () => {
    const engine = engineFor('SET1-S:T10P', { pointMultipliers: [{ condition: { results: ['Ace'] }, value: 3 }] });
    engine.loadSupplementaryState({ redoStack: [] });
    expect(engine.getPointMultipliers()).toEqual([{ condition: { results: ['Ace'] }, value: 3 }]);
  });

  it('a record with no timeline: undo pops points, redo re-adds them, a new action builds the timeline', () => {
    const source = engineFor('SET3-S:6/TB7');
    play(source, '1121');
    const state = source.getState();
    delete state.history!.entries;
    const engine = engineFor('SET3-S:6/TB7');
    engine.setState(state);
    expect(engine.getUndoDepth()).toEqual(4);
    engine.undo();
    expect(engine.getState().history?.entries).toBeUndefined();
    expect(engine.getState().history?.points).toHaveLength(3);
    engine.editPoint(2, { winner: 0 });
    expect(engine.getState().history?.entries).toBeUndefined();
    // a rebuilding correction cleared the redo stack (§ 12.4); a new point is the first recorded action
    expect(engine.redo()).toEqual(false);
    engine.addPoint({ winner: 0 });
    expect(engine.getState().history?.entries).toHaveLength(4);
    expect(engine.getScore().games).toEqual([1, 0]);
  });

  it('reset keeps the format and identity, and clears the history, redo and lineUps', () => {
    const engine = engineFor('SET3-S:6/TB7', { matchUpId: 'm1' });
    engine.setLineUp(1, [{ participantId: 'a1' }]);
    play(engine, '11');
    engine.reset();
    const state = engine.getState();
    expect([state.matchUpId, state.matchUpFormat, state.history, engine.canUndo()]).toEqual([
      'm1',
      'SET3-S:6/TB7',
      undefined,
      false,
    ]);
    expect(engine.getActivePlayers()).toEqual({ side1: [], side2: [] });
  });
});

describe('§ 12.8 legacy shapes replay as v1 replayed them, flagged', () => {
  const loadedWith = (format: string, build: (engine: ScoringEngineV2) => void, extra: Record<string, unknown>[]) => {
    const source = engineFor(format);
    build(source);
    const state = source.getState();
    state.history!.entries!.push(...(extra as never[]));
    const engine = engineFor(format);
    engine.setState(state);
    expect(engine.getLegacyShapes()).toEqual([]);
    engine.addAnnotation({ note: 'a rebuild follows' });
    engine.undo();
    return engine;
  };

  it('a game naming winner 2 is side 2’s; a set total keeps the winner v1 recorded', () => {
    const game = loadedWith('SET3-S:6/TB7', (engine) => engine.addGame({ winner: 0 }), [
      { type: 'game', data: { winner: 2 }, timestamp: '2026-10-01T00:00:00Z' },
    ]);
    expect(sets(game)).toEqual([[1, 1, undefined]]);
    expect(game.getLegacyShapes()).toEqual(['refusedInput']);
    const set = loadedWith('SET3-S:6/TB7', (engine) => play(engine, '1'), [
      { type: 'set', data: { side1Score: 6, side2Score: 4, winningSide: 2 }, timestamp: '2026-10-01T00:00:00Z' },
    ]);
    expect(sets(set).at(-1)).toEqual([6, 4, 2]);
  });

  it('a point with a value where a point is not a unit is one point, and keeps its value', () => {
    const engine = loadedWith('SET3-S:6/TB7', (source) => play(source, '1'), [
      { type: 'point', data: { winner: 0, scoreValue: 2 }, timestamp: '2026-10-01T00:00:00Z' },
    ]);
    expect(engine.getScore().pointDisplay).toEqual(['30', '0']);
    expect(engine.getState().history!.points[1].scoreValue).toEqual(2);
  });

  it('an endSegment on a set that is not timed closes it for the side ahead', () => {
    const engine = loadedWith(
      'SET3-S:6/TB7',
      (source) => [0, 1, 0].forEach((winner) => source.addGame({ winner: winner as 0 | 1 })),
      [{ type: 'endSegment', data: { setNumber: 1 }, timestamp: '2026-10-01T00:00:00Z' }],
    );
    expect(sets(engine)).toEqual([[2, 1, 1]]);
    expect(engine.getState().score.sets[0]).toMatchObject({ segmentComplete: true });
  });

  it('input past a level close plays on: a later set won decides the match', () => {
    const engine = loadedWith(
      'SET1-S:T10P',
      (source) => {
        play(source, '12');
        source.endSegment();
      },
      [
        { type: 'point', data: { winner: 0 }, timestamp: '2026-10-01T00:00:00Z' },
        { type: 'endSegment', data: {}, timestamp: '2026-10-01T00:00:01Z' },
      ],
    );
    expect(sets(engine)).toEqual([
      [1, 1, undefined],
      [1, 0, 1],
    ]);
    expect([engine.getWinner(), engine.getLegacyShapes()]).toEqual([1, ['scoringPastLevelClose']]);
  });

  it('input past a decided match plays on in a further set', () => {
    const engine = loadedWith(
      'SET3-S:6/TB7',
      (source) => {
        source.addSet({ side1Score: 6, side2Score: 0 });
        source.addSet({ side1Score: 6, side2Score: 0 });
      },
      [{ type: 'set', data: { side1Score: 6, side2Score: 1 }, timestamp: '2026-10-01T00:00:00Z' }],
    );
    expect(sets(engine)).toHaveLength(3);
    expect(engine.getLegacyShapes()).toEqual(['ignoredInput']);
  });
});

describe('§ 2.6, § 10.6 server corrections', () => {
  it('recorded by default; with recordEntry false attached to the entry before it; nothing changed, nothing recorded', () => {
    const engine = engineFor('SET3-S:6/TB7');
    // the first correction orients the derivation even to the side already due; the same one again changes nothing
    engine.setServer(0);
    engine.setServer(0);
    expect(engine.getState().history?.entries).toHaveLength(1);
    engine.setServer(1);
    expect(engine.getNextServer()).toEqual(1);
    play(engine, '1');
    engine.setServer(0, { recordEntry: false });
    const entries = engine.getState().history!.entries!;
    expect(entries.map((entry) => [entry.type, entry.serverCorrection])).toEqual([
      ['setServer', undefined],
      ['setServer', undefined],
      ['point', 0],
    ]);
    expect(engine.getNextServer()).toEqual(0);
    engine.undo();
    expect(engine.getNextServer()).toEqual(1);
    expect(() => engine.setServer(2 as never)).toThrow(/server/);
    expect(() => engineFor('NOT-A-FORMAT').setServer(1)).toThrow(/Invalid matchUpFormat/);
  });

  it('with nothing on the timeline, a correction is the initial server, kept through a rebuild (SE3-E1)', () => {
    const engine = engineFor('SET3-S:6/TB7');
    engine.setServer(1, { recordEntry: false });
    expect(engine.getNextServer()).toEqual(1);
    expect(engine.getState().history).toEqual({ points: [], entries: [], initialServer: 1 });
    play(engine, '1');
    engine.undo();
    expect(engine.getNextServer()).toEqual(1);
  });
});

describe('§ 2.7 lineUps and substitution', () => {
  it('refuses the four identity cases, records an accepted one, and points carry the players on court', () => {
    const engine = engineFor('SET3-S:6/TB7', { isDoubles: true });
    const substitute = (outParticipantId: string, inParticipantId: string, sideNumber: 1 | 2 = 1) =>
      engine.substitute({ sideNumber, outParticipantId, inParticipantId });
    expect(substitute('a1', 'a9')).toEqual({ success: false, error: 'NO_LINEUP' });
    engine.setLineUp(1, [{ participantId: 'a1' }, { participantId: 'a2' }]);
    engine.setLineUp(2, [{ participantId: 'b1' }, { participantId: 'b2' }]);
    expect(substitute('a1', 'a1')).toEqual({ success: false, error: 'SAME_PARTICIPANT' });
    expect(substitute('b1', 'a9')).toEqual({ success: false, error: 'OUT_NOT_ON_SIDE' });
    expect(substitute('a1', 'b2')).toEqual({ success: false, error: 'IN_ALREADY_ON_COURT' });
    play(engine, '1');
    expect(substitute('a2', 'a3')).toEqual({ success: true });
    play(engine, '1');
    const players = engine.getState().history!.points.map((point) => point.activePlayers);
    expect(players).toEqual([
      [
        ['a1', 'a2'],
        ['b1', 'b2'],
      ],
      [
        ['a1', 'a3'],
        ['b1', 'b2'],
      ],
    ]);
    expect(engine.getActivePlayers()).toEqual({ side1: ['a1', 'a3'], side2: ['b1', 'b2'] });
    engine.undo(2);
    expect(engine.getActivePlayers()).toEqual({ side1: ['a1', 'a2'], side2: ['b1', 'b2'] });
    expect(engine.getInputMode()).toEqual('points');
  });

  it('evaluateSubstitution reports what the advisory rules would break, and refuses nothing', () => {
    const rules = {
      allowed: false,
      maxPerMatchUp: 1,
      maxPerSegment: 1,
      timing: 'BETWEEN_GAMES',
      allowedMatchUpTypes: ['SINGLES'],
    };
    const engine = engineFor('SET3-S:6/TB7', { isDoubles: true, competitionFormat: { substitutionRules: rules } });
    engine.setLineUp(1, [{ participantId: 'a1' }, { participantId: 'a2' }]);
    expect(engine.substitute({ sideNumber: 1, outParticipantId: 'a2', inParticipantId: 'a3' })).toEqual({
      success: true,
    });
    play(engine, '1');
    expect(engine.evaluateSubstitution().violations).toEqual([
      'NOT_ALLOWED',
      'MAX_PER_MATCHUP',
      'MAX_PER_SEGMENT',
      'TIMING',
      'MATCHUP_TYPE',
    ]);
    expect(engine.getSubstitutionRules()).toEqual(rules);
    expect(engineFor('SET3-S:6/TB7').evaluateSubstitution()).toEqual({ violations: [] });
  });
});

describe('format introspection and the configuration', () => {
  it('reads the governing format', () => {
    const engine = engineFor('SET3-S:6/TB7-F:TB10');
    expect([engine.getFormat(), engine.isNoAd(), engine.getSetsToWin(), engine.getTiebreakAt()]).toEqual([
      'SET3-S:6/TB7-F:TB10',
      false,
      2,
      6,
    ]);
    expect(engine.hasFinalSetTiebreak()).toEqual(true);
    expect(engine.getFormatStructure()?.bestOf).toEqual(3);
    expect(engine.getSetInPlayFormat()?.setTo).toEqual(6);
    engine.addSet({ side1Score: 6, side2Score: 3 });
    engine.addSet({ side1Score: 3, side2Score: 6 });
    expect(engine.getSetInPlayFormat()?.tiebreakSet?.tiebreakTo).toEqual(10);
    expect(engineFor('SET5-S:TB11').getTiebreakAt()).toBeNull();
    expect(engineFor('SET3-S:6NOAD').isNoAd()).toEqual(true);
    expect(engineFor('NOT-A-FORMAT').getSetInPlayFormat()).toBeUndefined();
  });

  it('the input levels of the set in play (§ 3.3), every level for a format that does not parse', () => {
    expect(engineFor('INN4XA-S:O3').getInputLevels()).toEqual({ point: false, game: false, set: true });
    expect(engineFor('SET1-S:P32').getInputLevels()).toEqual({ point: true, game: false, set: true });
    expect(engineFor('NOT-A-FORMAT').getInputLevels()).toEqual({ point: true, game: true, set: true });
    expect(engineFor('SET3-S:6/TB7').getInputMode()).toEqual('none');
  });

  it('the competition format’s profiles are returned as configured; multipliers are copies', () => {
    const competitionFormat = {
      penaltyProfile: { penaltyTypes: [] },
      pointProfile: { pointResults: [] },
      timerProfile: { shotClockSeconds: 25 },
      timeoutRules: { count: 1, per: 'SET' },
      penaltyBoxProfile: { durationSeconds: 60 },
      playerRules: { maxMinutesPerSegment: 10 },
    };
    const engine = engineFor('SET3-S:6/TB7', { competitionFormat });
    expect([
      engine.getPenaltyProfile(),
      engine.getPointProfile(),
      engine.getTimerProfile(),
      engine.getTimeoutRules(),
      engine.getPenaltyBoxProfile(),
      engine.getPlayerRules(),
    ]).toEqual(Object.values(competitionFormat));
    const multipliers = [{ condition: { results: ['Ace'] }, value: 2 }];
    engine.setPointMultipliers(multipliers);
    multipliers[0].value = 9;
    expect(engine.getPointMultipliers()[0].value).toEqual(2);
  });
});

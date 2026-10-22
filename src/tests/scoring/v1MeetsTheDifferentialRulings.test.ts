import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { ScoringEngineV2 } from '@Assemblies/engines/scoring/v2/engine';
import { describe, expect, it } from 'vitest';

/*
 * v1 brought to the rule where the v1/v2 differential found it short (CA 2026-10-21; scoring-engine v2 plan § 9,
 * SE2a-D11, SE2b-D11, D17, D18, D20, D22, D24; then SE3-E1, E2, E3, SE2c-D6; then SE2a-D3b, D12, D13, D14, SE2c-D3; then SE2b-D23, D25, D26).
 * The differential holds v1 to v2 on every one of these under
 * `SCORING_ENGINE=differential`; these cases hold v1 to the spec directly, whatever engine is selected.
 */

// read as plain records: the coordinates and marks under test are not all on the public types
const points = (engine: ScoringEngine) =>
  engine.getState().history!.points.map((point): Record<string, unknown> => ({ ...point }));
const sets = (engine: ScoringEngine) =>
  engine.getState().score.sets.map((set): Record<string, unknown> => ({ ...set }));

function play(engine: ScoringEngine, winners: string) {
  for (const side of winners) engine.addPoint({ winner: side === '1' ? 0 : 1 });
}

describe('D11: every set carries the mark of the format governing it, however it was entered (§ 1.2)', () => {
  it('a final-set match tiebreak is a tiebreak-only set', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
    engine.setInitialScore({
      sets: [
        { side1Score: 6, side2Score: 3 },
        { side1Score: 3, side2Score: 6 },
      ],
    });
    play(engine, '1');
    expect(sets(engine)[2].isTiebreakOnly).toBe(true);
  });

  it('a set opened by addGame or addSet', () => {
    const tiebreakOnly = new ScoringEngine({ matchUpFormat: 'SET5-S:TB11' });
    tiebreakOnly.addGame({ winner: 0 });
    tiebreakOnly.addSet({ side1Score: 11, side2Score: 4 });
    expect(sets(tiebreakOnly).map((set) => set.isTiebreakOnly)).toEqual([true, true]);
    const timed = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    timed.addGame({ winner: 0 });
    expect(sets(timed)[0].isTimed).toBe(true);
  });

  it('the set in play of a baseline', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    engine.setInitialScore({ sets: [], currentSetScore: { side1Score: 2, side2Score: 1 } });
    expect(sets(engine)[0]).toMatchObject({ side1Score: 2, side2Score: 1, isTimed: true });
  });
});

describe('D17: a timed set scored in units plays no game point by point, so it has no per-game counts', () => {
  it('SET3-S:T10P', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    play(engine, '112');
    expect(sets(engine)[0]).toMatchObject({ side1Score: 2, side2Score: 1, isTimed: true });
    expect(sets(engine)[0].side1GameScores).toBeUndefined();
    expect(sets(engine)[0].side2GameScores).toBeUndefined();
  });
});

describe('D18: a combined total’s points carry their coordinates, as every point does (§ 11.1)', () => {
  it('one set played as one game: set 0, game 0, numbered from 0', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:P32' });
    play(engine, '12');
    const placed = points(engine).map(({ index, set, game, number }) => ({ index, set, game, number }));
    expect(placed).toEqual([
      { index: 0, set: 0, game: 0, number: 0 },
      { index: 1, set: 0, game: 0, number: 1 },
    ]);
  });
});

describe('D20: the point that wins a tiebreak at time completes a game, so it shows 0-0 (§ 11.1)', () => {
  it('SET3-S:T20/TB7, level at time', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T20/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment();
    play(engine, '1111111');
    expect(points(engine).map((point) => point.score)).toEqual(['1-0', '2-0', '3-0', '4-0', '5-0', '6-0', '0-0']);
    expect(sets(engine)[0]).toMatchObject({ side1Score: 2, side2Score: 1, winningSide: 1 });
  });
});

describe('D24: a consecutive game’s pointsToGame counts the run in progress (§ 11.2)', () => {
  it('SET3-S:4-G:2C: after a point to side 1, side 1 needs one more, side 2 a whole run', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:4-G:2C' });
    play(engine, '11');
    expect(points(engine).map((point) => point.pointsToGame)).toEqual([
      [2, 2],
      [1, 2],
    ]);
  });
});

describe('D22: a completed match has no next point, so it derives no server (§ 10.4)', () => {
  it('isServerDerived() is false; getNextServer() still answers 0 or 1', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:6/TB7' });
    play(engine, '1111'.repeat(5));
    expect(engine.isServerDerived()).toBe(true);
    play(engine, '1111');
    expect(engine.getState().matchUpStatus).toBe('COMPLETED');
    expect(engine.isServerDerived()).toBe(false);
    expect([0, 1]).toContain(engine.getNextServer());
  });
});

describe('SE3-E1: a correction before anything is recorded is the match’s initial server (§ 2.6)', () => {
  it('kept on the record, not the timeline, so a rebuild and a reload start from it', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setServer(1, { recordEntry: false });
    expect(engine.getState().history).toMatchObject({ initialServer: 1, entries: [] });
    play(engine, '1');
    engine.setServer(0, { recordEntry: false });
    expect(points(engine)[0].server).toEqual(1);
    engine.undo();
    expect(engine.getNextServer()).toEqual(1);
    play(engine, '12');
    const reloaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    reloaded.setState(engine.getState());
    reloaded.undo();
    expect(points(reloaded).map((point) => point.server)).toEqual([1]);
    reloaded.reset();
    expect(reloaded.getState().history?.initialServer).toBeUndefined();
  });
});

describe('SE3-E2: undoing or redoing no action does nothing, and says so (§ 12.3)', () => {
  it('undo(0) and redo(0) answer false', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    play(engine, '11');
    engine.undo();
    expect([engine.undo(0), engine.redo(0)]).toEqual([false, false]);
    expect([engine.getUndoDepth(), engine.getRedoDepth()]).toEqual([1, 1]);
  });
});

describe('SE3-E3: under WINNER_SERVES a correction names the next point’s server (§ 10.6, § 10.7)', () => {
  it('the next point is served by the side named; the winner serves after it', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET3-S:6/TB7',
      competitionFormat: { serverRule: 'WINNER_SERVES' },
    });
    play(engine, '2');
    expect(engine.getNextServer()).toEqual(1);
    engine.setServer(0);
    expect(engine.getNextServer()).toEqual(0);
    const entries = engine.getState().history!.entries!.length;
    engine.setServer(0);
    expect(engine.getState().history!.entries!.length).toEqual(entries);
    play(engine, '2');
    expect(points(engine)[1].server).toEqual(0);
    expect(engine.getNextServer()).toEqual(1);
  });
});

describe('SE2c-D6: a point added to a record a removal left stale is numbered as its score counts it (§ 12.4)', () => {
  it('no index repeats until the next rebuild renumbers them', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    play(engine, '1122');
    engine.removePoint(3, { recalculate: false });
    play(engine, '11');
    expect(points(engine).map((point) => [point.index, point.pointNumber])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 5],
      [5, 6],
    ]);
    engine.undo();
    expect(points(engine).map((point) => point.index)).toEqual([0, 1, 2, 3]);
  });
});

describe('SE2a-D3b: the game that wins a set opens no next game, however it was entered', () => {
  it('a set closed by addGame keeps no trailing 0-0, as one closed by a point keeps none', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    play(engine, '11');
    for (let game = 0; game < 6; game++) engine.addGame({ winner: 0 });
    const [set] = sets(engine);
    expect(set).toMatchObject({ side1Score: 6, side2Score: 0, winningSide: 1 });
    expect([set.side1GameScores, set.side2GameScores]).toEqual([
      [2, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ]);
  });
});

describe('SE2a-D12: a point’s number counts the points played in its game, not their values (§ 11.1)', () => {
  it('after an ace worth 3 the next point is number 1', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET1-S:T10P',
      competitionFormat: { pointMultipliers: [{ condition: { results: ['Ace'] }, value: 3 }] } as any,
    });
    engine.addPoint({ winner: 0, result: 'Ace' });
    play(engine, '21');
    expect(points(engine).map((point) => [point.number, point.score])).toEqual([
      [0, '3-0'],
      [1, '3-1'],
      [2, '4-1'],
    ]);
  });
});

describe('SE2a-D14: a currentGameScore beside an unfinished tiebreak-only set names its race twice, and is refused', () => {
  it('SET3-S:TB10 at 4-3 with a currentGameScore of 2-1 is refused; at 4-3 alone it plays on from 4-3', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB10' });
    const sets43 = [{ side1Score: 4, side2Score: 3 }];
    expect(() =>
      engine.setInitialScore({ sets: sets43, currentGameScore: { side1Points: 2, side2Points: 1 } }),
    ).toThrow(/names its points again/);
    expect(engine.getState().history?.entries ?? []).toEqual([]);
    engine.setInitialScore({ sets: sets43 });
    expect(sets(engine)[0]).toMatchObject({ side1Score: 0, side2Score: 0, side1GameScores: [4], side2GameScores: [3] });
  });

  it('a stored baseline v1 took replays as v1 replayed it: the race from the total, flagged', () => {
    const source = new ScoringEngine({ matchUpFormat: 'SET3-S:TB10' });
    source.setInitialScore({ sets: [{ side1Score: 4, side2Score: 3 }] });
    const state = source.getState();
    (state.history!.entries![0].data as any).currentGameScore = { side1Points: 2, side2Points: 1 };
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:TB10' });
    loaded.setState(state);
    play(loaded, '1');
    loaded.undo();
    expect(sets(loaded)[0]).toMatchObject({ side1GameScores: [4], side2GameScores: [3] });
    expect(loaded.getLegacyShapes()).toContain('refusedInput');
  });
});

describe('SE2c-D3: a loaded record’s timeline is authoritative over its stored score (§ 12.2)', () => {
  it('the record shows its stored score until the next action, which is taken on the timeline', () => {
    const source = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    play(source, '1');
    const state = source.getState();
    state.history!.entries!.unshift({
      type: 'setInitialScore',
      data: { sets: [{ side1Score: 6, side2Score: 0 }] },
      timestamp: '2026-10-01T00:00:00Z',
    });
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    expect(sets(loaded).map((set) => [set.side1Score, set.side2Score])).toEqual([[0, 0]]);
    play(loaded, '1');
    expect(sets(loaded).map((set) => [set.side1Score, set.side2Score])).toEqual([
      [6, 0],
      [0, 0],
    ]);
    // the stored points stay until the next rebuild
    expect(points(loaded)).toHaveLength(2);
  });

  it('the configuration loaded after it prepares the score again', () => {
    const competitionFormat = { pointMultipliers: [{ condition: { results: ['Ace'] }, value: 2 }] } as any;
    const source = new ScoringEngine({ matchUpFormat: 'SET1-S:T10P', competitionFormat });
    source.addPoint({ winner: 0, result: 'Ace' });
    const loaded = new ScoringEngine();
    loaded.setState(source.getState());
    loaded.loadSupplementaryState(source.getSupplementaryState());
    play(loaded, '1');
    expect(sets(loaded)[0]).toMatchObject({ side1Score: 3, side2Score: 0 });
  });
});

/** the points-to views carried by the next point, a point to side 1, after `winners` (§ 11.2) */
function viewsAfter(engine: ScoringEngine, winners: string) {
  play(engine, winners + '1');
  const { gamesToSet, pointsToSet, pointsToMatch } = points(engine).at(-1)!;
  return { gamesToSet, pointsToSet, pointsToMatch };
}
const loveGames = (side: '1' | '2', games: number) => side.repeat(4 * games);

describe('SE2b-D23: gamesToSet counts the games won in a row that win the set, by its rule (§ 11.2)', () => {
  it('behind at 4-5 in a tiebreak set a side needs three; at 5-6 in an advantage set three', () => {
    const tiebreakSet = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(viewsAfter(tiebreakSet, loveGames('1', 4) + loveGames('2', 5))).toMatchObject({
      gamesToSet: [3, 1],
      pointsToSet: [12, 4],
    });
    const advantageSet = new ScoringEngine({ matchUpFormat: 'SET3-S:6' });
    expect(viewsAfter(advantageSet, loveGames('1', 5) + loveGames('2', 6)).gamesToSet).toEqual([3, 1]);
  });

  it('the one-game set needs two games from love, so a later one counts eight points', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:1/TB7' });
    expect(viewsAfter(engine, '')).toEqual({ gamesToSet: [2, 2], pointsToSet: [8, 8], pointsToMatch: [16, 16] });
  });
});

describe('SE2b-D25: pointsToMatch counts a deciding set at the final format’s minimum (§ 3.2, § 11.2)', () => {
  it('SET3-S:4WB1-F:TB7 one set down: the second set and a seven-point decider', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:4WB1-F:TB7' });
    expect(viewsAfter(engine, loveGames('1', 4)).pointsToMatch).toEqual([16, 23]);
  });
});

describe('SE2b-D26: in an aggregate’s decider each side needs the points of the decider (§ 9.3, § 11.2)', () => {
  it('SET3XA-S:T10-F:TB1 level 3-3 after three bolts, side 2 ahead two bolts to one: one point each', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3XA-S:T10-F:TB1' });
    for (const [side1Score, side2Score] of [
      [3, 0],
      [0, 1],
      [0, 2],
    ])
      engine.addSet({ side1Score, side2Score });
    expect(viewsAfter(engine, '').pointsToMatch).toEqual([1, 1]);
  });
});

describe('a set tiebreak keeps no streak, whatever the game format (§ 1.2, § 4.3)', () => {
  it('a consecutive-points format marks the run in its games and none in the tiebreak', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:4/TB5-G:3C' });
    play(engine, '11');
    expect(sets(engine)[0].currentStreak).toEqual({ side: 0, count: 2 });
    play(engine, '1' + '222' + '111222'.repeat(3));
    expect(sets(engine)[0]).toMatchObject({ side1Score: 4, side2Score: 4 });
    play(engine, '2222');
    expect(sets(engine)[0].currentStreak).toBeUndefined();
  });
});

describe('v1 reads the record v2 writes: at a cutover, and on a rollback (§ 12.5)', () => {
  const readByV1 = (written: ScoringEngineV2) => {
    const reader = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    reader.setState(written.getState());
    return reader;
  };

  it('a match whose initial server is all it holds: v2 writes no serverFlip', () => {
    const written = new ScoringEngineV2({ matchUpFormat: 'SET3-S:6/TB7' });
    written.setServer(1, { recordEntry: false });
    expect(written.getState().serverFlip).toBeUndefined();
    expect(readByV1(written).getNextServer()).toEqual(1);
  });

  it('a baseline that names its server: v2 keeps the server in the baseline’s data alone', () => {
    const written = new ScoringEngineV2({ matchUpFormat: 'SET3-S:6/TB7' });
    written.setInitialScore({ sets: [{ side1Score: 2, side2Score: 1 }], server: 0 });
    const reader = readByV1(written);
    expect(reader.getNextServer()).toEqual(written.getNextServer());
    reader.addPoint({ winner: 0 });
    reader.undo();
    expect(reader.getNextServer()).toEqual(0);
  });

  it('a loaded substitution list is shown as stored until the next action writes (SE2c-D3)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', isDoubles: true });
    engine.setLineUp(1, [{ participantId: 'A' }, { participantId: 'B' }]);
    engine.setLineUp(2, [{ participantId: 'C' }, { participantId: 'D' }]);
    engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' });
    const state = engine.getState();
    state.history!.substitutions = [];
    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', isDoubles: true });
    loaded.setState(state);
    expect(loaded.getState().history!.substitutions).toEqual([]);
    loaded.addPoint({ winner: 0 });
    expect(loaded.getState().history!.substitutions!.map((event) => event.inParticipantId)).toEqual(['E']);
  });
});

describe('the record shapes the full-record differential found, v2’s way (CA 2026-10-22)', () => {
  const history = (engine: ScoringEngine) => engine.getState().history;

  it('an entry holds the caller’s facts only: endSegment writes no setNumber into its data (R2)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    engine.addPoint({ winner: 0 });
    engine.endSegment();
    expect(history(engine)!.entries!.at(-1)!.data).toEqual({});
    engine.undo();
    engine.redo();
    expect(sets(engine)[0].segmentComplete).toBe(true);
  });

  it('a completed combined total carries its endTime (§ 1.2)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:P4' });
    play(engine, '1111');
    expect(engine.getState().matchUpStatus).toEqual('COMPLETED');
    expect(engine.getState().endTime).toBeDefined();
    engine.undo();
    expect(engine.getState().endTime).toBeUndefined();
  });

  it('an ignored point starts no history, and no timeline on a record without one (§ 12.6)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({} as never);
    expect(history(engine)).toBeUndefined();
    // a completed match saved without a timeline: the point after it is ignored
    const legacy = new ScoringEngine({ matchUpFormat: 'SET1-S:TB7' });
    play(legacy, '1111111');
    const state = legacy.getState();
    delete state.history!.entries;
    const loaded = new ScoringEngine({ matchUpFormat: 'SET1-S:TB7' });
    loaded.setState(state);
    expect(loaded.addPoint({ winner: 0 })).toMatchObject({ recorded: false });
    expect(history(loaded)!.entries).toBeUndefined();
  });

  it('a record without a timeline starts one on its first undo, each point entry linked to its point (§ 12.6)', () => {
    const source = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    play(source, '121');
    const state = source.getState();
    delete state.history!.entries;
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.setState(state);
    engine.undo();
    expect(history(engine)!.entries!.map((entry) => entry.pointIndex)).toEqual([0, 1]);
    engine.redo();
    expect(history(engine)!.entries!.map((entry) => entry.pointIndex)).toEqual([0, 1, 2]);
  });

  it('a timeline a removal empties is still the record’s timeline', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    play(engine, '1');
    engine.removePoint(0);
    expect(history(engine)!.entries).toEqual([]);
  });

  it('the deprecated hardBoundaries do not outlive the next recorded action (§ 2.9)', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    play(engine, '1111');
    engine.markHardBoundary({ setIndex: 0, gameIndex: 0 });
    expect(sets(engine)[0].hardBoundaries).toEqual([0]);
    play(engine, '1');
    expect(sets(engine)[0].hardBoundaries).toBeUndefined();
  });

  it('a substitution list emptied by an undo is kept, empty', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7', isDoubles: true });
    engine.setLineUp(1, [{ participantId: 'A' }, { participantId: 'B' }]);
    engine.substitute({ sideNumber: 1, outParticipantId: 'A', inParticipantId: 'E' });
    engine.undo();
    expect(history(engine)!.substitutions).toEqual([]);
  });
});

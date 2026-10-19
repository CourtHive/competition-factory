import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { LEGACY_REFUSED_INPUT } from '@Mutate/scoring/matchCompletion';
import { describe, expect, it } from 'vitest';

// constants
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/*
 * endSegment and closed segments (scoring-engine spec § 2.4, § 6.4; § 16 decisions 2 and 4, CA 2026-10-18).
 *
 * "endSegment ends timed segments only ... It is refused on any other segment kind, and when there is no
 * timed segment to end." "reason is a free host string, recorded and never interpreted (epixodic sends
 * bolt_expired)." "A closed segment takes no input: a point, game or set total aimed at it is refused, and
 * a second endSegment on it is refused." v1 closed a SET3-S:6/TB7 set at 2-1 and a SET3-S:TB11 set at 5-3
 * as level 0-0, and its addGame added to a level closed segment that endSegment then re-closed with a
 * winner (SET3-S:T10: games 1-1, end, game, end gave set one 2-1).
 *
 * The replay rule (§ 12.8): a persisted non-timed endSegment entry replays as v1 replayed it.
 */

function setScores(engine: ScoringEngine) {
  return engine.getState().score.sets.map((set) => [set.side1Score, set.side2Score, set.winningSide]);
}

describe('§ 2.4 endSegment ends timed segments only (CA 2026-10-18, decision 2)', () => {
  it('SET3-S:6/TB7 at 2-1 is refused, and nothing is written', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.addGame({ winner: 0 });
    const before = engine.getState();
    expect(() => engine.endSegment()).toThrow(/timed segments only/);
    expect(engine.getState()).toEqual(before);
  });

  it('SET3-S:TB11 at 5-3 is refused, not closed as level 0-0', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11' });
    for (const winner of [0, 0, 0, 0, 0, 1, 1, 1] as const) engine.addPoint({ winner });
    expect(() => engine.endSegment()).toThrow(/timed segments only/);
    const set = engine.getState().score.sets[0] as any;
    expect(set.segmentComplete).toBeUndefined();
    expect(set.winningSide).toBeUndefined();
  });

  it('a timed final set takes it; the standard sets before it do not', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:T20' });
    engine.addSet({ side1Score: 6, side2Score: 2 });
    expect(() => engine.endSegment()).toThrow(/timed segments only/);
    engine.addSet({ side1Score: 2, side2Score: 6 });
    engine.addGame({ winner: 0 });
    expect(engine.endSegment()).toEqual({ recorded: true });
    expect(engine.getWinner()).toEqual(1);
  });

  it('with no timed segment to end it is refused, and nothing is recorded for undo to pop', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    expect(() => engine.endSegment()).toThrow(/no timed segment to end/);
    expect(() => engine.endSegment({ setNumber: 3 })).toThrow(/no timed segment to end/);
    expect(engine.getState().history?.entries ?? []).toEqual([]);
    expect(engine.canUndo()).toEqual(false);
  });

  it('reason is a free host string, recorded as given and never interpreted', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3XA-S:T10P' });
    engine.addPoint({ winner: 0 });
    expect(engine.endSegment({ reason: 'bolt_expired' })).toEqual({ recorded: true });
    const entry = engine.getState().history!.entries!.at(-1)!;
    expect(entry.type).toEqual('endSegment');
    expect(entry.data.reason).toEqual('bolt_expired');
    expect(setScores(engine)).toEqual([[1, 0, 1]]);
  });
});

describe('§ 6.4 a closed segment takes no input (CA 2026-10-18, decision 4)', () => {
  it('SET3-S:T10: games 1-1, end, game: the game opens set two; set one stays level and closed', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment();
    engine.addGame({ winner: 0 });
    expect(setScores(engine)).toEqual([
      [1, 1, undefined],
      [1, 0, undefined],
    ]);
    expect((engine.getState().score.sets[0] as any).segmentComplete).toEqual(true);
  });

  it('a second endSegment on a closed segment is refused', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment();
    engine.addGame({ winner: 0 });
    const before = engine.getState();
    expect(() => engine.endSegment({ setNumber: 1 })).toThrow(/closed/);
    expect(engine.getState()).toEqual(before);

    const won = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    won.addPoint({ winner: 0 });
    won.endSegment();
    expect(() => won.endSegment()).toThrow(/closed/);
  });

  it('the undo of a game after a level close leaves set one as it was closed', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment();
    engine.addGame({ winner: 0 });
    expect(engine.getState().score.sets).toHaveLength(2);
    engine.undo();
    expect(setScores(engine)).toEqual([[1, 1, undefined]]);
    expect(engine.getState().matchUpStatus).toEqual(IN_PROGRESS);
  });
});

describe('§ 12.8 a stored non-timed endSegment replays as v1 replayed it', () => {
  it('a SET3-S:6/TB7 endSegment v1 recorded at 2-1 still closes set one on a rebuild, flagged', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.addGame({ winner: 0 });
    const state = engine.getState();
    // the entry v1 wrote, and the score it left
    state.history!.entries!.push({ type: 'endSegment', data: { setNumber: 1 }, timestamp: '2026-10-01T00:00:00Z' });
    state.score.sets[0].winningSide = 1;
    (state.score.sets[0] as any).segmentComplete = true;
    state.history!.entries!.push({ type: 'game', data: { winner: 1 }, timestamp: '2026-10-01T00:00:01Z' });
    state.score.sets.push({ setNumber: 2, side1Score: 0, side2Score: 1 });

    const loaded = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    loaded.setState(state);
    loaded.addPoint({ winner: 0 });
    loaded.undo();
    expect(setScores(loaded)).toEqual([
      [2, 1, 1],
      [0, 1, undefined],
    ]);
    expect(loaded.getLegacyShapes()).toContain(LEGACY_REFUSED_INPUT);
  });
});

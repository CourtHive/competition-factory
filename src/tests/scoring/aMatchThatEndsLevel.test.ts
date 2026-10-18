import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint } from '@Mutate/scoring/addPoint';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';

/*
 * A match that ends level (scoring-engine spec § 9.7; § 16 decisions 3, 12 and 18, CA 2026-10-18):
 * "A timed, aggregate or exactly-N match that ends level with no declared decider is COMPLETED with no
 * winningSide, and onMatchTie fires, as for a combined-total tie." The engine never plays a segment the
 * format did not declare, a decider exists only when declared (`/TB`, `-F:` of an exactly-N
 * aggregate), and the views say a decision is required (§ 11.2).
 *
 * And the replay rule (§ 12.8, decided 2026-10-18): the new behaviour applies at the action boundary
 * only. A stored timeline that holds entries v1 accepted past a level close replays as v1 replayed it,
 * flagged as a legacy shape.
 */

type Counts = { ties: number; completes: number };

function engineFor(matchUpFormat: string) {
  const counts: Counts = { ties: 0, completes: 0 };
  const engine = new ScoringEngine({
    matchUpFormat,
    eventHandlers: {
      onMatchTie: () => counts.ties++,
      onMatchComplete: () => counts.completes++,
    },
  });
  return { engine, counts };
}

/** Points by side number: `play(engine, '1122')`. */
function play(engine: ScoringEngine, sides: string) {
  for (const side of sides.replaceAll(' ', '')) engine.addPoint({ winner: side === '1' ? 0 : 1 });
}

function sets(engine: ScoringEngine) {
  return engine.getState().score.sets.map((set) => [set.side1Score ?? 0, set.side2Score ?? 0]);
}

function expectLevelClose(engine: ScoringEngine, counts: Counts) {
  const state = engine.getState();
  expect(state.matchUpStatus).toEqual(COMPLETED);
  expect(state.winningSide).toBeUndefined();
  expect(state.endTime).toBeDefined();
  expect(counts).toEqual({ ties: 1, completes: 0 });
  const score = engine.getScore();
  expect(score.decisionRequired).toEqual(true);
  expect(score.situation?.decisionRequired).toEqual(true);
  expect(score.situation?.isMatchPoint).toEqual(false);
}

/** Every scoring input after the close is ignored and recorded nothing (§ 9.7 rule 1). */
function expectNothingMorePlayed(engine: ScoringEngine) {
  const before = engine.getState();
  const entries = before.history?.entries?.length;
  engine.addPoint({ winner: 0 });
  engine.addGame({ winner: 0 });
  engine.addSet({ side1Score: 6, side2Score: 0 });
  engine.endSegment();
  const after = engine.getState();
  expect(after.score.sets).toEqual(before.score.sets);
  expect(after.history?.entries?.length).toEqual(entries);
  expect(after.matchUpStatus).toEqual(COMPLETED);
  expect(after.winningSide).toBeUndefined();
}

describe('§ 9.1 best of N: no set beyond N (CA 2026-10-18, decision 3)', () => {
  it('SET1-S:T10P level at time is COMPLETED without a winner; no second set', () => {
    const { engine, counts } = engineFor('SET1-S:T10P');
    play(engine, '1122');
    engine.endSegment();
    expect(sets(engine)).toEqual([[2, 2]]);
    expectLevelClose(engine, counts);
    expectNothingMorePlayed(engine);
  });

  // points build love games here (§ 6.2 rule 2)
  it('SET3-S:T10 with all three sets played and a level count of sets is a tie', () => {
    const { engine, counts } = engineFor('SET3-S:T10');
    play(engine, '1111 2222');
    engine.endSegment(); // level
    play(engine, '1111');
    engine.endSegment(); // side 1
    play(engine, '2222');
    engine.endSegment(); // side 2
    expect(sets(engine)).toEqual([
      [1, 1],
      [1, 0],
      [0, 1],
    ]);
    expectLevelClose(engine, counts);
    expectNothingMorePlayed(engine);
  });

  it('SET3-S:T10 with all three sets played: the side with more sets wins, short of two', () => {
    const { engine, counts } = engineFor('SET3-S:T10');
    play(engine, '1111 2222');
    engine.endSegment(); // level
    play(engine, '1111');
    engine.endSegment(); // side 1
    play(engine, '2222 1111');
    engine.endSegment(); // level
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getState().winningSide).toEqual(1);
    expect(engine.getScore().decisionRequired).toEqual(false);
    expect(counts.ties).toEqual(0);
  });

  it('a declared tiebreak at time decides a level timed set: SET1-S:T10/TB7 is not a tie', () => {
    const { engine, counts } = engineFor('SET1-S:T10/TB7');
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment();
    expect(engine.getState().matchUpStatus).toEqual(IN_PROGRESS);
    play(engine, '1111111');
    expect(engine.getState().winningSide).toEqual(1);
    expect(counts).toEqual({ ties: 0, completes: 1 });
  });
});

describe('§ 9.2 exactly N: a level count is complete without a winner (CA 2026-10-18, decision 18)', () => {
  it('HAL2X-S:TB11 one half each: the last point completes the match level and fires onMatchTie', () => {
    const { engine, counts } = engineFor('HAL2X-S:TB11');
    play(engine, '1'.repeat(11) + '2'.repeat(11));
    expect(sets(engine)).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expectLevelClose(engine, counts);
    expectNothingMorePlayed(engine);
  });

  it('HAL2X-S:TB11 by set totals: the set total completing a level count fires onMatchTie', () => {
    const { engine, counts } = engineFor('HAL2X-S:TB11');
    engine.addSet({ side1Score: 11, side2Score: 4 });
    engine.addSet({ side1Score: 6, side2Score: 11 });
    expectLevelClose(engine, counts);
    expectNothingMorePlayed(engine);
  });

  it('SET2X-S:T10: a set won and a set closed level is a win for the side with more sets', () => {
    const { engine, counts } = engineFor('SET2X-S:T10');
    play(engine, '1111');
    engine.endSegment();
    play(engine, '1111 2222');
    engine.endSegment();
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getState().winningSide).toEqual(1);
    expect(counts).toEqual({ ties: 0, completes: 0 }); // a segment end fires only onMatchTie (§ 11.5)
  });

  it('SET2X-S:T10: two sets closed level is a tie', () => {
    const { engine, counts } = engineFor('SET2X-S:T10');
    play(engine, '1111 2222');
    engine.endSegment();
    play(engine, '2222 1111');
    engine.endSegment();
    expectLevelClose(engine, counts);
    expectNothingMorePlayed(engine);
  });

  it('the pure addPoint completes a level count and ignores the next point', () => {
    let matchUp = createMatchUp({ matchUpFormat: 'HAL2X-S:TB11' });
    for (const side of '1'.repeat(11) + '2'.repeat(11)) matchUp = addPoint(matchUp, { winner: side === '1' ? 0 : 1 });
    expect(matchUp.matchUpStatus).toEqual(COMPLETED);
    expect(matchUp.winningSide).toBeUndefined();
    const points = matchUp.history?.points.length;
    matchUp = addPoint(matchUp, { winner: 0 });
    expect(matchUp.history?.points.length).toEqual(points);
    expect(matchUp.score.sets.length).toEqual(2);
  });
});

describe('§ 9.3 aggregate: a level total with no declared decider (CA 2026-10-18, decision 12)', () => {
  it('HAL2A-S:T45 level after two halves is a tie; no third half', () => {
    // a point is one of the sport's units under the HAL root (§ 6.2 rule 3)
    const { engine, counts } = engineFor('HAL2A-S:T45');
    play(engine, '11');
    engine.endSegment();
    play(engine, '22');
    engine.endSegment();
    expect(sets(engine)).toEqual([
      [2, 0],
      [0, 2],
    ]);
    expectLevelClose(engine, counts);
    expectNothingMorePlayed(engine);
  });

  it('SET3A-S:TB11 level 24-24 after three games is a tie; no fourth game', () => {
    const { engine, counts } = engineFor('SET3A-S:TB11');
    play(engine, '12'.repeat(11) + '11'); // 13-11
    play(engine, '2'.repeat(11)); // 0-11
    play(engine, '22' + '1'.repeat(11)); // 11-2
    expect(engine.getState().score.sets.map((set) => [set.side1TiebreakScore, set.side2TiebreakScore])).toEqual([
      [13, 11],
      [0, 11],
      [11, 2],
    ]);
    expectLevelClose(engine, counts);
    expectNothingMorePlayed(engine);
  });

  it('a declared decider is played: SET2XA-S:T10-F:TB1 level after two segments waits for it', () => {
    const { engine, counts } = engineFor('SET2XA-S:T10-F:TB1');
    play(engine, '1');
    engine.endSegment();
    play(engine, '2');
    engine.endSegment();
    expect(engine.getState().matchUpStatus).toEqual(IN_PROGRESS);
    expect(engine.getScore().decisionRequired).toEqual(false);
    engine.addPoint({ winner: 1 });
    expect(engine.getState().winningSide).toEqual(2);
    expect(counts).toEqual({ ties: 0, completes: 1 });
  });
});

describe('§ 11.2 decisionRequired: only on a match COMPLETED without a winner', () => {
  it('is false in play and on a won match; true on a combined-total tie', () => {
    const { engine } = engineFor('SET3-S:6/TB7');
    play(engine, '1111');
    expect(engine.getScore().decisionRequired).toEqual(false);
    expect(engine.getScore().situation?.decisionRequired).toBeUndefined();
    play(engine, '1111'.repeat(23));
    expect(engine.getState().winningSide).toEqual(1);
    expect(engine.getScore().decisionRequired).toEqual(false);
    expect(engine.getScore().situation).toBeUndefined();

    const tie = engineFor('SET1-S:P4');
    play(tie.engine, '1212');
    expect(tie.engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(tie.engine.getScore().decisionRequired).toEqual(true);
    expect(tie.engine.getScore().situation?.decisionRequired).toEqual(true);
  });
});

describe('§ 12.8 the replay rule: a timeline v1 wrote past a level close replays as v1 (2026-10-18)', () => {
  const at = (n: number) => `2026-10-18T10:00:${String(n).padStart(2, '0')}.000Z`;
  const point = (winner: 0 | 1, n: number, pointIndex: number) => ({
    type: 'point',
    data: { winner },
    timestamp: at(n),
    pointIndex,
  });
  const endSegment = (setNumber: number, n: number) => ({ type: 'endSegment', data: { setNumber }, timestamp: at(n) });

  /** A stored record: its timeline is authoritative, and a rebuild (undo then redo) replays it. */
  function load(matchUpFormat: string, entries: any[]) {
    const engine = new ScoringEngine({ matchUpFormat });
    const state = engine.getState();
    engine.setState({ ...state, matchUpStatus: IN_PROGRESS, history: { points: [], entries } });
    engine.undo();
    engine.redo();
    return engine;
  }

  it('SET1-S:T10P: v1 played a second set after a level close; the replay keeps it and its winner', () => {
    const engine = load('SET1-S:T10P', [
      point(0, 1, 0),
      point(1, 2, 1),
      endSegment(1, 3),
      point(0, 4, 2),
      endSegment(2, 5),
    ]);
    expect(sets(engine)).toEqual([
      [1, 1],
      [1, 0],
    ]);
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getState().winningSide).toEqual(1);
    expect(engine.getLegacyShapes()).toEqual(['scoringPastLevelClose']);
  });

  it('SET1-S:T10P: the same timeline offered live stops at the level close', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:T10P' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.endSegment();
    engine.addPoint({ winner: 0 });
    engine.endSegment();
    expect(sets(engine)).toEqual([[1, 1]]);
    expect(engine.getState().winningSide).toBeUndefined();
    expect(engine.getState().history?.entries?.length).toEqual(3);
    engine.undo();
    engine.redo();
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getLegacyShapes()).toEqual([]);
  });

  it('SET1-S:T10P: v1 left a second level set in play; the replay keeps every later completion v1’s', () => {
    const engine = load('SET1-S:T10P', [
      point(0, 1, 0),
      point(1, 2, 1),
      endSegment(1, 3),
      point(1, 4, 2),
      point(0, 5, 3),
      endSegment(2, 6),
    ]);
    expect(sets(engine)).toEqual([
      [1, 1],
      [1, 1],
    ]);
    expect(engine.getState().matchUpStatus).toEqual(IN_PROGRESS);
    expect(engine.getState().winningSide).toBeUndefined();
    expect(engine.getScore().decisionRequired).toEqual(false);
    expect(engine.getLegacyShapes()).toEqual(['scoringPastLevelClose']);
  });

  it('HAL2X-S:TB11: v1 recorded a third half by set total after a level count; the replay keeps 2-1', () => {
    const half = (side1Score: number, side2Score: number, n: number) => ({
      type: 'set',
      data: { side1Score, side2Score },
      timestamp: at(n),
    });
    const engine = load('HAL2X-S:TB11', [half(11, 0, 1), half(0, 11, 2), half(11, 0, 3)]);
    expect(sets(engine)).toEqual([
      [11, 0],
      [0, 11],
      [11, 0],
    ]);
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getState().winningSide).toEqual(1);
    expect(engine.getLegacyShapes()).toEqual(['scoringPastLevelClose']);
  });

  it('SET3A-S:TB11 without a timeline: v1 played a fourth game after 24-24; a rebuild keeps it', () => {
    // a legacy point-only record, as v1 scored it: 13-11, 0-11, 11-2, then 11-0 in a fourth game
    const v1 = ['12'.repeat(11) + '11', '2'.repeat(11), '22' + '1'.repeat(11), '1'.repeat(11)].join('');
    const matchUp = createMatchUp({ matchUpFormat: 'SET3A-S:TB11' });
    const stored = {
      ...matchUp,
      matchUpStatus: IN_PROGRESS,
      history: {
        points: [...v1].map((side, index) => ({
          winner: (side === '1' ? 0 : 1) as 0 | 1,
          pointNumber: index + 1,
          timestamp: at(index % 60),
        })),
      },
    };
    const engine = new ScoringEngine({ matchUpFormat: 'SET3A-S:TB11' });
    engine.setState(stored as any);
    engine.undo(); // the last point of the fourth game: a rebuild from the points
    const state = engine.getState();
    expect(state.score.sets.length).toEqual(4);
    expect([state.score.sets[3].side1GameScores?.[0], state.score.sets[3].side2GameScores?.[0]]).toEqual([10, 0]);
    expect(state.matchUpStatus).toEqual(IN_PROGRESS);
    expect(engine.getLegacyShapes()).toEqual(['scoringPastLevelClose']);
  });
});

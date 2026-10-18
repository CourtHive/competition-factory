import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * Timed service (scoring-engine spec § 10.3, § 10.5; § 16 decision 14, CA 2026-10-18): "Service alternates by
 * unit, continuously across segments: game by game where points build games, point by point otherwise, and a
 * new segment's first unit is served by the side that did not serve the last unit of the segment before, as
 * games run on across sets. A tiebreak at time follows Rule 5(b), opened by the side due to serve the next
 * unit. A timed aggregate segment takes the aggregate court-half rule." v1 opened each new segment from the
 * closed segment's count (SET3-S:T10P served 0, 1, 0 in segment one and 1, 1 in segment two), played the
 * tiebreak at time with no rotation (SET3-S:T20/TB7: 0, 0, 0, 0), and gave the points of a timed aggregate
 * segment no court half (SET7XA-S:T10P).
 */

function servers(engine: ScoringEngine) {
  return engine.getState().history!.points.map((point) => point.server);
}

function serveSides(engine: ScoringEngine) {
  return engine.getState().history!.points.map((point) => point.serveSide);
}

describe('§ 10.3 timed service runs on across segments (CA 2026-10-18, decision 14)', () => {
  it('SET3-S:T10P: 0, 1, 0 in segment one, then 1, 0 in segment two', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    for (const winner of [0, 0, 1] as const) engine.addPoint({ winner });
    engine.endSegment();
    expect(engine.getNextServer()).toBe(1);
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    expect(servers(engine)).toEqual([0, 1, 0, 1, 0]);
  });

  it('SET3-S:T10 (points build games): the first game of segment two is served whole by the side due', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10' });
    // three games in segment one, side 1 ahead 2-1: side 2 is due to serve the fourth game of the match
    for (const winner of [0, 1, 0] as const) engine.addGame({ winner });
    engine.endSegment();
    for (const winner of [0, 1, 0, 0] as const) engine.addPoint({ winner });
    expect(servers(engine)).toEqual([1, 1, 1, 1]);
    expect(engine.getNextServer()).toBe(1);
  });

  it('survives a rebuild: undo and redo replay the same servers', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P' });
    for (const winner of [0, 0, 1] as const) engine.addPoint({ winner });
    engine.endSegment();
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.undo(2);
    engine.redo(2);
    expect(servers(engine)).toEqual([0, 1, 0, 1, 0]);
  });
});

describe('§ 10.3 a tiebreak at time follows Rule 5(b) (CA 2026-10-18, decision 14)', () => {
  it('SET3-S:T20/TB7 level 1-1 at time: opened by the side due to serve the next game, then two each', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T20/TB7' });
    engine.addGame({ winner: 0 });
    engine.addGame({ winner: 1 });
    engine.endSegment();
    for (const winner of [0, 1, 0, 1, 0] as const) engine.addPoint({ winner });
    // two games played, so side 1 opens: 0, 1, 1, 0, 0
    expect(servers(engine)).toEqual([0, 1, 1, 0, 0]);
    expect(engine.getNextServer()).toBe(1);
  });

  it('SET3-S:T10P/TB7 level 2-2 at time: the points-based tiebreak rotates the same way', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:T10P/TB7' });
    for (const winner of [0, 1, 0, 1] as const) engine.addPoint({ winner });
    engine.endSegment();
    for (const winner of [0, 1, 0] as const) engine.addPoint({ winner });
    // four units served 0, 1, 0, 1; side 1 is due and opens the tiebreak: 0, 1, 1
    expect(servers(engine)).toEqual([0, 1, 0, 1, 0, 1, 1]);
  });
});

describe('§ 10.5 a timed aggregate segment takes the aggregate court half (CA 2026-10-18, decision 14)', () => {
  it('SET7XA-S:T10P: deuce when the aggregate total is even, across segments', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET7XA-S:T10P' });
    for (const winner of [0, 0, 1] as const) engine.addPoint({ winner });
    engine.endSegment();
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1 });
    expect(serveSides(engine)).toEqual(['deuce', 'ad', 'deuce', 'ad', 'deuce']);
  });

  it('a segment closed level still counts toward the aggregate total', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET2XA-S:T10P' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });
    engine.endSegment(); // 2-1
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    expect(serveSides(engine)).toEqual(['deuce', 'ad', 'deuce', 'ad', 'deuce', 'ad']);
  });

  it('the INTENNSE rule, as epixodic observes it: even total serves from deuce, with point values', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET2XA-S:T10P',
      pointMultipliers: [{ condition: { results: ['Ace'] }, value: 2 }],
    });
    engine.addPoint({ winner: 0, result: 'Ace' }); // 2-0, total 2
    engine.addPoint({ winner: 1 }); // 2-1, total 3
    engine.addPoint({ winner: 0 }); // total 4
    expect(serveSides(engine)).toEqual(['deuce', 'deuce', 'ad']);
  });
});

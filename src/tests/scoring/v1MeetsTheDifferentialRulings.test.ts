import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * v1 brought to the rule where the v1/v2 differential found it short (CA 2026-10-21; scoring-engine v2 plan § 9,
 * SE2a-D11, SE2b-D11, D17, D18, D20, D22, D24). The differential holds v1 to v2 on every one of these under
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

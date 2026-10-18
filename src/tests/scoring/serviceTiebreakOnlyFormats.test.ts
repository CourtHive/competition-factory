import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * Tiebreak-only formats derive no server (scoring-engine spec § 10.2, § 10.8, § 11.3; § 16 decision 17,
 * CA 2026-10-18): "A tiebreak-only format (S:TB{n}: squash, table tennis, pickleball and badminton shapes)
 * derives no server until each sport's own rule is added (Mentat TASKS, 'research: each sport's service rule
 * for the scoring engine'). A point records the server only when the caller supplies it, and the
 * server-based statistics (S/R, break points) are not produced." A tennis match tiebreak (-F:TB{n} after
 * standard sets) keeps Rule 5(b). v1 applied tennis's Rule 5(b) rotation, the S/R code and break points to
 * every tiebreak-only set (SET5-S:TB11 squash, SET7-S:TB11 table tennis).
 */

function points(engine: ScoringEngine) {
  return engine.getState().history!.points;
}

describe('§ 10.2 rule 2 a tiebreak-only format derives no server (CA 2026-10-18, decision 17)', () => {
  for (const matchUpFormat of ['SET5-S:TB11', 'SET7-S:TB11', 'SET3-S:TB21', 'SET5-S:TB25-F:TB15', 'SET3A-S:TB11']) {
    it(`${matchUpFormat}: no recorded server, no S/R code, no break point`, () => {
      const engine = new ScoringEngine({ matchUpFormat });
      for (const winner of [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as const) engine.addPoint({ winner });
      for (const point of points(engine)) {
        expect(point.server).toBeUndefined();
        expect(point.code).toBeUndefined();
        expect(point.isBreakpoint).toBe(false);
      }
      expect(engine.isServerDerived()).toBe(false);
    });
  }

  it('SET5-S:TB11: a supplied server is recorded, and coded S or R', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:TB11' });
    engine.addPoint({ winner: 0, server: 1 });
    engine.addPoint({ winner: 0 });
    expect(points(engine).map((point) => [point.server, point.code])).toEqual([
      [1, 'R'],
      [undefined, undefined],
    ]);
  });

  it('SET7-S:TB11: getNextServer is a placeholder, the side a setServer named, and nothing turns on it', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET7-S:TB11' });
    for (let i = 0; i < 10; i++) engine.addPoint({ winner: 0 });
    expect(engine.getNextServer()).toBe(0);
    engine.setServer(1);
    expect(engine.getNextServer()).toBe(1);
    const situation = engine.getScore().situation!;
    expect(situation.serverDerived).toBe(false);
    // side 1 needs one point at 10-0: a game point only for a known server, a break point only for one too
    expect(situation.isGamePoint).toBe(false);
    expect(situation.isBreakPoint).toBe(false);
    expect(situation.isSetPoint).toBe(true);
    engine.addPoint({ winner: 0 });
    expect(points(engine).at(-1)!.server).toBeUndefined();
  });

  it('SET5-S:TB11: no server-based statistics', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET5-S:TB11' });
    for (const winner of [0, 1, 0, 1, 0, 0] as const) engine.addPoint({ winner });
    const { counters } = engine.getStatistics();
    for (const team of [counters.teams[0], counters.teams[1]]) {
      expect(team.pointsServed).toBeUndefined();
      expect(team.breakpointsFaced).toBeUndefined();
    }
  });
});

describe('§ 10.2 rule 1 a tennis match tiebreak keeps Rule 5(b) (CA 2026-10-18, decision 17)', () => {
  it('SET3-S:6/TB7-F:TB10: opened by the side due to serve by the games of the sets before it', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7-F:TB10' });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    // set two: side 1 holds a love game point by point, then side 2 takes six games
    for (let i = 0; i < 4; i++) engine.addPoint({ winner: 0 });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 1 });
    expect(engine.getScore().scoreString).toBe('6-0, 1-6');
    // thirteen games played: side 2 is due to serve and opens the match tiebreak: 1, 0, 0, 1
    for (const winner of [0, 1, 0, 1] as const) engine.addPoint({ winner });
    expect(
      points(engine)
        .slice(4)
        .map((point) => point.server),
    ).toEqual([1, 0, 0, 1]);
    expect(engine.isServerDerived()).toBe(true);
  });
});

import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';

/*
 * Rally scoring and combined totals (scoring-engine spec § 10.4, § 11.2; § 16 decision 15, CA 2026-10-18):
 * "Under @RALLY the rally winner serves next: the server of a point is the winner of the point before it, as
 * under WINNER_SERVES; the first point's server follows the orientation. In a combined total P{n} no server
 * is derived. Whether the server is derived is its own indicator: getNextServer() keeps returning 0 or 1 for
 * API compatibility (epixodic computes 1 - getNextServer()); isServerDerived(), and serverDerived in the score
 * situation, say whether that answer is the engine's derivation or only a placeholder." v1 derived no server
 * under @RALLY and answered a side anyway (SET3-S:TB11@RALLY after two points: 1), with no indicator.
 */

function servers(engine: ScoringEngine) {
  return engine.getState().history!.points.map((point) => point.server);
}

describe('§ 10.4 under @RALLY the rally winner serves next (CA 2026-10-18, decision 15)', () => {
  it('SET3-S:TB11@RALLY: side 1 wins two rallies and serves the third', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11@RALLY' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    expect(engine.getNextServer()).toBe(0);
    expect(engine.isServerDerived()).toBe(true);
    const situation = engine.getScore().situation!;
    expect(situation.server).toBe(0);
    expect(situation.serverDerived).toBe(true);
    expect(servers(engine)).toEqual([0, 0]);
  });

  it('the server follows every rally, across games, and a rebuild derives it again', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB11@RALLY' });
    const winners = [1, 1, 0, ...new Array(11).fill(0), 1, 0] as (0 | 1)[];
    for (const winner of winners) engine.addPoint({ winner });
    // game one goes 11-2 to side 1; its last rally's winner serves game two
    const expected = [0, ...winners.slice(0, -1)];
    expect(servers(engine)).toEqual(expected);
    engine.undo();
    engine.redo();
    expect(servers(engine)).toEqual(expected);
    // the rule's server is calculated (R2): no entry records it
    expect(engine.getState().history!.entries!.some((entry) => entry.data.server !== undefined)).toBe(false);
  });

  it('the first rally follows the orientation; a correction names one server, then the rule resumes', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:TB21@RALLY' });
    engine.setServer(1);
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 0 });
    engine.setServer(1);
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    expect(servers(engine)).toEqual([1, 0, 1, 0]);
    expect(engine.getNextServer()).toBe(1);
  });
});

describe('§ 10.4 a combined total derives no server (CA 2026-10-18, decision 15)', () => {
  it('SET1-S:P32: getNextServer answers a side, and isServerDerived says it is a placeholder', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET1-S:P32' });
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1, server: 1 });
    expect([0, 1]).toContain(engine.getNextServer());
    expect(engine.isServerDerived()).toBe(false);
    expect(engine.getScore().situation!.serverDerived).toBe(false);
    // only a supplied server is recorded
    expect(servers(engine)).toEqual([undefined, 1]);
  });
});

describe('§ 10.7 the competition rule derives the server shown in the situation too', () => {
  it('WINNER_SERVES: getScore().situation.server is getNextServer(), and it is derived', () => {
    const engine = new ScoringEngine({
      matchUpFormat: 'SET3-S:6/TB7',
      competitionFormat: { serverRule: 'WINNER_SERVES' } as any,
    });
    engine.addPoint({ winner: 1 });
    expect(engine.getNextServer()).toBe(1);
    expect(engine.isServerDerived()).toBe(true);
    const situation = engine.getScore().situation!;
    expect(situation.server).toBe(1);
    expect(situation.serverDerived).toBe(true);
  });
});

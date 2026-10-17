import { categorizePoint, enrichPoint } from '@Query/scoring/statistics/pointParser';
import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { enrichPointHistory } from '@Query/scoring/statistics/standalone';
import { describe, expect, it } from 'vitest';

/*
 * What the engine displays, records and reports must agree. Findings S5, S11, S12 and S13 of the
 * 2026-10-17 scoring-engine assessment.
 */

describe('S5: the competition server rule decides the recorded server too', () => {
  const competitionFormat: any = { matchUpFormat: 'SET3-S:6/TB7', serverRule: 'WINNER_SERVES' };

  function servers(engine: ScoringEngine) {
    return engine.getState().history!.points.map((point) => point.server);
  }

  it('the next-server query, the recorded server and the rebuild agree under WINNER_SERVES', () => {
    const engine = new ScoringEngine({ competitionFormat });
    const shown: number[] = [];
    for (const winner of [1, 1, 0, 1] as const) {
      shown.push(engine.getNextServer());
      engine.addPoint({ winner });
    }
    // the first point opens with side 1; then whoever won the last point serves
    expect(shown).toEqual([0, 1, 1, 0]);
    expect(servers(engine)).toEqual(shown);

    engine.addPoint({ winner: 0 });
    engine.undo();
    expect(servers(engine)).toEqual(shown);

    const loaded = new ScoringEngine();
    loaded.setState(engine.getState());
    loaded.loadSupplementaryState(engine.getSupplementaryState());
    loaded.addPoint({ winner: 0 });
    loaded.undo();
    expect(servers(loaded)).toEqual(shown);
  });

  it('a server the caller supplies is recorded as played, and the rule resumes after it', () => {
    const engine = new ScoringEngine({ competitionFormat });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 1, server: 0 }); // the operator records what actually happened
    engine.addPoint({ winner: 0 });
    expect(servers(engine)).toEqual([0, 0, 1]);
  });

  it('a server the rule supplied is calculated, not recorded as an input (R2)', () => {
    const engine = new ScoringEngine({ competitionFormat });
    engine.addPoint({ winner: 1 });
    engine.addPoint({ winner: 0 });
    const entries = engine.getState().history!.entries!.map((entry: any) => entry.data.server);
    expect(entries).toEqual([undefined, undefined]);
  });
});

describe('S11: either winner spelling reports the same completion payloads', () => {
  function completions(addPoint: (engine: ScoringEngine) => void) {
    const events: any[] = [];
    const engine = new ScoringEngine({
      matchUpFormat: 'SET1-S:1/TB7',
      eventHandlers: {
        onGameComplete: ({ gameWinner }) => events.push({ gameWinner }),
        onSetComplete: ({ setWinner }) => events.push({ setWinner }),
        onMatchComplete: ({ matchWinner }: any) => events.push({ matchWinner }),
      },
    });
    for (let i = 0; i < 4; i++) addPoint(engine);
    return events;
  }

  it('winner and winningSide name the same side in every completion event', () => {
    const byWinner = completions((engine) => engine.addPoint({ winner: 1 }));
    const byWinningSide = completions((engine) => engine.addPoint({ winningSide: 2 }));
    expect(byWinner[0]).toEqual({ gameWinner: 1 });
    expect(byWinningSide).toEqual(byWinner);
  });
});

describe('S12: each result counts in exactly its own categories', () => {
  const loserCategories = (result: string) => categorizePoint({ winner: 0, server: 0, result } as any).loser;
  const winnerExtras = (result: string) =>
    categorizePoint({ winner: 0, server: 0, result } as any).winner.filter((c) => c === 'aces' || c === 'winners');

  it.each([
    ['Ace', ['aces', 'winners'], []],
    ['Winner', ['winners'], []],
    ['Serve Winner', ['winners'], []],
    ['Forced Error', [], ['forcedErrors']],
    ['Unforced Error', [], ['unforcedErrors']],
    ['Double Fault', [], ['doubleFaults']],
    ['Penalty', [], []],
    ['Unknown', [], []],
  ])('%s', (result, winner, loser) => {
    expect(winnerExtras(result)).toEqual(winner);
    expect(loserCategories(result)).toEqual(loser);
  });

  it('an engine point with an unforced error counts once, as unforced', () => {
    const engine = new ScoringEngine({ matchUpFormat: 'SET3-S:6/TB7' });
    engine.addPoint({ winner: 0, result: 'Unforced Error' });
    const loser = engine.getStatistics().counters.teams[1];
    // a category exists once something lands in it
    expect([loser.unforcedErrors?.length, loser.forcedErrors?.length ?? 0]).toEqual([1, 0]);
  });
});

describe('S13: standalone enrichment keeps what a point recorded', () => {
  it('a point carrying its own server, set and game keeps them', () => {
    const [point] = enrichPointHistory([{ winner: 1, server: 1, set: 2, game: 3, code: 'A' }]);
    expect([point.winner, point.server, point.set, point.game]).toEqual([1, 1, 2, 3]);
  });

  it('an explicit winner 0 is a winner, not a missing one', () => {
    // with side 2 serving, an ace would be side 2's point: the recorded winner 0 must stand
    const point = enrichPoint({ code: 'A', winner: 0 }, { server: 1, index: 0, set: 0, game: 0 });
    expect(point.winner).toEqual(0);
  });

  it('a point without context still takes the default context', () => {
    const point = enrichPoint({ code: 'A' }, { server: 1, index: 4, set: 1, game: 2 });
    expect([point.winner, point.server, point.index, point.set, point.game]).toEqual([1, 1, 4, 1, 2]);
  });
});

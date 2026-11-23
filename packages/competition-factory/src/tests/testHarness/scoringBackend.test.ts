import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { PARAMS, VIEWS, comparable } from './scoringBackend';
import { expect, it } from 'vitest';

it('routes every view, sending its options as params', () => {
  const prototype = ScoringEngine.prototype as any;
  for (const view of VIEWS) {
    expect({ view, method: typeof prototype[view] }).toEqual({ view, method: 'function' });
    expect({ view, params: PARAMS[view]?.([]) }).toEqual({ view, params: {} });
  }
  expect(PARAMS.getScoreboard([{ perspective: 1 }])).toEqual({ perspective: 1 });
  expect(PARAMS.getStatistics([{ setFilter: 0, includeRallyStats: true }])).toEqual({
    setFilter: 0,
    includeRallyStats: true,
  });
});

it("compares the statistics without the points' own timestamps, and nothing else without anything", () => {
  const point = { index: 0, winner: 0, timestamp: '2026-10-30T12:00:00.000Z' };
  const result = {
    success: true,
    value: {
      returned: {
        counters: { players: { 0: { pointsWon: [point] } }, teams: { 0: { Forehand: [{ point, index: 0 }] } } },
      },
    },
  };
  const compared = comparable('getStatistics', result);
  expect(compared.value.returned.counters.players[0].pointsWon).toEqual([{ index: 0, winner: 0 }]);
  expect(compared.value.returned.counters.teams[0].Forehand).toEqual([{ point: { index: 0, winner: 0 }, index: 0 }]);
  expect(comparable('getEpisodes', result)).toBe(result);
});

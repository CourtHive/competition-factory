import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { PARAMS, VIEWS } from './scoringBackend';
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

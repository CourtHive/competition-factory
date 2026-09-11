import { describe, expect, it } from 'vitest';

import { DELETE_EVENT, MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { fidelityViolations } from './harness';

/**
 * The `tournamentAggregate` coverage rule, falsified.
 *
 * Registering `tournament_discovery` under a kind whose coverage is "the mutation announced
 * something" is a LOOSENING of the oracle, and a loosening has to prove it still catches the thing
 * it exists to catch. The failure that matters is a mutation which moves an aggregate row and
 * announces NOTHING — that is a silent read-model divergence, and it must still be a violation.
 *
 * Without these, the aggregate kind would be indistinguishable from deleting the check.
 *
 * The topics below are the REAL constants. An earlier draft of this file used the string
 * 'deleteEvents', which `noticedEntityKeys` does not recognise, so the notice registered as nothing
 * and the test failed — a fabricated topic looks identical to no notice at all.
 */

const base = (overrides: any = {}) => ({
  tournamentId: 't1',
  tournamentName: 'Aggregate Coverage',
  startDate: '2026-07-01',
  endDate: '2026-07-07',
  events: [{ eventId: 'e1', eventName: 'Singles', gender: 'MALE', category: { categoryType: 'ADULT' } }],
  venues: [],
  participants: [],
  ...overrides,
});

describe('tournamentAggregate coverage still catches a silent change', () => {
  it('VIOLATES when the discovery row moves and no notice fired at all', () => {
    const before = base();
    const after = base({ tournamentTier: { system: 'USTA', value: 'Level 4' } });
    const violations = fidelityViolations(before, after, []);
    const aggregate = violations.filter((v: any) => v.table === 'tournament_discovery');
    expect(aggregate.length).toBeGreaterThan(0);
    expect(aggregate[0].kind).toBe('tournamentAggregate');
  });

  it('does NOT violate when the mutation announced something', () => {
    const before = base();
    const after = base({ tournamentTier: { system: 'USTA', value: 'Level 4' } });
    const violations = fidelityViolations(before, after, [
      { topic: MODIFY_TOURNAMENT_DETAIL, payload: { tournamentId: 't1' } },
    ]);
    expect(violations.filter((v: any) => v.table === 'tournament_discovery')).toEqual([]);
  });

  it('an event-scoped notice covers it — that is the whole point', () => {
    // The six mutations that move this row announce the event or venue, never the tournament.
    const before = base();
    const after = base({ events: [] });
    const violations = fidelityViolations(before, after, [
      { topic: DELETE_EVENT, payload: { eventIds: ['e1'], tournamentId: 't1' } },
    ]);
    expect(violations.filter((v: any) => v.table === 'tournament_discovery')).toEqual([]);
  });
});

import { getQueryMethodFootprint, queryFootprints } from '@Query/footprint/queryFootprints';
import { getMutationFootprint } from '@Query/footprint/getMutationFootprint';
import methodKinds from '@Tests/testHarness/queryPurity/methodKinds.json';
import { getQueryFootprint } from '@Query/footprint/getQueryFootprint';
import { describe, expect, it } from 'vitest';

const query = (method = 'matchUpActions', drawId = 'D1', eventId = 'E1') => ({
  method,
  params: { drawId, eventId, matchUpId: 'M1' },
});

describe('query footprints — same load shape, independent query declarations', () => {
  it.each(Object.keys(queryFootprints))('declares %s only as a known query', (method) => {
    expect(methodKinds[method]).toBe('query');
    expect(getQueryFootprint({ methods: [query(method)] })).toEqual({
      tournament: false,
      shards: ['shell', 'draw', 'eventDraws', 'participants'],
      drawIds: ['D1'],
      eventIds: ['E1'],
      wholeRecordMethods: [],
    });
  });

  it('unions a batch across draws and events without duplicating shards', () => {
    expect(
      getQueryFootprint({ methods: [query(), query('positionActions', 'D2'), query('matchUpActions', 'D3', 'E2')] }),
    ).toEqual({
      tournament: false,
      shards: ['shell', 'draw', 'eventDraws', 'participants'],
      drawIds: ['D1', 'D2', 'D3'],
      eventIds: ['E1', 'E2'],
      wholeRecordMethods: [],
    });
  });

  it.each(['getParticipants', 'setMatchUpStatus', 'constructor', 'toString', '__proto__', 'unknown'])(
    'requires the whole record for unclassified query %s, including mutation names',
    (method) => {
      expect(getQueryFootprint({ methods: [query(), query(method)] })).toMatchObject({
        tournament: true,
        shards: ['tournament'],
        drawIds: [],
        eventIds: [],
        wholeRecordMethods: [method],
      });
    },
  );

  it.each([{ drawId: 'D1' }, { eventId: 'E1' }, { drawId: '', eventId: 'E1' }, { drawId: 'D1', eventId: 1 }])(
    'falls back to the whole record when scope is unresolved: %j',
    (params) => {
      expect(getQueryFootprint({ methods: [{ method: 'matchUpActions', params }] }).tournament).toBe(true);
    },
  );

  it('keeps empty/unclassified mutation plans conservative and does not add queries to mutation declarations', () => {
    expect(getQueryFootprint({ methods: [] }).tournament).toBe(true);
    expect(getQueryFootprint({ methods: undefined as any }).tournament).toBe(true);
    expect(getMutationFootprint({ methods: [query()] }).tournament).toBe(true);
  });

  it('plans per tournament and retains the query draw/event binding for runtime verification', () => {
    const call = { ...query(), params: { ...query().params, tournamentId: 'T2' } };
    expect(getQueryFootprint({ methods: [call], tournamentId: 'T1', activeTournamentId: 'T1' })).toMatchObject({
      tournament: false,
      shards: ['shell'],
      drawIds: [],
      eventIds: [],
    });
    expect(getQueryFootprint({ methods: [call], tournamentId: 'T2', activeTournamentId: 'T1' }).drawIds).toEqual([
      'D1',
    ]);
    expect(getQueryMethodFootprint('positionActions', query().params).drawEventIds).toEqual({ D1: 'E1' });
  });
});

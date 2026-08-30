import { describe, expect, it } from 'vitest';

import { tournamentDiscoveryRow } from '@Query/readModel/readModelRows';
import { cast } from '@Query/readModel/cast';

/**
 * A9, factory slice.
 *
 * The discovery row is the FIRST AGGREGATE in the projection — every other row is 1:1 with a source
 * object, this one summarises a tournament and its events. These tests pin the two things that make
 * it defensible: the aggregates are computed over events, and the money refuses to state a range it
 * cannot honestly compute.
 */

const record: any = {
  tournamentId: 't1',
  tournamentName: 'Discovery Fixture',
  startDate: '2026-07-27',
  endDate: '2026-08-03',
  parentOrganisation: { organisationId: 'prov-1' },
  hostCountryCode: 'USA',
  cancelledAt: null,
  sanction: {
    decision: 'APPROVED',
    recognition: 'UNSANCTIONED',
    classification: { system: 'USTA', value: 'Level 5 Open' },
    confers: { rankingEligible: false },
  },
  registrationProfile: {
    entriesOpen: '2026-05-01',
    entriesClose: '2026-07-01',
    entryFees: [{ amount: 7500, currencyCode: 'USD', unit: 'MINOR' }],
  },
  venues: [
    {
      venueId: 'v1',
      venueName: 'Seattle Tennis Club',
      isPrimary: true,
      addresses: [{ city: 'Seattle', state: 'WA', countryCode: 'USA', latitude: '47.6062', longitude: -122.3321 }],
    },
  ],
  events: [
    {
      eventId: 'e1',
      gender: 'MALE',
      category: { categoryType: 'ADULT', ageCategoryCode: 'O35', ratingType: 'NTRP' },
      registrationProfile: { entryFees: [{ amount: 9500, currencyCode: 'USD', unit: 'MINOR' }] },
    },
    { eventId: 'e2', gender: 'FEMALE', category: { categoryType: 'ADULT', ageCategoryCode: 'O35' } },
    { eventId: 'e3', gender: 'MIXED', category: { categoryType: 'JUNIOR', ageCategoryCode: 'U18' } },
  ],
};

describe('tournamentDiscoveryRow', () => {
  it('flattens the sanction across all three axes', () => {
    const row: any = tournamentDiscoveryRow(record);
    expect(row.level_system).toBe('USTA');
    expect(row.level_value).toBe('Level 5 Open');
    expect(row.recognition).toBe('UNSANCTIONED');
    expect(row.decision).toBe('APPROVED');
    expect(row.ranking_eligible).toBe(false);
  });

  it('falls back to tournamentTier when no sanction classification is stated', () => {
    const noClass: any = {
      ...record,
      sanction: { decision: 'APPROVED' },
      tournamentTier: { system: 'ITF', value: 'J60' },
    };
    const row: any = tournamentDiscoveryRow(noClass);
    expect(row.level_system).toBe('ITF');
    expect(row.level_value).toBe('J60');
  });

  it('coerces coordinates to numbers regardless of how they were stored', () => {
    // CODES types latitude/longitude as `string | number`; both forms are real.
    const row: any = tournamentDiscoveryRow(record);
    expect(row.latitude).toBe(47.6062);
    expect(row.longitude).toBe(-122.3321);
    expect(typeof row.latitude).toBe('number');
  });

  it('aggregates facets over events, sorted and de-duplicated', () => {
    const row: any = tournamentDiscoveryRow(record);
    expect(row.event_count).toBe(3);
    expect(row.category_types).toEqual(['ADULT', 'JUNIOR']);
    expect(row.genders).toEqual(['FEMALE', 'MALE', 'MIXED']);
    expect(row.age_codes).toEqual(['O35', 'U18']);
    expect(row.rating_types).toEqual(['NTRP']);
  });

  it('takes the fee range across tournament AND event fees', () => {
    const row: any = tournamentDiscoveryRow(record);
    expect(row.fee_min).toBe(7500);
    expect(row.fee_max).toBe(9500);
    expect(row.fee_currency).toBe('USD');
    expect(row.fee_unit).toBe('MINOR');
  });

  it('states NO range when a fee cannot be placed on a scale', () => {
    // A partial range is a wrong answer wearing a number.
    const unitless: any = {
      ...record,
      registrationProfile: { entryFees: [{ amount: 7500, currencyCode: 'USD' }] },
      events: [],
    };
    const row: any = tournamentDiscoveryRow(unitless);
    expect(row.fee_min).toBeNull();
    expect(row.fee_max).toBeNull();
    expect(row.fee_currency).toBeNull();
  });

  it('states NO range when fees span denominations', () => {
    const mixed: any = {
      ...record,
      registrationProfile: {
        entryFees: [
          { amount: 75, currencyCode: 'USD', unit: 'MAJOR' },
          { amount: 60, currencyCode: 'EUR', unit: 'MAJOR' },
        ],
      },
      events: [],
    };
    const row: any = tournamentDiscoveryRow(mixed);
    expect(row.fee_min).toBeNull();
  });

  it('emits registration DATES and no derived state', () => {
    // registration_state is a function of NOW and cast() is pure; storing it would bake in a
    // timestamp nothing re-runs. Same call the projection already made for published/embargo.
    const row: any = tournamentDiscoveryRow(record);
    expect(row.entries_open).toBe('2026-05-01');
    expect(row.entries_close).toBe('2026-07-01');
    expect(row).not.toHaveProperty('registration_state');
  });

  it('survives a bare record without throwing', () => {
    const row: any = tournamentDiscoveryRow({ tournamentId: 't' });
    expect(row.tournament_id).toBe('t');
    expect(row.event_count).toBe(0);
    expect(row.category_types).toEqual([]);
    expect(row.latitude).toBeNull();
    expect(row.fee_min).toBeNull();
  });
});

/**
 * `cast()` now emits the row. The deferral in #4741 is lifted.
 *
 * What unblocked it was not wiring but a modelling correction: the conformance oracle attributed
 * every projected row to ONE source object, and an aggregate has none. `tournament_discovery` is
 * registered under the `tournamentAggregate` kind, whose coverage rule matches how the row actually
 * changes — the mutations that move it announce the event or the venue that changed, never the
 * tournament.
 */
describe('cast() emits the discovery row', () => {
  it('produces exactly one row per tournament, alongside every existing table', () => {
    const result: any = cast({ tournamentRecord: record });
    expect(result.success).toBe(true);
    expect(result.rows.tournament_discovery).toHaveLength(1);
    expect(result.rows.tournament_discovery[0].tournament_id).toBe('t1');
    for (const table of ['tournaments', 'events', 'match_ups', 'entries', 'venues']) {
      expect(result.rows[table]).toBeDefined();
    }
  });

  it('the emitted row equals the builder — cast() adds no second derivation', () => {
    const result: any = cast({ tournamentRecord: record });
    expect(result.rows.tournament_discovery[0]).toEqual(tournamentDiscoveryRow(record));
  });
});

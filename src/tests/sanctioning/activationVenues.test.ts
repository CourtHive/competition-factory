import { activateFromSanctioning } from '@Mutate/sanctioning/activateFromSanctioning';
import { expect, it, describe } from 'vitest';

// constants
import { APPROVED } from '@Constants/sanctioningConstants';

/**
 * Venue materialization at activation.
 *
 * `venues: []` was hardcoded while `proposal.venues` was declared and read nowhere, so a sanctioned
 * tournament was born with no venue even when the proposal named one — and the canonical facility a
 * sanctioning record had been attached to never reached the tournamentRecord at all.
 *
 * The factory does not resolve venues: it has no runtime dependencies and no service awareness, so
 * the caller supplies canonical venues (pulled from the facility registry) and the factory
 * materializes them. The proposal's own description is the fallback.
 */

const baseRecord = (venues?: any) =>
  ({
    sanctioningId: 's-1',
    status: APPROVED,
    governingBodyId: 'gb-1',
    proposal: {
      tournamentName: 'Peachtree Summer Open',
      proposedStartDate: '2026-09-01',
      proposedEndDate: '2026-09-05',
      events: [{ eventName: 'Mens Singles', eventType: 'SINGLES' }],
      ...(venues ? { venues } : {}),
    },
    statusHistory: [],
  }) as any;

const CANONICAL = {
  venueId: 'fac-1',
  facilityId: 'fac-1',
  venueName: 'Life Time Peachtree Corners',
  addresses: [{ city: 'Norcross', countryCode: 'USA', latitude: '33.9695', longitude: '-84.2216' }],
  courts: [
    { courtId: 'c1', courtName: 'Court 1', surfaceCategory: 'HARD', indoorOutdoor: 'OUTDOOR', courtOrder: 1 },
    { courtId: 'c2', courtName: 'Court 2', surfaceCategory: 'HARD', indoorOutdoor: 'OUTDOOR', courtOrder: 2 },
  ],
};

describe('activateFromSanctioning venue materialization', () => {
  it('carries a caller-resolved canonical venue onto the tournamentRecord', () => {
    let result: any = activateFromSanctioning({ sanctioningRecord: baseRecord(), venues: [CANONICAL] as any });

    expect(result.success).toEqual(true);
    expect(result.tournamentRecord.venues).toHaveLength(1);
    expect(result.tournamentRecord.venues[0]).toEqual(CANONICAL);
  });

  /**
   * facilityId is the whole point: cast() reads it into query_venues.facility_id, so "which
   * tournaments are at this facility" becomes a SQL join instead of a post-hoc dedupe.
   */
  it('preserves facilityId and typed courts rather than flattening them', () => {
    let result: any = activateFromSanctioning({ sanctioningRecord: baseRecord(), venues: [CANONICAL] as any });
    const venue = result.tournamentRecord.venues[0];

    expect(venue.facilityId).toEqual('fac-1');
    expect(venue.courts).toHaveLength(2);
    expect(venue.courts[0].courtOrder).toEqual(1);
    expect(venue.courts[0].surfaceCategory).toEqual('HARD');
  });

  it('falls back to the proposal venue when the caller resolved none', () => {
    const proposalVenue = {
      venueName: 'Community Park',
      city: 'Cary',
      countryCode: 'USA',
      coordinates: { latitude: 35.79, longitude: -78.78 },
    };
    let result: any = activateFromSanctioning({ sanctioningRecord: baseRecord([proposalVenue]) });

    expect(result.tournamentRecord.venues).toHaveLength(1);
    const venue = result.tournamentRecord.venues[0];
    expect(venue.venueName).toEqual('Community Park');
    expect(venue.addresses[0].city).toEqual('Cary');
    // TODS Address stores coordinates as strings; VenueProposal supplies numbers
    expect(venue.addresses[0].latitude).toEqual('35.79');
  });

  it('gives a fallback venue an identity, defaulting facilityId to its own venueId', () => {
    let result: any = activateFromSanctioning({ sanctioningRecord: baseRecord([{ venueName: 'Community Park' }]) });
    const venue = result.tournamentRecord.venues[0];

    expect(venue.venueId).toBeDefined();
    expect(venue.facilityId).toEqual(venue.venueId);
  });

  it('honours a venueId the proposal already carried', () => {
    let result: any = activateFromSanctioning({
      sanctioningRecord: baseRecord([{ venueName: 'Community Park', venueId: 'v-known' }]),
    });
    expect(result.tournamentRecord.venues[0].venueId).toEqual('v-known');
  });

  /**
   * numberOfCourts is a count, not an inventory. Expanding it into "Court 1..n" would fabricate
   * court identities that later have to be reconciled against the registry's real ones.
   */
  it('does not invent courts from a proposal court count', () => {
    let result: any = activateFromSanctioning({
      sanctioningRecord: baseRecord([{ venueName: 'Community Park', numberOfCourts: 8 }]),
    });
    expect(result.tournamentRecord.venues[0].courts).toEqual([]);
  });

  it('prefers the canonical venue over the proposal description when both exist', () => {
    let result: any = activateFromSanctioning({
      sanctioningRecord: baseRecord([{ venueName: 'Stale Proposal Name' }]),
      venues: [CANONICAL] as any,
    });

    expect(result.tournamentRecord.venues).toHaveLength(1);
    expect(result.tournamentRecord.venues[0].venueName).toEqual('Life Time Peachtree Corners');
  });

  it('still activates with no venue information at all', () => {
    let result: any = activateFromSanctioning({ sanctioningRecord: baseRecord() });

    expect(result.success).toEqual(true);
    expect(result.tournamentRecord.venues).toEqual([]);
  });

  it('carries every venue when several are supplied', () => {
    const second = { ...CANONICAL, venueId: 'fac-2', facilityId: 'fac-2', venueName: 'Second Site' };
    let result: any = activateFromSanctioning({
      sanctioningRecord: baseRecord(),
      venues: [CANONICAL, second] as any,
    });
    expect(result.tournamentRecord.venues.map((v: any) => v.facilityId)).toEqual(['fac-1', 'fac-2']);
  });
});

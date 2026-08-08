import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import { MISSING_VALUE, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';

function setup() {
  mocksEngine.generateTournamentRecord({ setState: true });
  const result: any = tournamentEngine.addVenue({ venue: { venueName: 'Center Courts' } });
  expect(result.success).toEqual(true);
  return { venueId: result.venue.venueId };
}

describe('addVenueOtherId — append', () => {
  it('appends a new (organisationId, otherVenueId) to an empty array', () => {
    const { venueId } = setup();
    const result: any = tournamentEngine.addVenueOtherId({
      venueId,
      organisationId: 'ALTA',
      otherVenueId: '999',
      uniqueOrganisationName: 'Atlanta Lawn Tennis Association',
    });
    expect(result.success).toEqual(true);

    const otherIds = tournamentEngine.findVenue({ venueId }).venue.venueOtherIds;
    expect(otherIds).toHaveLength(1);
    expect(otherIds[0].organisationId).toEqual('ALTA');
    expect(otherIds[0].venueId).toEqual('999');
    expect(otherIds[0].uniqueOrganisationName).toEqual('Atlanta Lawn Tennis Association');
    expect(otherIds[0].createdAt).toBeDefined();
  });

  it('appends a second entry under a different organisationId', () => {
    const { venueId } = setup();
    tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ALTA', otherVenueId: '999' });
    tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ITA', otherVenueId: 'STANFORD' });
    const otherIds = tournamentEngine.findVenue({ venueId }).venue.venueOtherIds;
    expect(otherIds).toHaveLength(2);
    expect(otherIds.map((o: any) => o.organisationId).sort()).toEqual(['ALTA', 'ITA']);
  });
});

describe('addVenueOtherId — upsert by organisationId', () => {
  it('replaces otherVenueId when organisationId already exists', () => {
    const { venueId } = setup();
    tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ALTA', otherVenueId: 'OLD' });
    const result: any = tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ALTA', otherVenueId: 'NEW' });
    expect(result.success).toEqual(true);

    const otherIds = tournamentEngine.findVenue({ venueId }).venue.venueOtherIds;
    expect(otherIds).toHaveLength(1);
    expect(otherIds[0].venueId).toEqual('NEW');
    expect(otherIds[0].updatedAt).toBeDefined();
  });

  it('does not duplicate when the same (organisationId, otherVenueId) is re-applied', () => {
    const { venueId } = setup();
    tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ITA', otherVenueId: 'STANFORD' });
    tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ITA', otherVenueId: 'STANFORD' });
    const otherIds = tournamentEngine.findVenue({ venueId }).venue.venueOtherIds;
    expect(otherIds).toHaveLength(1);
  });
});

describe('addVenueOtherId — error paths', () => {
  it('returns VENUE_NOT_FOUND when venueId is unknown', () => {
    setup();
    const result: any = tournamentEngine.addVenueOtherId({
      venueId: 'no-such-venue',
      organisationId: 'ALTA',
      otherVenueId: '999',
    });
    expect(result.error).toEqual(VENUE_NOT_FOUND);
  });

  it('returns MISSING_VALUE when organisationId is empty', () => {
    const { venueId } = setup();
    const result: any = tournamentEngine.addVenueOtherId({ venueId, organisationId: '', otherVenueId: '999' });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns MISSING_VALUE when otherVenueId is empty', () => {
    const { venueId } = setup();
    const result: any = tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ALTA', otherVenueId: '' });
    expect(result.error).toEqual(MISSING_VALUE);
  });
});

describe('addVenueOtherId — mixed organisations', () => {
  it('preserves existing entries from other organisations', () => {
    const { venueId } = setup();
    tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ALTA', otherVenueId: 'KEEP' });
    tournamentEngine.addVenueOtherId({ venueId, organisationId: 'ITA', otherVenueId: 'NEW' });
    const otherIds = tournamentEngine.findVenue({ venueId }).venue.venueOtherIds;
    expect(otherIds).toHaveLength(2);
    const keep = otherIds.find((o: any) => o.organisationId === 'ALTA');
    expect(keep?.venueId).toEqual('KEEP');
  });
});

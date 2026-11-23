import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

const startDate = '2021-01-01';
const endDate = '2021-01-03';

it('addVenue with isPrimary sets the venue as primary', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venue = { venueName: 'Primary Venue', isPrimary: true };
  const result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  expect(result.success).toEqual(true);

  const { venue: found } = tournamentEngine.findVenue({ venueId: result.venue.venueId });
  expect(found.isPrimary).toEqual(true);
});

it('only one primary — addVenue auto-clears previous primary', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venueA = { venueName: 'Venue A', isPrimary: true };
  const resultA = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueA });
  expect(resultA.success).toEqual(true);

  const venueB = { venueName: 'Venue B', isPrimary: true };
  const resultB = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueB });
  expect(resultB.success).toEqual(true);

  const { venue: foundA } = tournamentEngine.findVenue({ venueId: resultA.venue.venueId });
  const { venue: foundB } = tournamentEngine.findVenue({ venueId: resultB.venue.venueId });
  expect(foundA.isPrimary).toBeUndefined();
  expect(foundB.isPrimary).toEqual(true);
});

it('addVenue without isPrimary preserves existing primary', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venueA = { venueName: 'Venue A', isPrimary: true };
  const resultA = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueA });

  const venueB = { venueName: 'Venue B' };
  tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueB });

  const { venue: foundA } = tournamentEngine.findVenue({ venueId: resultA.venue.venueId });
  expect(foundA.isPrimary).toEqual(true);
});

it('modifyVenue sets isPrimary', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venue = { venueName: 'My Venue' };
  const result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const { venueId } = result.venue;

  const modResult = tournamentEngine.modifyVenue({
    venueId,
    modifications: { isPrimary: true },
  });
  expect(modResult.success).toEqual(true);

  const { venue: found } = tournamentEngine.findVenue({ venueId });
  expect(found.isPrimary).toEqual(true);
});

it('modifyVenue auto-clears old primary', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venueA = { venueName: 'Venue A', isPrimary: true };
  const resultA = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueA });

  const venueB = { venueName: 'Venue B' };
  const resultB = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueB });

  tournamentEngine.modifyVenue({
    venueId: resultB.venue.venueId,
    modifications: { isPrimary: true },
  });

  const { venue: foundA } = tournamentEngine.findVenue({ venueId: resultA.venue.venueId });
  const { venue: foundB } = tournamentEngine.findVenue({ venueId: resultB.venue.venueId });
  expect(foundA.isPrimary).toBeUndefined();
  expect(foundB.isPrimary).toEqual(true);
});

it('modifyVenue clears isPrimary — property is deleted not set to false', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venue = { venueName: 'My Venue', isPrimary: true };
  const result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });
  const { venueId } = result.venue;

  tournamentEngine.modifyVenue({
    venueId,
    modifications: { isPrimary: false },
  });

  const { venue: found } = tournamentEngine.findVenue({ venueId });
  expect(found.isPrimary).toBeUndefined();
  expect('isPrimary' in found).toEqual(false);
});

it('deleteVenue of primary does not auto-promote', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venueA = { venueName: 'Venue A', isPrimary: true };
  const resultA = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueA });

  const venueB = { venueName: 'Venue B' };
  const resultB = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: venueB });

  tournamentEngine.deleteVenue({ venueId: resultA.venue.venueId });

  const { venue: foundB } = tournamentEngine.findVenue({ venueId: resultB.venue.venueId });
  expect(foundB.isPrimary).toBeUndefined();
});

it('getTournamentInfo returns tournamentAddress from primary venue', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const address = {
    addressLine1: '123 Tennis Lane',
    city: 'Courtville',
    state: 'CA',
    postalCode: '90210',
  };
  const venue = {
    venueName: 'Primary Venue',
    isPrimary: true,
    addresses: [address],
  };
  tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });

  const { tournamentInfo } = tournamentEngine.getTournamentInfo();
  expect(tournamentInfo.tournamentAddress).toBeDefined();
  expect(tournamentInfo.tournamentAddress.addressLine1).toEqual('123 Tennis Lane');
  expect(tournamentInfo.tournamentAddress.city).toEqual('Courtville');
});

it('getTournamentInfo with no primary returns no tournamentAddress', () => {
  tournamentEngine.newTournamentRecord({ startDate, endDate });

  const venue = { venueName: 'Regular Venue', addresses: [{ city: 'Somewhere' }] };
  tournamentEngine.devContext({ addVenue: true }).addVenue({ venue });

  const { tournamentInfo } = tournamentEngine.getTournamentInfo();
  expect(tournamentInfo.tournamentAddress).toBeUndefined();
});

test('generateVenues respects isPrimary', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [
      { courtsCount: 2, venueName: 'Secondary Venue' },
      { courtsCount: 2, venueName: 'Primary Venue', isPrimary: true },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  const venues = tournamentRecord.venues ?? [];
  const primaryVenues = venues.filter((v) => v.isPrimary);
  expect(primaryVenues.length).toEqual(1);
  expect(primaryVenues[0].venueName).toEqual('Primary Venue');
});

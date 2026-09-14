import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import {
  COURT_NOT_FOUND,
  MISSING_COURT_ID,
  MISSING_VENUE_ID,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it('can return venue information', () => {
  const courtsCount = 8;
  const venueProfiles = [
    {
      courtsCount,
      startTime: '07:00',
      endTime: '20:00',
    },
  ];

  const {
    tournamentRecord,
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    venueProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { venueData } = tournamentEngine.getVenueData({ venueId });
  const { courtsInfo } = venueData;
  expect(courtsInfo.length).toEqual(courtsCount);

  let result = tournamentEngine.getVenueData();
  expect(result.error).toEqual(MISSING_VENUE_ID);

  result = tournamentEngine.getVenueData({ venueId: 'bogusId' });
  expect(result.error).toEqual(VENUE_NOT_FOUND);

  result = tournamentEngine.getCourtInfo();
  expect(result.error).toEqual(MISSING_COURT_ID);

  result = tournamentEngine.getCourtInfo({ courtId: 'bogusId ' });
  expect(result.error).toEqual(COURT_NOT_FOUND);
});

it('can create venues with no courts', () => {
  const courtsCount = 0;
  const venueProfiles = [
    {
      courtsCount,
      startTime: '07:00',
      endTime: '20:00',
    },
  ];

  const {
    tournamentRecord,
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    venueProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const { venueData } = tournamentEngine.getVenueData({ venueId });
  const { courtsInfo } = venueData;
  expect(courtsInfo.length).toEqual(courtsCount);
});

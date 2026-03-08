import { findVenue, publicFindVenue } from '@Query/venues/findVenue';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { LINKED_TOURNAMENTS } from '@Constants/extensionConstants';
import {
  MISSING_COURTS_INFO,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VENUE_ID,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

it('can define a new venue', () => {
  let result = tournamentEngine.newTournamentRecord();
  expect(result.success).toEqual(true);

  const myCourts = { venueName: 'My Courts' };
  result = tournamentEngine.addVenue({
    context: { addedBy: 'TOURNAMENT_DESK_USER' },
    venue: myCourts,
  });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const initialCourtName = 'Grand Stand';
  const firstCourt = { courtName: initialCourtName };
  result = tournamentEngine.addCourt({ venueId, court: firstCourt });
  expect(result.court.courtName).toEqual(initialCourtName);

  const dateAvailability = [
    {
      date: '2020-01-01T00:00',
      startTime: '07:00',
      endTime: '19:00',
      bookings: [
        { startTime: '07:00', endTime: '08:30', bookingType: 'PRACTICE' },
        { startTime: '08:30', endTime: '09:00', bookingType: 'MAINTENANCE' },
        { startTime: '13:30', endTime: '14:00', bookingType: 'MAINTENANCE' },
      ],
    },
  ];

  result = tournamentEngine.addCourts({
    dateAvailability,
    courtsCount: 3,
  });
  expect(result.error).toEqual(MISSING_VENUE_ID);

  result = tournamentEngine.addCourts({
    venueId,
  });
  expect(result.error).toEqual(MISSING_COURTS_INFO);

  result = tournamentEngine.addCourts({
    dateAvailability,
    courtsCount: 3,
    venueId,
  });
  expect(result.courtIds.length).toEqual(3);

  const { courts } = tournamentEngine.getCourts();
  expect(courts.length).toEqual(4);

  const { courtId } = courts[0];
  const courtName = 'Center Court';
  let modifications: any = { courtName };
  tournamentEngine.modifyCourt({ courtId, modifications });

  let venue = tournamentEngine.findVenue({ venueId }).venue;
  expect(venue.extensions[0].value.addedBy).not.toBeUndefined();
  expect(venue.courts.length).toEqual(4);
  expect(venue.courts[0].courtName).toEqual(courtName);
  expect(venue.courts[0].dateAvailability).toEqual([]);
  expect(venue.courts[1].dateAvailability[0].date).toEqual(dateAvailability[0].date.split('T')[0]);

  const { tournamentRecord } = tournamentEngine.getTournament();
  expect(tournamentRecord.venues.length).toEqual(1);

  const venueName = 'Grassy Greens';
  modifications = { venueName };
  result = tournamentEngine.modifyVenue({ venueId, modifications });
  expect(result.success).toEqual(true);

  venue = tournamentEngine.findVenue({ venueId }).venue;
  expect(venue.venueName).toEqual(venueName);
});

it('findVenue returns error when tournamentRecord is missing', () => {
  const result = findVenue({ venueId: 'anyId' } as any);
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);
});

it('findVenue returns error when venueId is missing', () => {
  const tournamentRecord = { tournamentId: 't1', venues: [] } as any;
  const result = findVenue({ tournamentRecord, venueId: '' });
  expect(result.error).toEqual(MISSING_VENUE_ID);
});

it('findVenue returns VENUE_NOT_FOUND when venue does not exist', () => {
  const tournamentRecord = { tournamentId: 't1', venues: [] } as any;
  const result = findVenue({ tournamentRecord, venueId: 'nonexistent' });
  expect(result.error).toEqual(VENUE_NOT_FOUND);
});

it('findVenue handles tournamentRecord with no venues array', () => {
  const tournamentRecord = { tournamentId: 't1' } as any;
  const result = findVenue({ tournamentRecord, venueId: 'nonexistent' });
  expect(result.error).toEqual(VENUE_NOT_FOUND);
});

it('findVenue finds venue in linked tournament records and adds it to the original record', () => {
  const venueId = 'shared-venue-id';
  const venue = { venueId, venueName: 'Linked Venue', courts: [] };

  const record1: any = {
    tournamentId: 't1',
    venues: [],
    extensions: [
      {
        name: LINKED_TOURNAMENTS,
        value: { tournamentIds: ['t1', 't2'] },
      },
    ],
  };
  const record2: any = {
    tournamentId: 't2',
    venues: [venue],
    extensions: [
      {
        name: LINKED_TOURNAMENTS,
        value: { tournamentIds: ['t1', 't2'] },
      },
    ],
  };

  const tournamentRecords = { t1: record1, t2: record2 };

  const result = findVenue({ tournamentRecords, tournamentRecord: record1, venueId });
  // The linked tournament path returns success when venue is found in a linked record
  expect(result.success).toEqual(true);
  // The venue is added to the original tournament record as a side effect
  expect(record1.venues.length).toEqual(1);
});

it('findVenue returns VENUE_NOT_FOUND when venue not in any linked tournament', () => {
  const record1: any = {
    tournamentId: 't1',
    venues: [],
    extensions: [
      {
        name: LINKED_TOURNAMENTS,
        value: { tournamentIds: ['t1', 't2'] },
      },
    ],
  };
  const record2: any = {
    tournamentId: 't2',
    venues: [],
    extensions: [
      {
        name: LINKED_TOURNAMENTS,
        value: { tournamentIds: ['t1', 't2'] },
      },
    ],
  };

  const tournamentRecords = { t1: record1, t2: record2 };

  const result = findVenue({ tournamentRecords, tournamentRecord: record1, venueId: 'nonexistent' });
  expect(result.error).toEqual(VENUE_NOT_FOUND);
});

it('publicFindVenue returns deep copy of result', () => {
  tournamentEngine.newTournamentRecord();

  const venue = { venueName: 'Test Venue' };
  const addResult = tournamentEngine.addVenue({ venue });
  const { venueId } = addResult.venue;

  const { tournamentRecord } = tournamentEngine.getTournament();
  const result = publicFindVenue({ convertExtensions: false, tournamentRecord, venueId });
  expect(result.success).toEqual(true);
  expect(result.venue).toBeDefined();
  expect(result.venue.venueName).toEqual('Test Venue');

  // verify it's a deep copy: mutating the returned venue should not affect the original
  result.venue.venueName = 'Mutated';
  const result2 = publicFindVenue({ convertExtensions: false, tournamentRecord, venueId });
  expect(result2.venue.venueName).toEqual('Test Venue');
});

it('publicFindVenue with convertExtensions parameter', () => {
  tournamentEngine.newTournamentRecord();

  const venue = { venueName: 'Extension Venue' };
  const addResult = tournamentEngine.addVenue({
    context: { addedBy: 'TEST_USER' },
    venue,
  });
  const { venueId } = addResult.venue;

  const { tournamentRecord } = tournamentEngine.getTournament();
  const result = publicFindVenue({ convertExtensions: true, tournamentRecord, venueId });
  expect(result.success).toEqual(true);
  expect(result.venue).toBeDefined();
});

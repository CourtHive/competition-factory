import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { INVALID_OBJECT, VENUE_EXISTS, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';

test('competitionEngine can modify venues', () => {
  const startDate = '2020-01-01';
  const { tournamentRecord: firstTournament } = mocksEngine.generateTournamentRecord({ startDate });
  const { tournamentRecord: secondTournament } = mocksEngine.generateTournamentRecord({ startDate });
  const { tournamentRecord: thirdTournament } = mocksEngine.generateTournamentRecord({ startDate });

  competitionEngine.setState([firstTournament, secondTournament, thirdTournament]);

  const myCourts = { venueName: 'My Courts', venueId: 'venueId' };
  let result = competitionEngine.addVenue({ venue: myCourts });
  expect(result.success).toEqual(true);
  result = competitionEngine.addVenue({ venue: myCourts });
  expect(result.error).toEqual(VENUE_EXISTS);

  const { tournamentRecords } = competitionEngine.getState();
  const tournamentsArray: any[] = Object.values(tournamentRecords);

  const venueId = tournamentsArray[0].venues[0].venueId;
  expect(tournamentsArray[1].venues[0].venueId).toEqual(venueId);
  expect(tournamentsArray[2].venues[0].venueId).toEqual(venueId);

  const dateAvailability = [
    {
      date: startDate,
      startTime: '07:00',
      endTime: '19:00',
      bookings: [
        { startTime: '07:00', endTime: '08:30', bookingType: 'PRACTICE' },
        { startTime: '08:30', endTime: '09:00', bookingType: 'MAINTENANCE' },
        { startTime: '13:30', endTime: '14:00', bookingType: 'MAINTENANCE' },
      ],
    },
  ];

  result = competitionEngine.addCourts({
    dateAvailability,
    courtsCount: 3,
    venueId,
  });
  expect(result.success).toEqual(true);

  const venueAbbreviation = 'GHC';
  const modifications = {
    venueAbbreviation,
    courts: [
      {
        courtId: 'b9df6177-e430-4a70-ba47-9b9ff60258cb',
        courtName: 'Custom Court 1',
        dateAvailability: [
          {
            startTime: '16:30',
            endTime: '17:30',
          },
          {
            date: '2021-01-01',
            startTime: '16:30',
            endTime: '17:30',
          },
          {
            date: '2021-01-02',
            startTime: '16:30',
            endTime: '17:30',
          },
        ],
      },
      {
        courtId: '886068ac-c176-4cd6-be96-768fa895d0c1',
        courtName: 'Custom Court 2',
        dateAvailability: [
          {
            date: '2021-01-01',
            startTime: '16:30',
            endTime: '17:30',
          },
          {
            date: '2021-01-02',
            startTime: '16:30',
            endTime: '17:30',
          },
        ],
      },
    ],
  };
  result = competitionEngine.modifyVenue({ venueId, modifications });
  expect(result.success).toEqual(true);

  result = competitionEngine.getVenuesAndCourts();
  expect(result.courts.length).toEqual(2);
  expect(result.venues.length).toEqual(1);

  result = competitionEngine.deleteVenue({ venueId });
  expect(result.success).toEqual(true);

  result = competitionEngine.getVenuesAndCourts();
  expect(result.venues.length).toEqual(0);
  expect(result.courts.length).toEqual(0);

  result = competitionEngine.modifyVenue({ venueId });
  expect(result.error).toEqual(INVALID_OBJECT);

  result = competitionEngine.modifyVenue({ venueId: 'bogusId', modifications });
  expect(result.error).toEqual(VENUE_NOT_FOUND);
});

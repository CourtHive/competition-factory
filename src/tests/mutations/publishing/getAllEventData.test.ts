import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

it('can return all event data', () => {
  const drawProfiles = [{ drawSize: 32 }, { drawSize: 16, drawType: ROUND_ROBIN }];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: '2021-01-01',
    endDate: '2021-01-01',
    drawProfiles,
  });

  const myCourts = { venueName: 'My Courts' };
  let result = tournamentEngine.setState(tournamentRecord).devContext({ addVenue: true }).addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const date = '2020-01-01T00:00';
  const dateAvailability = [
    {
      date,
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
    venueId,
  });

  expect(result.success).toEqual(true);
  expect(result.courtIds.length).toEqual(3);

  result = tournamentEngine.getAllEventData();
  const { tournamentInfo, eventsData, venuesData } = result.allEventData;

  expect(tournamentInfo).not.toBeUndefined();
  expect(eventsData).not.toBeUndefined();
  expect(venuesData).not.toBeUndefined();
});

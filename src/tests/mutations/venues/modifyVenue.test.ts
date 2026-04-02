import { modifyVenue } from '@Mutate/venues/modifyVenue';
import { deleteVenue } from '@Mutate/venues/deleteVenue';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import {
  COURT_NOT_FOUND,
  INVALID_DATE_AVAILABILITY,
  INVALID_TIME,
  MISSING_COURT_ID,
  MISSING_DATE_AVAILABILITY,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VENUE_ID,
} from '@Constants/errorConditionConstants';

const court1 = {
  courtId: 'b9df6177-e430-4a70-ba47-9b9ff60258cb',
  courtName: 'Custom Court 1',
};
const court2 = {
  courtId: '886068ac-c176-4cd6-be96-768fa895d0c1',
  courtName: 'Custom Court 2',
};

const startDate = '2021-01-01';
const midDate = '2021-01-02';
const endDate = '2021-01-03';

it('can define and modify a venue', () => {
  let result = tournamentEngine.newTournamentRecord({
    startDate,
    endDate,
  });
  expect(result.success).toEqual(true);

  const myCourts = { venueName: 'My Courts' };
  result = tournamentEngine.devContext({ addVenue: true }).addVenue({ venue: myCourts });
  const {
    venue: { venueId },
  } = result;
  expect(result.success).toEqual(true);

  const venueName = 'New venue name';
  const venueAbbreviation = 'NVN';
  let modifications: any = {
    venueName,
    venueAbbreviation,
    courts: [
      {
        ...court1,
        dateAvailability: [
          {
            startTime: '04:30 pm',
            endTime: '05:30 pm',
          },
          {
            date: '01/01/2021',
            startTime: '04:30 pm',
            endTime: '05:30 pm',
          },
          {
            date: '02/01/2021',
            startTime: '04:30 pm',
            endTime: '04:30 pm',
          },
        ],
      },
    ],
  };

  result = tournamentEngine.modifyVenue({ venueId, modifications });
  expect(result.error).toEqual(INVALID_TIME);

  modifications = {
    venueName,
    venueAbbreviation,
    courts: [
      {
        ...court1,
        dateAvailability: [
          {
            startTime: '16:30',
            endTime: '17:30',
            date: startDate,
          },
          {
            startTime: '16:30',
            endTime: '17:30',
            date: midDate,
          },
        ],
      },
      {
        ...court2,
        dateAvailability: [
          {
            date: startDate,
            startTime: '16:30',
            endTime: '17:30',
          },
          {
            date: midDate,
            startTime: '16:30',
            endTime: '17:30',
          },
        ],
      },
    ],
  };
  tournamentEngine.modifyVenue({ venueId, modifications });
  let { venue } = tournamentEngine.findVenue({ venueId });
  expect(venue.venueName).toEqual(venueName);
  expect(venue.venueAbbreviation).toEqual(venueAbbreviation);
  expect(venue.courts.length).toEqual(2);

  modifications = {
    courts: [
      {
        ...court1,
        dateAvailability: [
          {
            startTime: '16:30',
            endTime: '17:30',
            date: startDate,
          },
          {
            startTime: '16:30',
            endTime: '17:30',
            date: midDate,
          },
        ],
      },
    ],
  };

  tournamentEngine.modifyVenue({
    modifications,
    venueId,
  });
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  expect(venue.courts.length).toEqual(1);
  expect(venue.courts[0].dateAvailability.length).toEqual(2);

  modifications = {
    courts: [
      {
        ...court1,
        dateAvailability: [
          {
            startTime: '16:30',
            endTime: '17:30',
            date: startDate,
          },
          {
            startTime: '16:30',
            endTime: '17:30',
            date: midDate,
          },
          {
            startTime: '16:30',
            endTime: '17:30',
            date: endDate,
          },
        ],
      },
    ],
  };

  tournamentEngine.modifyVenue({
    venueId,
    modifications,
  });
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  expect(venue.courts.length).toEqual(1);
  expect(venue.courts[0].dateAvailability.length).toEqual(3);

  modifications = {
    courts: [
      {
        ...court1,
        dateAvailability: [
          {
            startTime: '08:30',
            endTime: '12:30',
            date: startDate,
          },
          {
            startTime: '13:30',
            endTime: '15:30',
            date: startDate,
          },
          {
            startTime: '16:30',
            endTime: '18:30',
            date: startDate,
          },
        ],
      },
    ],
  };

  tournamentEngine.modifyVenue({
    modifications,
    venueId,
  });
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  expect(venue.courts.length).toEqual(1);
  expect(venue.courts[0].dateAvailability.length).toEqual(3);

  tournamentEngine.modifyVenue({
    modifications,
    force: true,
    venueId,
  });
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  expect(venue.courts.length).toEqual(1);

  const courtId = 'b9df6177-e430-4a70-ba47-9b9ff60258cb';
  modifications = {
    venueName,
    venueAbbreviation,
    courts: [
      {
        courtId,
        courtName: 'Custom Court 1',
        dateAvailability: [
          {
            startTime: '16:30',
            endTime: '17:30',
            date: startDate,
          },
          {
            startTime: '16:30',
            endTime: '17:30',
            date: midDate,
          },
        ],
      },
      {
        ...court2,
        dateAvailability: [
          {
            startTime: '16:30',
            endTime: '17:30',
            date: startDate,
          },
          {
            startTime: '16:30',
            endTime: '17:30',
            date: midDate,
          },
        ],
      },
    ],
  };
  tournamentEngine.modifyVenue({ venueId, modifications });
  ({ venue } = tournamentEngine.findVenue({ venueId }));
  expect(venue.venueName).toEqual(venueName);
  expect(venue.venueAbbreviation).toEqual(venueAbbreviation);
  expect(venue.courts.length).toEqual(2);

  result = tournamentEngine.modifyCourtAvailability();
  expect(result.error).toEqual(MISSING_COURT_ID);
  result = tournamentEngine.modifyCourtAvailability({ courtId: 'someId' });
  expect(result.error).toEqual(MISSING_DATE_AVAILABILITY);
  result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [],
    courtId: 'someId',
  });
  expect(result.error).toEqual(COURT_NOT_FOUND);
  result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ foo: 'foo' }],
    courtId,
  });
  expect(result.error).toEqual(INVALID_DATE_AVAILABILITY);

  result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ startTime: '08:00', endTime: '20:00' }],
    courtId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ startTime: '07:00' }],
    courtId,
  });
  expect(result.error).toEqual(INVALID_DATE_AVAILABILITY);

  const { startDate: sd, endDate: ed } = tournamentEngine.getTournamentInfo().tournamentInfo;
  expect(startDate).toEqual(sd);
  expect(endDate).toEqual(ed);

  // dateAvailability does not have to be within tournament dates
  result = tournamentEngine.modifyCourtAvailability({
    dateAvailability: [{ date: '2022-02-02', startTime: '08:00', endTime: '20:00' }],
    courtId,
  });
  expect(result.success).toEqual(true);
});

test('miscellaneous items for coverage', () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let result: any = deleteVenue({});
  expect(result.error).toEqual(MISSING_VENUE_ID);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  result = deleteVenue({});
  expect(result.error).toEqual(MISSING_VENUE_ID);
  result = deleteVenue({
    tournamentRecords: {},
    venueId: '12345',
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  result = modifyVenue({});
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORDS);
});

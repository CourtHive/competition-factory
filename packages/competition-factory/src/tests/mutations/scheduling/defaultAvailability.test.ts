import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { extractDate } from '@Tools/dateTime';
import { expect, test } from 'vitest';
import { UUID } from '@Tools/UUID';

test('court availability overrides default availability', () => {
  const venueId = UUID();
  const venue = {
    venueName: 'Annapolis High School',
    venueAbbreviation: 'AHS',
    venueId,
    addresses: [
      {
        state: 'MD',
        latitude: '38.9732152',
        longitude: '-76.5619863',
        postalCode: '21401',
        addressLine1: '2700 RIVA RD',
        addressLine2: '',
        timeZone: 'America/New_York',
        city: 'ANNAPOLIS',
      },
    ],
    courts: [
      {
        courtId: '04eaf1bd-cedf-4210-b22b-11dfefab22ca',
        courtName: 'Court 1',
        dateAvailability: [
          {
            startTime: '18:00',
            endTime: '22:00',
          },
          {
            date: '2022-09-24T00:00:00.000Z',
            startTime: '08:00',
            endTime: '18:00',
          },
          {
            date: '2022-09-25T00:00:00.000Z',
            startTime: '08:00',
            endTime: '18:00',
          },
          {
            date: '2022-09-26T00:00:00.000Z',
            startTime: '18:00',
            endTime: '22:00',
          },
          {
            date: '2022-09-27T00:00:00.000Z',
            startTime: '18:00',
            endTime: '22:00',
          },
          {
            date: '2022-09-28T00:00:00.000Z',
            startTime: '18:00',
            endTime: '22:00',
          },
        ],
        onlineResources: [],
      },
    ],
  };
  const startDate = '2022-09-24T00:00:00.000Z';
  const endDate = '2022-09-28T00:00:00.000Z';

  const drawSize = 2;
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize }],
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  let result = tournamentEngine.addVenue({ venue });
  expect(result.success).toEqual(true);

  const { rounds } = tournamentEngine.getRounds();
  const schedulingProfile = [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }];

  result = tournamentEngine.setSchedulingProfile({ schedulingProfile });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getSchedulingProfileIssues();
  expect(result.issuesCount).toEqual(0);

  result = tournamentEngine.getMatchUpDependencies();
  expect(Object.keys(result.matchUpDependencies).length).toEqual(drawSize - 1);

  result = tournamentEngine.scheduleProfileRounds();
  expect(result.scheduledMatchUpIds[extractDate(startDate)].length).toEqual(1);
  expect(result.noTimeMatchUpIds[extractDate(startDate)].length).toEqual(0);
});

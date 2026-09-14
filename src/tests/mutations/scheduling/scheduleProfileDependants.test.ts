import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

it('will not schedule Round 1 after Round 2 if Round 2 was manually scheduled at the start of the day', () => {
  const venueId = 'venue1';
  const venueProfiles = [
    {
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 3,
      venueId,
    },
  ];

  const eventProfiles = [
    {
      drawProfiles: [
        {
          drawSize: 8,
          idPrefix: 'c',
        },
      ],
    },
  ];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  competitionEngine.setState(tournamentRecord);

  const { matchUps } = competitionEngine.allCompetitionMatchUps({
    matchUpFilters: { roundNumbers: [2] },
  });

  const matchUpContextIds = matchUps.map(({ drawId, eventId, matchUpId, structureId, tournamentId }) => ({
    tournamentId,
    structureId,
    matchUpId,
    eventId,
    drawId,
  }));

  let result = competitionEngine.bulkScheduleMatchUps({
    matchUpContextIds,
    schedule: {
      scheduledTime: '08:00',
      scheduledDate: startDate,
      venueId,
    },
  });
  expect(result.success).toEqual(true);

  result = competitionEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId,
    round: {
      ...matchUpContextIds[0],
      roundNumber: 1,
    },
  });
  expect(result.success).toEqual(true);

  // #################################################
  result = competitionEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(0);
});

it('will schedule Round 1 after Round 2 if Round 2 was manually scheduled later in the day', () => {
  const venueId = 'venue1';
  const venueProfiles = [
    {
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 3,
      venueId,
    },
  ];

  const eventProfiles = [
    {
      drawProfiles: [
        {
          drawSize: 8,
          idPrefix: 'c',
        },
      ],
    },
  ];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  competitionEngine.setState(tournamentRecord);

  const { matchUps } = competitionEngine.allCompetitionMatchUps({
    matchUpFilters: { roundNumbers: [2] },
  });

  const matchUpContextIds = matchUps.map(({ drawId, eventId, matchUpId, structureId, tournamentId }) => ({
    tournamentId,
    structureId,
    matchUpId,
    eventId,
    drawId,
  }));

  let result = competitionEngine.bulkScheduleMatchUps({
    matchUpContextIds,
    schedule: {
      scheduledTime: '14:00',
      scheduledDate: startDate,
      venueId,
    },
  });
  expect(result.success).toEqual(true);

  result = competitionEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId,
    round: {
      ...matchUpContextIds[0],
      roundNumber: 1,
    },
  });
  expect(result.success).toEqual(true);

  // #################################################
  result = competitionEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(4);
});

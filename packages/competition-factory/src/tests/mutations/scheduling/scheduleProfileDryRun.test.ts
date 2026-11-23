import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';

it('can simulate clearing schedule on dryRun scheduleProfileRounds', () => {
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
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  competitionEngine.setState(tournamentRecord);

  const { upcomingMatchUps } = competitionEngine.getCompetitionMatchUps({
    matchUpFilters: { roundNumbers: [1] },
  });

  const matchUpContextIds = upcomingMatchUps.map(({ drawId, eventId, matchUpId, structureId, tournamentId }) => ({
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

  result = competitionEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId,
    round: {
      ...matchUpContextIds[0],
      roundNumber: 2,
    },
  });
  expect(result.success).toEqual(true);

  // #################################################
  result = competitionEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
    dryRun: true,
  });
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(2);

  // running it again has the same outcome
  result = competitionEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
    dryRun: true,
  });
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(2);

  result = competitionEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
    clearScheduleDates: true,
    dryRun: true,
  });
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(6);

  // when not a dry run all matchUps are cleared then scheduled
  result = competitionEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
    clearScheduleDates: true,
  });
  expect(result.scheduledMatchUpIds[startDate].length).toEqual(6);
});

import { getMatchUpIds } from '@Functions/global/extractors';
import { stringSort } from '@Functions/sorters/stringSort';
import competitionEngineSync from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { instanceCount } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

test.each([competitionEngineSync])(
  'correctly allocates recovery times for Round Robin structures',
  async (competitionEngine) => {
    const drawProfiles = [{ drawSize: 8, drawType: ROUND_ROBIN }];
    const venueProfiles = [{ courtsCount: 2 }];

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles,
      venueProfiles,
    });

    competitionEngine.setState([tournamentRecord]);
    const { upcomingMatchUps } = competitionEngine.getCompetitionMatchUps();
    const { startDate } = competitionEngine.getCompetitionDateRange();

    const matchUpIds = getMatchUpIds(upcomingMatchUps);
    expect(instanceCount(upcomingMatchUps.map(({ matchUpType }) => matchUpType))).toEqual({ SINGLES: 12 });

    const result = competitionEngine.scheduleMatchUps({
      scheduleDate: startDate,
      recoveryMinutes: 30,
      matchUpIds,
    });
    Object.values(result.individualParticipantProfiles).forEach((participantProfile: any) => {
      expect(participantProfile.counters).toEqual({ SINGLES: 3, total: 3 });
    });
    const afterRecoveryTimes = Object.values(result.individualParticipantProfiles).map(
      (profile: any) => profile.timeAfterRecovery,
    );

    /*
    // prettier-ignore
    expect(afterRecoveryTimes.sort()).toEqual([
      '14:00', '14:00',
      '15:00', '15:00',
      '18:30', '18:30',
      '19:30', '19:30'
    ]);
    */

    // prettier-ignore
    expect(afterRecoveryTimes.sort()).toEqual([
      '15:00', '15:00',
      '15:30', '15:30',
      '16:30', '16:30',
      '17:00', '17:00',
    ]);

    /*
    // prettier-ignore
    expect(Object.values(result.matchUpNotBeforeTimes).sort()).toEqual( [
      '09:00', '09:00',
      '12:00', '12:00',
      '12:30', '12:30',
      '16:30', '16:30'
    ]);
    */

    // prettier-ignore
    expect(Object.values(result.matchUpNotBeforeTimes).sort()).toEqual([
      '09:00', '09:00',
      '11:00', '11:00',
      '12:30', '12:30',
      '14:00', '14:00',
    ]);
    expect(result.scheduledMatchUpIds.length).toEqual(12);
    expect(result.success).toEqual(true);
  },
);

test.each([competitionEngineSync])('respects matchUpDailylimits', async (competitionEngine) => {
  const drawProfiles = [{ drawSize: 8, drawType: ROUND_ROBIN }];
  const venueProfiles = [{ courtsCount: 2 }];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    venueProfiles,
  });

  competitionEngine.setState([tournamentRecord]);
  const { upcomingMatchUps } = competitionEngine.getCompetitionMatchUps();
  const { startDate } = competitionEngine.getCompetitionDateRange();

  const matchUpIds = getMatchUpIds(upcomingMatchUps);
  expect(instanceCount(upcomingMatchUps.map(({ matchUpType }) => matchUpType))).toEqual({ SINGLES: 12 });

  const result = competitionEngine.scheduleMatchUps({
    matchUpDailyLimits: { total: 2 },
    scheduleDate: startDate,
    recoveryMinutes: 30,
    matchUpIds,
  });
  Object.values(result.individualParticipantProfiles).forEach((participantProfile: any) => {
    expect(participantProfile.counters).toEqual({ SINGLES: 2, total: 2 });
  });
  const afterRecoveryTimes = Object.values(result.individualParticipantProfiles).map(
    (profile: any) => profile.timeAfterRecovery,
  );

  // prettier-ignore
  expect(afterRecoveryTimes.sort(stringSort)).toEqual([
      '12:00', '12:00',
      '12:30', '12:30',
      '13:30', '13:30',
      '14:00', '14:00'
    ]);

  // prettier-ignore
  expect(Object.values(result.matchUpNotBeforeTimes).sort(stringSort)).toEqual([
      '09:00', '09:00',
      '11:00', '11:00',
      '12:30', '12:30',
      '14:00', '14:00'
    ]);

  expect(result.scheduledMatchUpIds.length).toEqual(8);
  expect(result.success).toEqual(true);
});

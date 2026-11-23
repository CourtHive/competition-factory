import { getMatchUpIds } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { INVALID_OBJECT } from '@Constants/errorConditionConstants';
import { SCHEDULE_LIMITS } from '@Constants/extensionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

it('can set and honor matchUpDailyLimits', () => {
  // ensure that tournament has exactly 16 participants
  // so that conflict can be assured for testing purposes
  const participantsCount = 16;
  const drawProfiles = [{ drawSize: participantsCount }];
  const venueProfiles = [{ courtsCount: 6 }];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount },
    venueProfiles,
    drawProfiles,
  });

  expect(tournamentRecord.participants.length).toEqual(participantsCount);

  tournamentEngine.setState([tournamentRecord]);
  const { matchUps } = tournamentEngine.allCompetitionMatchUps();
  const { startDate } = tournamentEngine.getCompetitionDateRange();

  const matchUpIds = getMatchUpIds(matchUps);

  let result = tournamentEngine.setMatchUpDailyLimits({});
  expect(result.error).toEqual(INVALID_OBJECT);

  const dailyLimits = {
    [DOUBLES]: 1,
    [SINGLES]: 1,
    total: 1,
  };
  result = tournamentEngine.setMatchUpDailyLimits({
    dailyLimits,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getMatchUpDailyLimitsUpdate();
  expect(result.methods.length).toEqual(1);
  expect(result.methods[0].method).toEqual('addExtension');

  result = tournamentEngine.getMatchUpDailyLimitsUpdate();
  expect(result.methods.length).toEqual(1);
  expect(result.methods[0].method).toEqual('addExtension');

  result.methods.forEach((method) => {
    const executionResult = tournamentEngine[method.method](method.params);
    expect(executionResult.success).toEqual(true);
  });

  const {
    extension: {
      value: { dailyLimits: matchUpDailyLimits },
    },
  } = tournamentEngine.findExtension({
    name: SCHEDULE_LIMITS,
    discover: true,
  });
  expect(dailyLimits).toEqual(matchUpDailyLimits);

  result = tournamentEngine.scheduleMatchUps({
    matchUpDailyLimits,
    scheduleDate: startDate,
    matchUpIds,
  });
  expect(result.success).toEqual(true);

  const { dateMatchUps } = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: startDate },
  });

  const scheduledRounds = unique(dateMatchUps.map((m) => m.roundName));
  expect(scheduledRounds.includes('QF')).toEqual(false);

  result = tournamentEngine.getMatchUpFormatTimingUpdate();
  expect(result.methods.length).toEqual(0);
});

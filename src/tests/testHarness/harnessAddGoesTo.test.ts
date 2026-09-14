import { visualizeScheduledMatchUps } from './testUtilities/visualizeScheduledMatchUps';
import { extractTime, timeStringMinutes } from '@Tools/dateTime';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import competitionEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

import tournamentRecord from './goesToTournament.tods.json';
competitionEngine.setState(tournamentRecord);
const showGlobalLog = false;

it('can auto schedule matchUps which are missing winnerMatchUpId and loserMatchUpid', () => {
  let { matchUps } = competitionEngine.allCompetitionMatchUps();
  let scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(0);

  const { schedulingProfile } = competitionEngine.getSchedulingProfile();
  expect(schedulingProfile.length).toEqual(1);

  const { issuesCount } = competitionEngine.getSchedulingProfileIssues();
  expect(issuesCount).toEqual(0);

  const { startDate } = competitionEngine.getCompetitionDateRange();

  const result = competitionEngine.scheduleProfileRounds();
  const scheduledIdsCount = result.scheduledMatchUpIds[startDate].length;

  ({ matchUps } = competitionEngine.allCompetitionMatchUps({
    afterRecoveryTimes: true,
  }));
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(scheduledIdsCount);

  scheduledMatchUps.forEach(({ matchUpType, schedule }) => {
    const averagePlusRecovery = Math.abs(
      timeStringMinutes(extractTime(schedule.scheduledTime)) - timeStringMinutes(schedule.timeAfterRecovery),
    );
    if (matchUpType === SINGLES) {
      expect(schedule.recoveryMinutes).toEqual(60);
      expect(averagePlusRecovery).toEqual(150);
    } else if (matchUpType === DOUBLES) {
      expect(schedule.recoveryMinutes).toEqual(30);
      expect(averagePlusRecovery).toEqual(120);
    } else {
      expect('a bird in hand').toEqual('two in the bush');
    }
  });

  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog });

  const scheduleConflicts = scheduledMatchUps.filter(({ schedule }) => schedule.scheduleConflict);
  expect(scheduleConflicts.length).toEqual(0);

  const { participantIdsWithConflicts } = competitionEngine.getCompetitionParticipants({
    withScheduleItems: true,
    scheduleAnalysis: true,
    withEvents: false,
    withDraws: false,
  });
  expect(participantIdsWithConflicts.length).toEqual(0);
});

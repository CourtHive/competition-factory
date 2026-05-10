import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { getMatchUpIds } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';
import { dateStringDaysChange, extractDate, extractTime } from '@Tools/dateTime';

import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { SINGLES } from '@Constants/eventConstants';
import { CURTIS_CONSOLATION, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES, MISSING_MATCHUP_IDS } from '@Constants/errorConditionConstants';

it('can bulk reschedule matchUps that have been auto-scheduled', () => {
  const venueProfiles = [
    {
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 8,
    },
  ];

  const eventProfiles = [
    {
      eventName: 'Event Test',
      eventType: SINGLES,
      drawProfiles: [
        {
          drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
          drawSize: 16,
        },
        {
          drawType: CURTIS_CONSOLATION,
          qualifyingPositions: 4,
          drawName: 'Main Draw',
          drawSize: 32,
        },
      ],
    },
  ];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const {
    drawIds,
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);

  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
  });

  const { tournamentId } = tournamentRecord;

  // add first round of each draw to scheduling profile
  for (const drawId of drawIds) {
    const {
      drawDefinition: {
        structures: [{ structureId }],
      },
      event: { eventId },
    } = tournamentEngine.getEvent({ drawId });
    const result = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
      scheduleDate: startDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  }

  // add second round of each draw to scheduling profile
  for (const drawId of drawIds) {
    const {
      event: { eventId },
      drawDefinition: {
        structures: [{ structureId }],
      },
    } = tournamentEngine.getEvent({ drawId });
    const result = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
      scheduleDate: startDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  }

  tournamentEngine.devContext({ timing: true });
  let result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  tournamentEngine.devContext({ timing: false });
  expect(result.success).toEqual(true);
  expect(result.scheduledDates).toEqual([startDate]);

  let { matchUps } = tournamentEngine.allCompetitionMatchUps();
  let scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps[0].schedule.scheduledDate).toEqual(startDate);
  expect(scheduledMatchUps.length).toBeLessThan(matchUps.length);

  const matchUpIds = getMatchUpIds(matchUps);
  result = tournamentEngine.bulkRescheduleMatchUps({ matchUpIds });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.bulkRescheduleMatchUps({
    matchUpIds,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.bulkRescheduleMatchUps({
    matchUpIds: 'not an array',
  });
  expect(result.error).toEqual(MISSING_MATCHUP_IDS);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: 'not an object',
    matchUpIds,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 'NaN', minutesChange: 0 },
    matchUpIds,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 0, minutesChange: 'NaN' },
    matchUpIds,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 0, minutesChange: 0 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: -1, minutesChange: 0 },
    matchUpIds,
  });
  expect(result.notRescheduled.length).toEqual(scheduledMatchUps.length);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 1, minutesChange: 0 },
    matchUpIds,
  });
  expect(result.rescheduled.length).toEqual(scheduledMatchUps.length);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);

  expect(scheduledMatchUps[0].schedule.scheduledDate).toEqual(dateStringDaysChange(startDate, 1));

  expect(scheduledMatchUps[0].schedule.scheduledTime).toEqual('08:00');
  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { minutesChange: 300 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);
  expect(result.rescheduled.length).toEqual(scheduledMatchUps.length);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(extractTime(scheduledMatchUps[0].schedule.scheduledTime)).toEqual('13:00');

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 'NaN', minutesChange: 0 },
    matchUpIds,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: 'not an object',
    matchUpIds,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { minutesChange: 800 },
    matchUpIds: ['bogus matchUpId'],
  });
  expect(result.success).toEqual(true);

  // nothing should be rescheduled because scheduledTimes would be next day
  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { minutesChange: 800 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);
  expect(result.notRescheduled.length).toEqual(scheduledMatchUps.length);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { minutesChange: 800 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);
  expect(result.rescheduled.length).toEqual(0);
  expect(result.notRescheduled.length).toEqual(scheduledMatchUps.length);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { minutesChange: 30 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);
  expect(result.rescheduled.length).toEqual(scheduledMatchUps.length);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: 2 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: -3, minutesChange: -750 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(extractTime(scheduledMatchUps[0].schedule.scheduledTime)).toEqual('01:00');
  expect(extractDate(scheduledMatchUps[0].schedule.scheduledDate)).toEqual('2022-01-01');

  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { daysChange: -1 },
    matchUpIds,
  });
  expect(result.success).toEqual(true);
  expect(result.notRescheduled.length).toEqual(scheduledMatchUps.length);

  const matchUpId = scheduledMatchUps[0].matchUpId;
  result = tournamentEngine.bulkRescheduleMatchUps({
    scheduleChange: { minutesChange: -61 },
    matchUpIds: [matchUpId],
  });
  expect(result.success).toEqual(true);
  expect(result.notRescheduled.length).toEqual(1);
});

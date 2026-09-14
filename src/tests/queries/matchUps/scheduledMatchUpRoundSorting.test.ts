import { extractTime, timeStringMinutes } from '@Tools/dateTime';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// Fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';

test.each([
  [16, 8, 8, 18],
  [16, 16, 8, 24],
  [16, 32, 8, 36],
])(
  'sorts scheduled matchUps according to schedulingProfile',
  async (drawSize1, drawSize2, courtsCount, scheduledMatchUps) => {
    const drawProfiles = [
      { drawId: 'first', drawSize: drawSize1, drawName: 'Draw 1' },
      {
        drawId: 'second',
        drawSize: drawSize2,
        drawName: 'Draw 2',
        uniqueParticipants: true,
      },
    ];
    const venueProfiles = [
      {
        venueName: 'venue 1',
        startTime: '08:00',
        endTime: '20:00',
        courtsCount,
      },
    ];

    const startDate = '2022-01-01';
    const endDate = '2022-01-07';
    let result = mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_SCHEDULING_DEFAULT,
      venueProfiles,
      drawProfiles,
      startDate,
      endDate,
    });

    const {
      drawIds,
      tournamentRecord,
      venueIds: [venueId],
    } = result;

    tournamentEngine.setState(tournamentRecord);

    let { matchUpDailyLimits } = tournamentEngine.getMatchUpDailyLimits();
    expect(matchUpDailyLimits).not.toBeUndefined();
    ({ matchUpDailyLimits } = tournamentEngine.getMatchUpDailyLimits());
    expect(matchUpDailyLimits).not.toBeUndefined();

    // tournamentEngine is used to retreive the events
    const { tournamentId } = tournamentRecord;

    // add first round of each draw to scheduling profile
    for (const drawId of drawIds) {
      const {
        event: { eventId },
        drawDefinition: {
          structures: [{ structureId }],
        },
      } = tournamentEngine.getEvent({ drawId });
      result = tournamentEngine.addSchedulingProfileRound({
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
      result = tournamentEngine.addSchedulingProfileRound({
        round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
        scheduleDate: startDate,
        venueId,
      });
      expect(result.success).toEqual(true);
    }

    result = tournamentEngine.scheduleProfileRounds({
      scheduleDates: [startDate],
    });

    expect(result.success).toEqual(true);
    expect(result.scheduledDates).toEqual([startDate]);
    expect(result.scheduledMatchUpIds[startDate].length).toEqual(scheduledMatchUps);

    const matchUpFilters = { scheduledDate: startDate };
    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters,
    });

    const drawsRounds = result.dateMatchUps.reduce((drawsRounds, { drawId, roundNumber }) => {
      const drawRound = [drawId, roundNumber].join('|');
      return drawsRounds.includes(drawRound) ? drawsRounds : drawsRounds.concat(drawRound);
    }, []);
    expect(drawsRounds).toEqual(['first|1', 'second|1', 'first|2', 'second|2']);

    const scheduleMap = result.dateMatchUps.map(({ schedule }) => extractTime(schedule.scheduledTime));
    scheduleMap.forEach((scheduledTime, i) => {
      expect(i && timeStringMinutes(scheduledTime)).toBeGreaterThanOrEqual(i && timeStringMinutes(scheduleMap[i - 1]));
    });
  },
);

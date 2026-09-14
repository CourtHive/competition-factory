import { visualizeScheduledMatchUps } from '@Tests/testHarness/testUtilities/visualizeScheduledMatchUps';
import { extractTime, timeStringMinutes } from '@Tools/dateTime';
import { getParticipantId } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SINGLES } from '@Constants/eventConstants';

it.each([
  {
    startTime: '08:00',
    endTime: '20:00',
    courtsCount: 4,
    twoMatchUps: 24,
    scheduledCount: 30,
    availableMinutes: 2880,
    scheduledMinutes: 2700,
    percentUtilization: '93.75',
  },
  {
    startTime: '08:00',
    endTime: '19:00',
    courtsCount: 5,
    twoMatchUps: 44,
    scheduledCount: 35,
    availableMinutes: 3300,
    scheduledMinutes: 3150,
    percentUtilization: '95.45',
  },
])(
  'can clear scheduled matchUps',
  ({
    startTime,
    endTime,
    courtsCount,
    twoMatchUps,
    scheduledCount,
    availableMinutes,
    scheduledMinutes,
    percentUtilization,
  }) => {
    const venueProfiles = [
      {
        venueName: 'venue 1',
        startTime,
        endTime,
        courtsCount,
      },
    ];

    const eventProfiles = [
      {
        eventName: 'Event Test',
        eventType: SINGLES,
        drawProfiles: [
          {
            drawSize: 16,
            drawName: 'Sixteen',
            drawType: FIRST_MATCH_LOSER_CONSOLATION,
            uniqueParticipants: true,
          },
          {
            drawSize: 32,
            drawName: 'Main Draw',
            drawType: COMPASS,
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
      policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    });

    const { tournamentId } = tournamentRecord;

    // add first round of each draw to scheduling profile
    for (const drawId of drawIds) {
      const {
        event: { eventId },
        drawDefinition: {
          structures: [{ structureId }],
        },
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

    // Scheduled Profile Rounds ##############################
    let result = tournamentEngine.scheduleProfileRounds({
      scheduleDates: [startDate],
    });
    expect(result.success).toEqual(true);
    expect(result.scheduledDates).toEqual([startDate]);
    // #######################################################

    // get the participantIds for each draw
    const drawEnteredParticipantIds: string[] = [];
    for (const drawId of drawIds) {
      const {
        drawDefinition: { entries: drawEntries },
      } = tournamentEngine.getEvent({ drawId });
      drawEnteredParticipantIds.push(drawEntries.map(getParticipantId));
    }
    // expect the two draws to have unique participants
    expect(intersection(drawEnteredParticipantIds[0], drawEnteredParticipantIds[1]).length).toEqual(0);

    let { matchUps } = tournamentEngine.allCompetitionMatchUps({
      afterRecoveryTimes: true,
    });
    let scheduledMatchUps = matchUps.filter(hasSchedule);
    expect(scheduledMatchUps[0].schedule.timeAfterRecovery).toEqual('10:30');

    const roundMap = scheduledMatchUps
      .map(({ roundNumber, roundPosition, drawName, schedule }) => [
        extractTime(schedule.scheduledTime),
        roundNumber,
        roundPosition,
        drawName,
      ])
      .sort((a, b) => timeStringMinutes(a[0]) - timeStringMinutes(b[0]));
    expect(roundMap.length).toEqual(scheduledCount);
    // console.log(roundMap); // useful for eye-balling

    const participantsResult = tournamentEngine.getCompetitionParticipants({
      withIndividualParticipants: true,
      withPotentialMatchUps: true,
      withMatchUps: true,
      inContext: true,
    });
    const { participants: competitionParticipants, participantIdsWithConflicts, mappedMatchUps } = participantsResult;
    expect(competitionParticipants.length).toEqual(48);

    expect(participantIdsWithConflicts.length).toEqual(0);

    let participantsWithMultipleScheduledMatchUps = 0;
    competitionParticipants.forEach((participant) => {
      const { matchUps = [], potentialMatchUps = [] } = participant;
      const scheduledMatchUps = matchUps
        .concat(...potentialMatchUps)
        .filter(({ matchUpId }) => hasSchedule(mappedMatchUps[matchUpId]));
      if (scheduledMatchUps.length > 1) {
        participantsWithMultipleScheduledMatchUps += 1;
        const firstMatchAfterRecoveryMinutes = timeStringMinutes(
          mappedMatchUps[scheduledMatchUps[0].matchUpId].schedule.timeAfterRecovery,
        );
        const secondMatchStartMinutes = timeStringMinutes(
          extractTime(mappedMatchUps[scheduledMatchUps[1].matchUpId].schedule.scheduledTime),
        );
        expect(secondMatchStartMinutes).toBeGreaterThanOrEqual(firstMatchAfterRecoveryMinutes);
      }
    });

    expect(participantsWithMultipleScheduledMatchUps).toEqual(twoMatchUps);

    result = tournamentEngine.getVenuesReport({ venueIds: 'invalid value' });
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.getVenuesReport({ dates: 'invalid value' });
    expect(result.error).toEqual(INVALID_VALUES);
    result = tournamentEngine.getVenuesReport({ dates: ['bogus date'] });
    expect(result.error).toEqual(INVALID_DATE);
    result = tournamentEngine.getVenuesReport({
      dates: [startDate],
      venueIds: [venueId],
    });
    expect(result.venuesReport.length).toEqual(1);

    const {
      venuesReport: [{ venueReport }],
    } = tournamentEngine.getVenuesReport();
    const dateVenueReport = venueReport[startDate];
    expect(dateVenueReport.scheduledMatchUpsCount).toEqual(scheduledCount);
    expect(dateVenueReport.availableCourts).toEqual(courtsCount);
    expect(dateVenueReport.availableMinutes).toEqual(availableMinutes);
    expect(dateVenueReport.scheduledMinutes).toEqual(scheduledMinutes);
    expect(dateVenueReport.percentUtilization).toEqual(percentUtilization);

    result = tournamentEngine.clearScheduledMatchUps();
    expect(result.success).toEqual(true);

    ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
    scheduledMatchUps = matchUps.filter(hasSchedule);
    expect(scheduledMatchUps.length).toEqual(0);
  },
);

it('can clear scheduled matchUps', () => {
  const startTime = '08:00';
  const endTime = '19:00';
  const courtsCount = 6;
  const scheduledCount = 6;
  const uniqueParticipants = false;
  const twoMatchUps = 4;
  const venueProfiles = [
    {
      venueName: 'venue 1',
      startTime,
      endTime,
      courtsCount,
    },
  ];

  const eventProfiles = [
    {
      eventName: 'Event Test',
      eventType: SINGLES,
      drawProfiles: [
        {
          drawSize: 4,
          drawName: 'A',
          uniqueParticipants,
        },
        {
          drawSize: 4,
          drawName: 'B Draw',
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
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
  });

  const { tournamentId } = tournamentRecord;

  // add first round of each draw to scheduling profile
  for (const drawId of drawIds) {
    const {
      event: { eventId },
      drawDefinition: {
        structures: [{ structureId }],
      },
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

  // Scheduled Profile Rounds ##############################
  let result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledDates).toEqual([startDate]);
  // #######################################################

  // get the participantIds for each draw
  const drawEnteredParticipantIds: string[] = [];
  for (const drawId of drawIds) {
    const {
      drawDefinition: { entries: drawEntries },
    } = tournamentEngine.getEvent({ drawId });
    drawEnteredParticipantIds.push(drawEntries.map(({ participantId }) => participantId));
  }
  // expect the two draws to have unique participants
  const entriesOverlap = intersection(drawEnteredParticipantIds[0], drawEnteredParticipantIds[1]).length;
  if (uniqueParticipants) {
    expect(entriesOverlap).toEqual(0);
  } else {
    expect(entriesOverlap).toEqual(4);
  }

  const scheduleAttributes = ['scheduledDate', 'scheduledTime'];
  const hasSchedule = ({ schedule }) => {
    const matchUpScheduleKeys =
      schedule &&
      Object.keys(schedule)
        .filter((key) => scheduleAttributes.includes(key))
        .filter((key) => schedule[key]);
    return !!matchUpScheduleKeys?.length;
  };

  let { matchUps } = tournamentEngine.allCompetitionMatchUps({
    afterRecoveryTimes: true,
  });
  let scheduledMatchUps = matchUps.filter(hasSchedule);
  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog: false });
  expect(scheduledMatchUps.length).toEqual(scheduledCount);
  expect(scheduledMatchUps[0].schedule.timeAfterRecovery).toEqual('10:30');

  const roundMap = scheduledMatchUps
    .map(({ roundNumber, roundPosition, drawName, schedule }) => [
      extractTime(schedule.scheduledTime),
      roundNumber,
      roundPosition,
      drawName,
    ])
    .sort((a, b) => timeStringMinutes(a[0]) - timeStringMinutes(b[0]));
  expect(roundMap.length).toEqual(scheduledCount);
  expect(roundMap).toEqual([
    ['08:00', 1, 1, 'A'],
    ['08:00', 1, 2, 'A'],
    ['10:30', 1, 1, 'B Draw'],
    ['10:30', 1, 2, 'B Draw'],
    ['13:00', 2, 1, 'A'],
    ['15:30', 2, 1, 'B Draw'],
  ]);

  const {
    participants: competitionParticipants,
    participantIdsWithConflicts,
    mappedMatchUps,
  } = tournamentEngine.getCompetitionParticipants({
    withIndividualParticipants: true,
    withMatchUps: true,
  });
  expect(participantIdsWithConflicts.length).toEqual(0);

  let participantsWithMultipleScheduledMatchUps = 0;
  competitionParticipants.forEach((participant) => {
    const { matchUps = [], potentialMatchUps = [] } = participant;
    const scheduledMatchUps = matchUps
      .concat(...potentialMatchUps)
      .filter(({ matchUpId }) => hasSchedule(mappedMatchUps[matchUpId]));
    if (scheduledMatchUps.length > 1) {
      participantsWithMultipleScheduledMatchUps += 1;
      const firstMatchAfterRecoveryMinutes = timeStringMinutes(
        mappedMatchUps[scheduledMatchUps[0].matchUpId].schedule.timeAfterRecovery,
      );
      const secondMatchStartMinutes = timeStringMinutes(
        extractTime(mappedMatchUps[scheduledMatchUps[1].matchUpId].schedule.scheduledTime),
      );
      expect(secondMatchStartMinutes).toBeGreaterThanOrEqual(firstMatchAfterRecoveryMinutes);
    }
  });

  expect(participantsWithMultipleScheduledMatchUps).toEqual(twoMatchUps);

  result = tournamentEngine.clearScheduledMatchUps();
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allCompetitionMatchUps());
  scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(0);
});

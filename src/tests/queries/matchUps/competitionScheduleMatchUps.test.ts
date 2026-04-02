import { visualizeScheduledMatchUps } from '../../testHarness/testUtilities/visualizeScheduledMatchUps';
import { getMatchUpIds } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { instanceCount, unique } from '@Tools/arrays';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { addDays } from '@Tools/dateTime';
import { expect, test } from 'vitest';

// constants
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { MISSING_EVENT, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

const sst = 'schedule.scheduledTime';
const d210505 = '2021-05-05';

test.each([tournamentEngine])(
  'correctly enumerates participantProfiles for { eventType: DOUBLES }',
  async (tournamentEngine) => {
    const drawProfiles = [{ drawSize: 16, eventType: DOUBLES }];
    const venueProfiles = [{ courtsCount: 3 }];

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      endDate: addDays(d210505, 2),
      startDate: d210505,
      venueProfiles,
      drawProfiles,
    });

    tournamentEngine.setState([tournamentRecord]);
    const { upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps();
    const { startDate } = tournamentEngine.getCompetitionDateRange();

    const matchUpIds = getMatchUpIds(upcomingMatchUps);
    expect(instanceCount(upcomingMatchUps.map(({ matchUpType }) => matchUpType))).toEqual({ DOUBLES: 8 });

    const result = tournamentEngine.scheduleMatchUps({ scheduleDate: startDate, matchUpIds });
    Object.values(result.individualParticipantProfiles).forEach((participantProfile: any) =>
      expect(participantProfile.counters).toEqual({ DOUBLES: 1, total: 1 }),
    );
    expect(result.scheduledMatchUpIds.length).toEqual(8);
    expect(result.success).toEqual(true);
  },
);

test.each([tournamentEngine])('auto schedules venue if only one venue provided', async (tournamentEngine) => {
  const drawProfiles = [
    {
      eventType: DOUBLES,
      idPrefix: 'dbl',
      eventId: 'e1',
      drawSize: 16,
      drawId: 'd1',
    },
    {
      eventType: SINGLES,
      idPrefix: 'sgl',
      eventId: 'e2',
      drawSize: 64,
      drawId: 'd2',
    },
  ];
  const venueProfiles = [{ courtsCount: 3 }];

  const { eventIds } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    endDate: addDays(d210505, 2),
    startDate: d210505,
    venueProfiles,
    drawProfiles,

    setState: true,
  });

  expect(eventIds).toEqual(['e1', 'e2']);

  const { upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps();
  const { startDate } = tournamentEngine.getCompetitionDateRange();

  const matchUpIds = getMatchUpIds(upcomingMatchUps);
  expect(instanceCount(upcomingMatchUps.map(({ matchUpType }) => matchUpType))).toEqual({ DOUBLES: 8, SINGLES: 32 });

  let result = tournamentEngine.scheduleMatchUps({
    scheduleDate: startDate,
    matchUpIds,
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledMatchUpIds.length).toEqual(23);
  expect(
    Object.values(result.individualParticipantProfiles).some(
      (profile: any) => profile.counters.DOUBLES === 1 && profile.counters.SINGLES === 1,
    ),
  ).toEqual(true);

  const matchUpFilters = { scheduledDate: d210505 };
  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
    matchUpFilters,
  });
  expect(result.dateMatchUps.length).toEqual(0);

  result = tournamentEngine.publishOrderOfPlay();
  expect(result.success).toEqual(true);

  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
    nextMatchUps: true,
    matchUpFilters,
  });
  expect(result.dateMatchUps.length).toEqual(0);

  tournamentEngine.publishEvent({ eventId: 'e1' });
  tournamentEngine.publishEvent({ eventId: 'e2' });

  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
    nextMatchUps: true,
    matchUpFilters,
  });

  expect(result.dateMatchUps.length).toEqual(23);
  expect(result.dateMatchUps[0].winnerTo).toBeDefined();

  result = tournamentEngine.unPublishOrderOfPlay();
  expect(result.success).toEqual(true);

  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
    matchUpFilters,
  });
  expect(result.dateMatchUps.length).toEqual(0);

  result = tournamentEngine.publishOrderOfPlay();
  expect(result.success).toEqual(true);

  result = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters,
  });
  expect(result.dateMatchUps.length).toEqual(23);

  const matchUpsContextIds = result.dateMatchUps.slice(3, 6).map(({ tournamentId, drawId, matchUpId, schedule }) => ({
    tournamentId,
    matchUpId,
    schedule,
    drawId,
  }));

  result = tournamentEngine.reorderUpcomingMatchUps({
    matchUpsContextIds,
    firstToLast: true,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
    matchUpFilters,
  });
  expect(result.dateMatchUps.map(xa(sst)).filter(Boolean).length).toEqual(23);

  // there are two events which have matchUps with scheduleTime
  let eventIdWithTime = result.dateMatchUps.filter(xa(sst)).map(xa('eventId'));
  expect(unique(eventIdWithTime)).toEqual(['e1', 'e2']);

  visualizeScheduledMatchUps({
    scheduledMatchUps: result.dateMatchUps,
    showGlobalLog: false,
  });

  const displaySettings = {
    draws: {
      default: {
        scheduleDetails: [
          {
            attributes: {
              scheduledTime: false,
            },
          },
        ],
      },
    },
  };

  result = tournamentEngine.devContext(true).setEventDisplay();
  expect(result.error).toEqual(MISSING_EVENT);

  result = tournamentEngine.setEventDisplay({ eventId: 'e1' });
  expect(result.error).toEqual(MISSING_VALUE);

  tournamentEngine.setEventDisplay({
    displaySettings,
    eventId: 'e1',
  });

  result = tournamentEngine.competitionScheduleMatchUps({
    usePublishState: true,
    matchUpFilters,
  });
  expect(result.dateMatchUps.map(xa(sst)).filter(Boolean).length).toEqual(15);
  // schedule.scheduledTime has been filtered but not schedule.venueId
  expect(result.dateMatchUps.map(xa('schedule.venueId')).filter(Boolean).length).toEqual(23);

  // now there is only one event which have matchUps with scheduleTime
  eventIdWithTime = result.dateMatchUps.filter(xa(sst)).map(xa('eventId'));
  expect(unique(eventIdWithTime)).toEqual(['e2']);

  visualizeScheduledMatchUps({
    scheduledMatchUps: result.dateMatchUps,
    showGlobalLog: false,
  });

  result = tournamentEngine.competitionScheduleMatchUps({
    nextMatchUps: true,
  });
  expect(
    result.dateMatchUps.find((m) => m.winnerMatchUpId && !m.readyToScore)?.potentialParticipants.length,
  ).toBeGreaterThan(1);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps({
    afterRecoveryTimes: true,
  });
  matchUps.filter(hasSchedule).forEach(({ schedule }) => {
    expect(schedule.averageMinutes).toBeGreaterThan(0);
    expect(schedule.recoveryMinutes).toBeGreaterThan(0);
  });

  const reorderedMatchUpContextIds = result.dateMatchUps.slice(3, 6).map(({ matchUpId, schedule }) => ({
    scheduledTime: schedule.scheduledTime,
    matchUpId,
  }));

  // confirm that the first is now the last...
  expect(matchUpsContextIds[0].matchUpId).toEqual(reorderedMatchUpContextIds[2].matchUpId);

  // the matchUps order has changed but the times are still in the same order
  expect(matchUpsContextIds.map((m) => m.schedule.scheduledTime)).toEqual(
    reorderedMatchUpContextIds.map((m) => m.scheduledTime),
  );

  result = tournamentEngine.reorderUpcomingMatchUps({
    matchUpsContextIds: undefined,
  });
  expect(result.error).not.toBeUndefined();

  result = tournamentEngine.reorderUpcomingMatchUps({
    matchUpsContextIds: [],
  });
  expect(result.success).toEqual(true);

  matchUpFilters.scheduledDate = '2021-05-06';
  result = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters,
  });
  expect(result.dateMatchUps.length).toEqual(0);

  result = tournamentEngine.scheduleMatchUps({
    scheduleDate: startDate,
    matchUpIds,
  });
  expect(result.scheduledMatchUpIds.length).toEqual(0);
});

test.each([tournamentEngine])(
  'correctly returns date matchUps when draw structures are published separately and when order of play is published',
  async (tournamentEngine) => {
    const startDate = '2022-01-01';
    const venueId = 'mockVenueId';
    const drawId = 'mockDrawId';

    const drawProfiles = [
      {
        drawType: SINGLE_ELIMINATION,
        uniqueParticipants: true,
        drawName: 'Main Draw',
        completionGoal: 5,
        drawSize: 32,
        stage: MAIN,
        drawId,
      },
    ];

    const venueProfiles = [
      {
        venueName: 'Club Courts',
        venueAbbreviation: 'CC',
        startTime: '08:00',
        endTime: '20:00',
        courtsCount: 10,
        venueId,
      },
    ];

    const schedulingProfile = [
      {
        scheduleDate: startDate,
        venues: [
          {
            rounds: [{ drawId, winnerFinishingPositionRange: '1-16' }],
            venueId: venueProfiles[0].venueId,
          },
        ],
      },
    ];

    const { success, tournamentRecord } = mocksEngine.generateTournamentRecord({
      policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
      autoSchedule: true,
      schedulingProfile,
      venueProfiles,
      drawProfiles,
      startDate,
    });

    tournamentEngine.setState(tournamentRecord);

    expect(success).toEqual(true);
    expect(tournamentRecord).toBeDefined();

    const event = tournamentRecord.events[0];
    const drawDefinition = event.drawDefinitions[0];
    const mainStructure = drawDefinition.structures[0];

    expect(drawDefinition).toBeDefined();
    expect(mainStructure).toBeDefined();

    let result = tournamentEngine.allCompetitionMatchUps();
    expect(result.matchUps.length).toEqual(31);

    result = tournamentEngine.addQualifyingStructure({
      targetStructureId: mainStructure.structureId,
      drawId: drawDefinition.drawId,
      qualifyingRoundNumber: 3,
      drawSize: 32,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.allCompetitionMatchUps();

    // expect 59 matchUps because the main draw has 31 matchUps and the qualifying draw has 28 matchUps
    expect(result.matchUps.length).toEqual(59);

    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    });
    expect(result.dateMatchUps.length).toEqual(11);

    result = tournamentEngine.getDrawData({ drawId: drawDefinition.drawId });
    const structureIds = result.structures.map((structure) => structure.structureId);
    const qualifyingStructure = result.structures.find((structure) => structure.stage === QUALIFYING);
    expect(qualifyingStructure).toBeDefined();
    expect(qualifyingStructure.structureId).toBeDefined();

    const qualifyingStructureId = qualifyingStructure.structureId;
    const mainStructureId = structureIds.find((structureId) => structureId !== qualifyingStructureId);

    const qualifyingMatchUps = Object.values(qualifyingStructure.roundMatchUps).flat();

    let matchUpContextIds = qualifyingMatchUps.map(({ drawId, matchUpId }: any) => ({
      tournamentId: tournamentRecord.tournamentId,
      matchUpId,
      drawId,
    }));

    let schedule = {
      scheduledDate: startDate,
      scheduledTime: '08:00',
      venueId,
    };
    result = tournamentEngine.bulkScheduleMatchUps({
      matchUpContextIds,
      schedule,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    });
    expect(result.dateMatchUps.length).toEqual(39);

    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toEqual(0);

    result = tournamentEngine.publishEvent({
      drawIdsToAdd: [drawDefinition.drawId],
      removePriorValues: true,
      eventId: event.eventId,
      drawDetails: {
        [drawDefinition.drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [qualifyingStructureId]: { published: false },
            [mainStructureId]: { published: true },
          },
        },
      },
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.publishOrderOfPlay();
    expect(result.success).toEqual(true);

    let eventData = tournamentEngine.getEventData({ eventId: event.eventId, usePublishState: false }).eventData;
    let publishState = eventData.eventInfo.publishState;
    let drawDetails = publishState.status.drawDetails[drawDefinition.drawId];
    let structureDetails = drawDetails.structureDetails;
    expect(eventData.eventInfo.published).toEqual(true);
    expect(drawDetails.publishingDetail.published).toEqual(true);
    expect(structureDetails[qualifyingStructureId].published).toEqual(false);
    expect(structureDetails[mainStructureId].published).toEqual(true);

    // since usePublishState is false, all structures are returned
    expect(eventData.drawsData[0].structures.length).toEqual(2);

    eventData = tournamentEngine.getEventData({ eventId: event.eventId, usePublishState: true }).eventData;

    // since usePublishState is false, only published structures are returned
    expect(eventData.drawsData[0].structures.length).toEqual(1);

    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toEqual(11);

    result = tournamentEngine.publishEvent({
      removePriorValues: true,
      eventId: event.eventId,
      drawDetails: {
        [drawDefinition.drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [qualifyingStructureId]: { published: true },
            [mainStructureId]: { published: true },
          },
        },
      },
    });
    expect(result.success).toEqual(true);
    publishState = tournamentEngine.getPublishState().publishState;
    expect(publishState[event.eventId].status.drawDetails[drawDefinition.drawId].stageDetails).toEqual({});

    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toEqual(39);

    result = tournamentEngine.publishEvent({
      removePriorValues: true,
      eventId: event.eventId,
      drawDetails: {
        [drawDefinition.drawId]: {
          publishingDetail: { published: true },
          stagesToRemove: [QUALIFYING],
        },
      },
    });
    expect(result.success).toEqual(true);
    publishState = tournamentEngine.getPublishState().publishState;
    expect(publishState[event.eventId].status.drawDetails[drawDefinition.drawId].stageDetails[QUALIFYING]).toEqual({
      published: false,
    });

    result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: true,
    });
    expect(result.dateMatchUps.length).toEqual(11);
  },
);

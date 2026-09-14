import { visualizeScheduledMatchUps } from '@Tests/testHarness/testUtilities/visualizeScheduledMatchUps';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { extractTime } from '@Tools/dateTime';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import { MISSING_EVENT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

it('auto schedules multiple events at multiple venues and tracks participants across venues', () => {
  const venueProfiles = [
    {
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 4,
    },
    {
      venueName: 'venue 2',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 2,
    },
  ];

  // the SAME participants will be in both SINGLES and DOUBLES
  const eventProfiles = [
    {
      eventName: 'Event One',
      eventType: SINGLES,
    },
    {
      eventName: 'Event Two',
      eventType: DOUBLES,
    },
  ];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  let result = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 100, participantType: PAIR },
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });
  const { eventIds, venueIds, tournamentRecord } = result;

  tournamentEngine.setState(tournamentRecord);
  tournamentEngine.attachPolicies({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
  });

  const { tournamentId } = tournamentRecord;

  let competitionParticipants = tournamentEngine.getCompetitionParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  }).participants;
  const firstEventParticipantIds = competitionParticipants.slice(0, 32).map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({
    participantIds: firstEventParticipantIds,
    eventId: eventIds[0],
  });
  expect(result.success).toEqual(true);

  const drawIds: string[] = [];
  let { drawDefinition } = tournamentEngine.generateDrawDefinition({
    eventId: eventIds[0],
    drawSize: 32,
  });
  drawIds.push(drawDefinition.drawId);

  result = tournamentEngine.addDrawDefinition({
    tournamentId: 'bogusId',
    eventId: eventIds[0],
    drawDefinition,
  });
  expect(result.error).toEqual(MISSING_TOURNAMENT_RECORD);

  result = tournamentEngine.addDrawDefinition({
    tournamentId,
    drawDefinition,
  });
  expect(result.error).toEqual(MISSING_EVENT);

  result = tournamentEngine.addDrawDefinition({
    // tournamentId, // tournamentId can be discovered by brute force
    eventId: eventIds[0],
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  // ----------------------------------------------
  // Add first two rounds of the first event's draw
  let {
    structures: [{ structureId }],
  } = drawDefinition;

  result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId: venueIds[0],
    round: {
      tournamentId,
      eventId: eventIds[0],
      drawId: drawIds[0],
      structureId,
      roundNumber: 1,
    },
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId: venueIds[0],
    round: {
      tournamentId,
      eventId: eventIds[0],
      drawId: drawIds[0],
      structureId,
      roundNumber: 2,
    },
  });
  expect(result.success).toEqual(true);

  // --------------------------------------------------
  // generate draw for second event
  ({ participants: competitionParticipants } = tournamentEngine.getCompetitionParticipants({
    participantFilters: { participantTypes: [PAIR] },
  }));
  const secondEventParticipantIds = competitionParticipants.slice(0, 32).map((p) => p.participantId);
  result = tournamentEngine.addEventEntries({
    participantIds: secondEventParticipantIds,
    eventId: eventIds[1],
  });
  expect(result.success).toEqual(true);

  ({ drawDefinition } = tournamentEngine.generateDrawDefinition({
    eventId: eventIds[1],
    drawSize: 16,
  }));
  drawIds.push(drawDefinition.drawId);

  result = tournamentEngine.addDrawDefinition({
    tournamentId,
    eventId: eventIds[1],
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  // ----------------------------------------------
  // Add first two rounds of the second event's draw
  ({
    structures: [{ structureId }],
  } = drawDefinition);

  result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId: venueIds[1],
    round: {
      eventId: eventIds[1],
      drawId: drawIds[1],
      roundNumber: 1,
      tournamentId,
      structureId,
    },
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId: venueIds[1],
    round: {
      tournamentId,
      eventId: eventIds[1],
      drawId: drawIds[1],
      roundNumber: 2,
      structureId,
    },
  });
  expect(result.success).toEqual(true);

  const { schedulingProfile } = tournamentEngine.getSchedulingProfile();
  expect(schedulingProfile[0].venues[0].rounds.length).toEqual(2);
  expect(schedulingProfile[0].venues[0].rounds[0].eventId).toEqual(eventIds[0]);
  expect(schedulingProfile[0].venues[0].rounds[0].drawId).toEqual(drawIds[0]);
  expect(schedulingProfile[0].venues[1].rounds.length).toEqual(2);
  expect(schedulingProfile[0].venues[1].rounds[0].eventId).toEqual(eventIds[1]);
  expect(schedulingProfile[0].venues[1].rounds[0].drawId).toEqual(drawIds[1]);

  result = tournamentEngine.getSchedulingProfileIssues();
  expect(Object.keys(result.profileIssues.matchUpIdShouldBeAfter).length).toEqual(0);
  expect(result.success).toEqual(true);

  // #################################################
  result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.requestConflicts[startDate]).toEqual([]);
  expect(result.noTimeMatchUpIds[startDate].length).toBeGreaterThan(0);
  // #################################################

  const { matchUps: singlesMatchUps } = tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  });
  expect(singlesMatchUps.length).toEqual(31);

  const { matchUps: doublesMatchUps } = tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { matchUpTypes: [DOUBLES] },
  });
  expect(doublesMatchUps.length).toEqual(15);

  const singlesScheduled = singlesMatchUps.filter(hasSchedule);
  const doublesScheduled = doublesMatchUps.filter(hasSchedule);
  const totalScheduledMatchUps = singlesScheduled.length + doublesScheduled.length;

  expect(singlesScheduled.length).toBeGreaterThanOrEqual(15);
  expect(doublesScheduled.length).toBeGreaterThanOrEqual(6);
  expect(totalScheduledMatchUps).toBeGreaterThanOrEqual(24);
});

it('multiple events at multiple venues with different participants will start at venue startTimes ', () => {
  // draws will be scheduled at venues with different number of courts
  const venueProfiles = [
    {
      venueName: 'venue 1',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 4,
    },
    {
      venueName: 'venue 2',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 2,
    },
  ];

  const drawSize = 16; // both draws will have same number of participants
  const eventProfiles = [
    {
      eventName: 'Event One',
      eventType: SINGLES,
      drawProfiles: [{ drawSize, idPrefix: 'XS', uniqueParticipants: true }],
    },
    {
      eventName: 'Event Two',
      eventType: DOUBLES,
      drawProfiles: [{ drawSize, idPrefix: 'XD' }],
    },
  ];
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';
  const { drawIds, venueIds, tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 100, participantType: PAIR },
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  tournamentEngine.setState(tournamentRecord);
  const { tournamentId } = tournamentRecord;

  for (const index of [0, 1]) {
    const drawId = drawIds[index];
    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const eventId = event.eventId;
    const {
      structures: [{ structureId }],
    } = drawDefinition;

    for (const roundNumber of [1, 2]) {
      const result = tournamentEngine.devContext(true).addSchedulingProfileRound({
        scheduleDate: startDate,
        venueId: venueIds[index],
        round: {
          tournamentId,
          eventId,
          drawId,
          structureId,
          roundNumber,
        },
      });
      expect(result.success).toEqual(true);
    }
  }

  // #################################################
  const result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.requestConflicts[startDate]).toEqual([]);
  expect(result.noTimeMatchUpIds[startDate].length).toEqual(0);
  // #################################################

  const firstVenueRemainingScheduleTimes = result.scheduleTimesRemaining[startDate][venueIds[0]];
  const secondVenueRemainingScheduleTimes = result.scheduleTimesRemaining[startDate][venueIds[1]];
  expect(firstVenueRemainingScheduleTimes.length).toBeGreaterThan(secondVenueRemainingScheduleTimes.length);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);
  visualizeScheduledMatchUps({ scheduledMatchUps, showGlobalLog: false });

  const firstVenueMatchUpScheduleTimes = scheduledMatchUps
    .filter(({ schedule: { venueId } }) => venueId === venueIds[0])
    .sort(matchUpSort)
    .map(({ schedule }) => schedule.scheduledTime);
  const secondVenueMatchUpScheduleTimes = scheduledMatchUps
    .filter(({ schedule: { venueId } }) => venueId === venueIds[1])
    .sort(matchUpSort)
    .map(({ schedule }) => schedule.scheduledTime);

  expect(firstVenueMatchUpScheduleTimes.length).toEqual(secondVenueMatchUpScheduleTimes.length);

  expect(extractTime(firstVenueMatchUpScheduleTimes[0])).toEqual('08:00');
  expect(extractTime(secondVenueMatchUpScheduleTimes[0])).toEqual('08:00');
});

import garman from '@Assemblies/generators/scheduling/garman/garman';
import { getParticipantId } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { intersection, unique } from '@Tools/arrays';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { extractTime } from '@Tools/dateTime';
import { expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { BYE } from '@Constants/matchUpStatusConstants';

const date = new Date().toISOString().split('T')[0];

it('correctly generates second round scheduleTimes', () => {
  const courtsCount = 30;
  const courts = garman.courtGenerator({
    count: courtsCount,
    startTime: '08:00',
    endTime: '21:00',
    date,
  });
  const { scheduleTimes, timingProfile } = garman.getScheduleTimes({
    averageMatchUpMinutes: 90,
    startTime: '08:00',
    endTime: '21:00',
    periodLength: 30,
    courts,
    date,
  });

  const allScheduleTimes = scheduleTimes.reduce((timesMapped: any, { scheduleTime }) => {
    if (!timesMapped[scheduleTime]) {
      timesMapped[scheduleTime] = 1;
    } else {
      timesMapped[scheduleTime] += 1;
    }
    return timesMapped;
  }, {});

  // the incidence of the first schedule time is equivalent to the total number of courts
  expect(allScheduleTimes['08:00']).toEqual(courtsCount);
  // every other schedule time has 10 instances
  expect(unique(Object.values(allScheduleTimes).slice(1))).toEqual([10]);

  // the first two periods are equal to the number of courts
  // after the first two periods 10 matchUps are added per period until the end of the avialble court time
  // ... after which it is unchanging
  expect(timingProfile.map(({ totalMatchUps }) => totalMatchUps)).toEqual([
    30, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 250,
    250, 250,
  ]);

  // from 08:00 until 21:00 there are 26 periods of 30 minutes
  // since averageMatchUpMinutes is 90, matchUps cannot be scheduled after 19:30
  // ... which means 24 of the 26 periods can be scheduled
  // given that the second period cannot be scheduled due to averageMatchUpMinutes
  // ... there are 23 periods which can be scheduled
  // we expect that the unique number of totalMatchUps values will be 23
  expect(unique(timingProfile.map(({ totalMatchUps }) => totalMatchUps)).length);
});

it('properly schedules 2nd round of 128 single elimination draw with 30 courts', () => {
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';

  const courtsCount = 30;
  const startTime = '08:00';
  const endTime = '21:00';

  const venueProfiles = [
    {
      venueName: 'Very Large Venue',
      venueAbbreviation: 'VLV',
      courtsCount,
      startTime,
      endTime,
    },
  ];

  const eventProfiles = [
    {
      eventName: 'Scheduling Test',
      drawProfiles: [
        {
          participantsCount: 127,
          drawSize: 128,
        },
      ],
    },
  ];

  const {
    drawIds: [drawId],
    eventIds: [eventId],
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    eventProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  const { tournamentId } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });
  let result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 2 },
    scheduleDate: startDate,
    venueId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledDates).toEqual([startDate]);

  // prettier-ignore
  expect(result.skippedScheduleTimes[startDate][venueId].map(({scheduleTime}) => scheduleTime)).toEqual([
    '12:30', '12:30', '12:30', '12:30', '12:30',
  ]);

  // prettier-ignore
  expect(
    result.scheduleTimesRemaining[startDate][venueId].filter(
      ({ attempts }) => attempts
    ).map(({scheduleTime}) => scheduleTime)
  ).toEqual([
    // these times were previously in skippedScheduleTimes
    '11:00', '11:00', '11:30', '11:30', '11:30', '11:30', '11:30', '12:00', '12:00', '12:00', '12:00', '12:00'
  ]);

  const { matchUps } = tournamentEngine.allCompetitionMatchUps();
  const byeMatchUps = matchUps.filter(({ matchUpStatus }) => matchUpStatus === BYE);
  expect(byeMatchUps.length).toEqual(1);
  expect(byeMatchUps[0].roundNumber).toEqual(1);

  const scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(95);

  const scheduledTimes = scheduledMatchUps.map(({ schedule }) => schedule.scheduledTime);
  const timeMap = scheduledTimes.reduce((timesMapped, scheduledTime) => {
    const time = extractTime(scheduledTime);
    if (!timesMapped[time]) {
      timesMapped[time] = 1;
    } else {
      timesMapped[time] += 1;
    }
    return timesMapped;
  }, {});

  // with seed time as last scheduleTime from previously scheduled round
  expect(timeMap).toEqual({
    '08:00': 30,
    '09:00': 10,
    '09:30': 10,
    '10:00': 10,
    '10:30': 10,
    '11:00': 8,
    '11:30': 5,
    '12:00': 5,
    '12:30': 5,
    '13:00': 2,
  });
});

it('properly schedules 1st rounds of two 32 single elimination draws with 10 courts', () => {
  const startDate = '2022-01-01';
  const endDate = '2022-01-07';

  const courtsCount = 10;
  const startTime = '08:00';
  const endTime = '21:00';

  const venueProfiles = [
    {
      venueName: 'Ten Courts',
      venueAbbreviation: 'TCT',
      courtsCount,
      startTime,
      endTime,
    },
  ];

  const drawProfiles = [
    {
      drawSize: 32,
      drawName: 'First Draw',
      uniqueParticipants: true,
    },
    {
      drawSize: 32,
      drawName: 'Second Draw',
    },
  ];
  const {
    drawIds,
    venueIds: [venueId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    drawProfiles,
    venueProfiles,
    startDate,
    endDate,
  });

  const { tournamentId } = tournamentRecord;
  tournamentEngine.setState(tournamentRecord);

  const eventDrawEntries: string[][] = [];
  const eventEntries: string[][] = [];
  let {
    event: { eventId, entries },
    drawDefinition: {
      drawId,
      entries: drawEntries,
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId: drawIds[0] });
  let result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId,
    round: {
      tournamentId,
      eventId,
      drawId,
      structureId,
      roundNumber: 1,
    },
  });
  expect(result.success).toEqual(true);
  eventEntries.push(entries.map(getParticipantId));
  eventDrawEntries.push(drawEntries.map(getParticipantId));

  ({
    event: { eventId, entries },
    drawDefinition: {
      drawId,
      entries: drawEntries,
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId: drawIds[1] }));
  result = tournamentEngine.addSchedulingProfileRound({
    scheduleDate: startDate,
    venueId,
    round: {
      tournamentId,
      eventId,
      drawId,
      structureId,
      roundNumber: 1,
    },
  });
  expect(result.success).toEqual(true);
  eventEntries.push(entries.map(getParticipantId));
  eventDrawEntries.push(drawEntries.map(getParticipantId));

  // expect there to be no overlap in the entries between the two events
  expect(intersection(eventEntries[0], eventEntries[1]).length).toEqual(0);
  expect(intersection(eventDrawEntries[0], eventDrawEntries[1]).length).toEqual(0);

  result = tournamentEngine.scheduleProfileRounds({
    scheduleDates: [startDate],
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledDates).toEqual([startDate]);

  const scheduleAttributes = ['scheduledDate', 'scheduledTime'];
  const hasSchedule = ({ schedule }) => {
    const matchUpScheduleKeys = Object.keys(schedule)
      .filter((key) => scheduleAttributes.includes(key))
      .filter((key) => schedule[key]);
    return !!matchUpScheduleKeys.length;
  };

  const { matchUps } = tournamentEngine.allCompetitionMatchUps();
  const scheduledMatchUps = matchUps.filter(hasSchedule);
  expect(scheduledMatchUps.length).toEqual(32);

  const scheduledTimes = scheduledMatchUps.map(({ schedule }) => schedule.scheduledTime).sort();
  const timeMap = scheduledTimes.reduce((timesMapped, scheduledTime) => {
    const time = extractTime(scheduledTime);
    if (!timesMapped[time]) {
      timesMapped[time] = 1;
    } else {
      timesMapped[time] += 1;
    }
    return timesMapped;
  }, {});

  expect(timeMap).toEqual({
    '08:00': 10,
    '09:00': 3,
    '09:30': 3,
    '10:00': 4,
    '10:30': 3,
    '11:00': 3,
    '11:30': 4,
    '12:00': 2,
  });
});

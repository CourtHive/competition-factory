import { checkParticipantProfileInitialization } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkParticipantProfileInitialization';
import { checkRecoveryTime } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkRecoveryTime';
import { getMatchUpId } from '@Functions/global/extractors';
import { timeStringMinutes } from '@Tools/dateTime';
import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Constants
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { SINGLES_DOUBLES } from '@Constants/scheduleConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { PAIR } from '@Constants/participantConstants';

const venueId = 'venue1';
const scheduleDate = '2025-01-01';

it('separates a SINGLES and a DOUBLES matchUp by the type-change recovery', () => {
  // the SINGLES_DOUBLES recovery was computed but never reached the bookings, so only the 30 minutes applied
  const policyDefinitions = {
    [POLICY_TYPE_SCHEDULING]: {
      defaultTimes: {
        recoveryTimes: [{ minutes: { default: 30, [SINGLES_DOUBLES]: 180 } }],
        averageTimes: [{ minutes: { default: 90 } }],
      },
    },
  };
  // 8 individuals play SINGLES and, paired, the same 8 play DOUBLES
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8, participantType: PAIR },
    eventProfiles: [
      { eventType: SINGLES, drawProfiles: [{ drawSize: 8 }] },
      { eventType: DOUBLES, drawProfiles: [{ drawSize: 4 }] },
    ],
    venueProfiles: [{ startTime: '08:00', endTime: '23:00', courtsCount: 17, venueId }],
    endDate: '2025-01-03',
    startDate: scheduleDate,
    policyDefinitions,
  });
  competitionEngine.setState(tournamentRecord);

  const { tournamentId } = tournamentRecord;
  const [singles, doubles] = tournamentRecord.events.map((event) => ({
    structureId: event.drawDefinitions[0].structures[0].structureId,
    drawId: event.drawDefinitions[0].drawId,
    eventId: event.eventId,
    tournamentId,
  }));
  for (const round of [singles, doubles]) {
    const result: any = competitionEngine.addSchedulingProfileRound({
      round: { ...round, roundNumber: 1 },
      scheduleDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  }

  const result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [scheduleDate] });
  expect(result.success).toEqual(true);

  const times = (drawId) =>
    competitionEngine
      .allCompetitionMatchUps({ inContext: true })
      .matchUps.filter((matchUp) => matchUp.drawId === drawId && matchUp.roundNumber === 1)
      .map(({ schedule }) => schedule?.scheduledTime);

  expect(times(singles.drawId)).toEqual(['08:00', '08:00', '08:00', '08:00']);
  // 08:00 + 90 average + 180 SINGLES_DOUBLES recovery
  const doublesTimes = times(doubles.drawId);
  expect(doublesTimes.length).toEqual(2);
  expect(doublesTimes.every((time) => timeStringMinutes(time) >= timeStringMinutes('12:30'))).toEqual(true);
});

// a request conflicted only when the matchUp's start or projected end fell strictly inside its window
it.each([
  ['holds the start', '09:30', '10:30'],
  ['lies inside the matchUp', '10:15', '11:00'],
  ['matches the matchUp exactly', '10:00', '11:30'],
])('honours a DO_NOT_SCHEDULE request whose window %s', (_label, startTime, endTime) => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '10:00', endTime: '20:00', courtsCount: 1 }],
    drawProfiles: [{ drawSize: 2 }],
    startDate: scheduleDate,
    endDate: '2025-01-03',
  });
  competitionEngine.setState(tournamentRecord);

  const [target] = competitionEngine.allCompetitionMatchUps({ inContext: true }).matchUps;
  const personId = target.sides[0].participant.person.personId;
  let result: any = competitionEngine.addPersonRequests({
    requests: [{ date: scheduleDate, startTime, endTime, requestType: DO_NOT_SCHEDULE }],
    personId,
  });
  expect(result.success).toEqual(true);

  result = competitionEngine.scheduleMatchUps({
    matchUpIds: competitionEngine.allCompetitionMatchUps().matchUps.map(getMatchUpId),
    averageMatchUpMinutes: 90,
    scheduleDate,
  });
  expect(result.success).toEqual(true);

  const [scheduled] = competitionEngine.allCompetitionMatchUps({ inContext: true }).matchUps;
  expect(scheduled.schedule?.scheduledTime).toBeDefined();
  // a 90 minute matchUp starting at 10:00 would overlap the request window
  expect(scheduled.schedule?.scheduledTime?.slice(-5)).not.toEqual('10:00');
});

it('honours a DO_NOT_SCHEDULE request of a person in a DOUBLES pair that can only potentially reach the matchUp', () => {
  // the potential participants of a DOUBLES matchUp are pairs, and a pair has no person: R4
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 2 }],
    drawProfiles: [{ drawSize: 4, eventType: DOUBLES }],
    endDate: '2025-01-03',
    startDate: scheduleDate,
    setState: true,
  });
  const matchUps = competitionEngine.allCompetitionMatchUps({ inContext: true, nextMatchUps: true }).matchUps;
  const final = matchUps.find(({ roundNumber }) => roundNumber === 2);
  const pair = final.potentialParticipants.flat()[0];
  const { personId } = pair.individualParticipants[0].person;

  let result: any = competitionEngine.addPersonRequests({
    requests: [{ date: scheduleDate, startTime: '08:00', endTime: '14:00', requestType: DO_NOT_SCHEDULE }],
    personId,
  });
  expect(result.success).toEqual(true);

  result = competitionEngine.scheduleMatchUps({
    matchUpIds: [final.matchUpId],
    averageMatchUpMinutes: 90,
    scheduleDate,
  });
  expect(result.success).toEqual(true);

  const scheduledTime = competitionEngine
    .allCompetitionMatchUps({ inContext: true })
    .matchUps.find(({ matchUpId }) => matchUpId === final.matchUpId).schedule?.scheduledTime;
  expect(scheduledTime).toBeDefined();
  // nothing may overlap 08:00–14:00 for that person
  expect(timeStringMinutes(scheduledTime.slice(-5))).toBeGreaterThanOrEqual(timeStringMinutes('14:00'));
});

it.each([
  [30, '23:00'],
  [120, undefined],
])('a recovery of %s minutes after a 22:00 matchUp leaves the next round at %s', (recoveryMinutes, expected) => {
  // R5: a recovery ending past midnight wrapped to 00:30 and read as already over, so R2 was placed at 23:00
  const venueId = 'lateVenue';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: {
      [POLICY_TYPE_SCHEDULING]: {
        defaultTimes: {
          recoveryTimes: [{ minutes: { default: recoveryMinutes } }],
          averageTimes: [{ minutes: { default: 30 } }],
        },
      },
    },
    venueProfiles: [{ startTime: '22:00', endTime: '23:59', courtsCount: 2, venueId }],
    drawProfiles: [{ drawSize: 4 }],
    endDate: '2025-01-03',
    startDate: scheduleDate,
    setState: true,
  });
  const { tournamentId } = tournamentRecord;
  const { eventId, drawDefinitions } = tournamentRecord.events[0];
  const { drawId, structures } = drawDefinitions[0];
  for (const roundNumber of [1, 2]) {
    const result: any = competitionEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId: structures[0].structureId, roundNumber },
      scheduleDate,
      venueId,
    });
    expect(result.success).toEqual(true);
  }

  const result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [scheduleDate], periodLength: 30 });
  expect(result.success).toEqual(true);

  const timeOf = (roundNumber) =>
    competitionEngine
      .allCompetitionMatchUps({ inContext: true })
      .matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber)
      .map(({ schedule }) => schedule?.scheduledTime);
  expect(timeOf(1)).toEqual(['22:00', '22:00']);
  expect(timeOf(2)).toEqual([expected]);
});

it('builds the window of a matchUp being placed from its new time, not from a stored endTime', () => {
  // R6: a matchUp re-placed with a stored endTime got a window that ended before it started, so a 14:00 placement
  // was not checked against a 14:30 booking of the same participant
  const individualParticipantProfiles: any = {};
  checkParticipantProfileInitialization({ individualParticipantProfiles, participantId: 'A' });
  individualParticipantProfiles.A.timeAfterRecovery = '16:00';
  individualParticipantProfiles.A.bookings.push({ scheduleTime: '14:30', timeAfterRecovery: '16:00' });

  const result = checkRecoveryTime({
    reachability: {
      matchUps: { M: { certain: ['A'], potential: [], nearPotential: [] } },
      upstream: {},
      linkedTargets: {},
    },
    matchUp: { matchUpId: 'M', drawId: 'draw', matchUpType: SINGLES, schedule: { endTime: '09:00' } } as any,
    details: { minutesMap: { M: { averageMinutes: 90, recoveryMinutes: 30 } } },
    matchUpNotBeforeTimes: {},
    individualParticipantProfiles,
    scheduleTime: '14:00',
  });
  expect(result.enoughTime).toEqual(false);
  expect(result.blockingParticipantIds).toEqual(['A']);
});

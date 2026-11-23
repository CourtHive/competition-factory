import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * A court booking that runs past midnight (scheduling-pipeline.md § 9.8): its own day holds the court to 23:59, and
 * the next date holds it from 00:00 for the rest. A booking's end used to wrap, so a matchUp at 23:30 for 90 minutes
 * ended at 01:00 of the same day, and the court was free at the next date's midnight.
 */

const DAY_1 = '2026-06-22';
const DAY_2 = '2026-06-23';

function scenario() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1, venueId: 'venueId', startTime: '00:00', endTime: '23:59' }],
    drawProfiles: [{ drawSize: 8, drawId: 'drawId' }],
    startDate: DAY_1,
    endDate: DAY_2,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      scheduling: {
        defaultTimes: {
          averageTimes: [{ minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 0 } }],
        },
      },
    },
  });
  const { courts } = tournamentEngine.getVenuesAndCourts();
  const [late, next] = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } })
    .matchUps.map((matchUp) => matchUp.matchUpId);
  return { courtId: courts[0].courtId, late, next };
}

it('a matchUp that runs past midnight holds its court into the next date', () => {
  const { courtId, late, next } = scenario();

  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: DAY_1, scheduledTime: '23:30', venueId: 'venueId', courtId },
    matchUpId: late,
    drawId: 'drawId',
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_2, matchUpIds: [next] });
  expect(result.success).toEqual(true);

  const { schedule } = tournamentEngine.findMatchUp({ matchUpId: next, drawId: 'drawId', inContext: true }).matchUp;
  expect(schedule.scheduledDate).toEqual(DAY_2);
  // the court is busy from 00:00 to 01:00 with the matchUp that started at 23:30
  expect(schedule.scheduledTime >= '01:00').toEqual(true);
});

it('a matchUp that ends before midnight leaves the next date untouched', () => {
  const { courtId, late, next } = scenario();

  tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: DAY_1, scheduledTime: '22:00', venueId: 'venueId', courtId },
    matchUpId: late,
    drawId: 'drawId',
  });
  const result: any = tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_2, matchUpIds: [next] });
  expect(result.success).toEqual(true);

  const { schedule } = tournamentEngine.findMatchUp({ matchUpId: next, drawId: 'drawId', inContext: true }).matchUp;
  expect(schedule.scheduledTime).toEqual('00:00');
});

it('the profile scheduler reads a booking carried from the day before', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1, venueId: 'venueId', startTime: '00:00', endTime: '23:59' }],
    drawProfiles: [
      { drawSize: 2, drawId: 'first', eventId: 'first' },
      { drawSize: 2, drawId: 'second', eventId: 'second' },
    ],
    startDate: DAY_1,
    endDate: DAY_2,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      scheduling: {
        defaultTimes: {
          averageTimes: [{ minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 0 } }],
        },
      },
    },
  });
  const courtId = tournamentEngine.getVenuesAndCourts().courts[0].courtId;
  const matchUpOf = (drawId: string) =>
    tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } }).matchUps[0];

  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: DAY_1, scheduledTime: '23:30', venueId: 'venueId', courtId },
    matchUpId: matchUpOf('first').matchUpId,
    drawId: 'first',
  });
  expect(result.success).toEqual(true);

  const { rounds } = tournamentEngine.getRounds();
  const secondRound = rounds.filter((round) => round.drawId === 'second');
  result = tournamentEngine.setSchedulingProfile({
    schedulingProfile: [{ scheduleDate: DAY_2, venues: [{ venueId: 'venueId', rounds: secondRound }] }],
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAY_2] });
  expect(result.success).toEqual(true);

  const { schedule } = matchUpOf('second');
  expect(schedule.scheduledDate).toEqual(DAY_2);
  expect(schedule.scheduledTime >= '01:00').toEqual(true);
});

/**
 * A recovery that runs past midnight (§ 9.8): a matchUp at 23:00 with 90 minutes and a 60-minute recovery holds its
 * participants until 01:30 of the next date, so the round it feeds is not placed before then. Recovery used to stop at
 * 23:59 of its own day, and the next date started clean.
 */
function recoveryScenario({ dayOneCourtTimes }: { dayOneCourtTimes?: { startTime: string; endTime: string } } = {}) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2, venueId: 'venueId', startTime: '00:00', endTime: '23:59' }],
    drawProfiles: [{ drawSize: 4, drawId: 'drawId' }],
    startDate: DAY_1,
    endDate: DAY_2,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      scheduling: {
        defaultTimes: {
          averageTimes: [{ minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 60 } }],
        },
      },
    },
  });
  const courts = tournamentEngine.getVenuesAndCourts().courts;
  if (dayOneCourtTimes) {
    for (const { courtId } of courts) {
      tournamentEngine.modifyCourtAvailability({
        dateAvailability: [
          { date: DAY_1, ...dayOneCourtTimes },
          { startTime: '00:00', endTime: '23:59' },
        ],
        courtId,
      });
    }
  }
  const roundOf = (roundNumber: number) =>
    tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [roundNumber] } }).matchUps;
  const { rounds } = tournamentEngine.getRounds();
  return { courts, roundOf, rounds };
}

it('a stored matchUp whose recovery runs past midnight holds the round it feeds', () => {
  const { courts, roundOf, rounds } = recoveryScenario();
  roundOf(1).forEach((matchUp, index) => {
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAY_1, scheduledTime: '23:00', venueId: 'venueId', courtId: courts[index].courtId },
      matchUpId: matchUp.matchUpId,
      drawId: 'drawId',
    });
    expect(result.success).toEqual(true);
  });

  const final = rounds.filter((round) => round.roundNumber === 2);
  let result: any = tournamentEngine.setSchedulingProfile({
    schedulingProfile: [{ scheduleDate: DAY_2, venues: [{ venueId: 'venueId', rounds: final }] }],
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAY_2] });
  expect(result.success).toEqual(true);

  const [{ schedule }] = roundOf(2);
  expect(schedule.scheduledDate).toEqual(DAY_2);
  // 23:00 + 90 minutes of play + 60 of recovery
  expect(schedule.scheduledTime >= '01:30').toEqual(true);
});

it('a matchUp the same run places late on the day before holds the round it feeds', () => {
  const { roundOf, rounds } = recoveryScenario({ dayOneCourtTimes: { startTime: '22:00', endTime: '23:59' } });

  const roundsOf = (roundNumber: number) => rounds.filter((round) => round.roundNumber === roundNumber);
  let result: any = tournamentEngine.setSchedulingProfile({
    schedulingProfile: [
      { scheduleDate: DAY_1, venues: [{ venueId: 'venueId', rounds: roundsOf(1) }] },
      { scheduleDate: DAY_2, venues: [{ venueId: 'venueId', rounds: roundsOf(2) }] },
    ],
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAY_1, DAY_2] });
  expect(result.success).toEqual(true);

  expect(roundOf(1).map(({ schedule }) => [schedule.scheduledDate, schedule.scheduledTime])).toEqual([
    [DAY_1, '22:00'],
    [DAY_1, '22:00'],
  ]);
  const [{ schedule }] = roundOf(2);
  expect(schedule.scheduledDate).toEqual(DAY_2);
  // 22:00 + 90 minutes of play, ending at 23:30, + 60 of recovery
  expect(schedule.scheduledTime >= '00:30').toEqual(true);
});

it('a recovery that ends before midnight leaves the next date free from 00:00', () => {
  const { courts, roundOf, rounds } = recoveryScenario();
  roundOf(1).forEach((matchUp, index) => {
    tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAY_1, scheduledTime: '21:00', venueId: 'venueId', courtId: courts[index].courtId },
      matchUpId: matchUp.matchUpId,
      drawId: 'drawId',
    });
  });
  tournamentEngine.setSchedulingProfile({
    schedulingProfile: [
      { scheduleDate: DAY_2, venues: [{ venueId: 'venueId', rounds: rounds.filter((r) => r.roundNumber === 2) }] },
    ],
  });
  const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAY_2] });
  expect(result.success).toEqual(true);
  expect(roundOf(2)[0].schedule.scheduledTime).toEqual('00:00');
});

it("a participant's recovery past midnight holds them in another event the next date", () => {
  const {
    tournamentRecord: { participants },
  } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2, venueId: 'venueId', startTime: '00:00', endTime: '23:59' }],
    drawProfiles: [{ drawSize: 2, drawId: 'late', eventId: 'late' }],
    startDate: DAY_1,
    endDate: DAY_2,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: {
      scheduling: {
        defaultTimes: {
          averageTimes: [{ minutes: { default: 90 } }],
          recoveryTimes: [{ minutes: { default: 60 } }],
        },
      },
    },
  });
  // the same two players in a second event
  const participantIds = participants.map(({ participantId }) => participantId);
  let result: any = tournamentEngine.addEvent({ event: { eventId: 'next', eventName: 'Next' } });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({ eventId: 'next', participantIds });
  expect(result.success).toEqual(true);
  result = tournamentEngine.generateDrawDefinition({ eventId: 'next', drawId: 'next', drawSize: 2 });
  result = tournamentEngine.addDrawDefinition({ eventId: 'next', drawDefinition: result.drawDefinition });
  expect(result.success).toEqual(true);

  const matchUpOf = (drawId: string) =>
    tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } }).matchUps[0];
  const courtId = tournamentEngine.getVenuesAndCourts().courts[0].courtId;
  result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: DAY_1, scheduledTime: '23:00', venueId: 'venueId', courtId },
    matchUpId: matchUpOf('late').matchUpId,
    drawId: 'late',
  });
  expect(result.success).toEqual(true);

  const nextRounds = tournamentEngine.getRounds().rounds.filter((round) => round.drawId === 'next');
  tournamentEngine.setSchedulingProfile({
    schedulingProfile: [{ scheduleDate: DAY_2, venues: [{ venueId: 'venueId', rounds: nextRounds }] }],
  });
  result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAY_2] });
  expect(result.success).toEqual(true);

  const { schedule } = matchUpOf('next');
  expect(schedule.scheduledDate).toEqual(DAY_2);
  expect(schedule.scheduledTime >= '01:30').toEqual(true);
});

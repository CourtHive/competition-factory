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

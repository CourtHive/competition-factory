import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';
import { sameDay } from '@Tools/dateTime';

/*
 * Two values are on the same day when their date parts, as written, are equal (scheduling-pipeline.md § 3.8 rule 7).
 * `sameDay` parsed with `Date` and compared in the runtime's zone, so a zoned date-time could fall on another day, and
 * an unzoned one did west of UTC: a profile date written as a date-time made a second date entry whose plan replaced
 * the first, and the direct scheduler stopped seeing the matchUps already timed on the date.
 */

const D = '2026-09-09';
const ZONED = '2026-09-09T22:00:00-05:00';

describe('sameDay compares the date parts as written', () => {
  it('ignores the time and any zone designator', () => {
    expect(sameDay(D, ZONED)).toEqual(true);
    expect(sameDay(D, '2026-09-09T01:00:00+05:00')).toEqual(true);
    expect(sameDay(D, '2026-09-09T22:00:00Z')).toEqual(true);
    expect(sameDay('2026-09-09T23:30', '2026-09-09T00:15')).toEqual(true);
    expect(sameDay(D, '2026-09-10')).toEqual(false);
  });

  it('a string that is not a date is the same day as nothing', () => {
    expect(sameDay('2026-02-30', '2026-02-30')).toEqual(false);
    expect(sameDay(D, '2026-09-09 10:00')).toEqual(false);
    expect(sameDay(undefined, D)).toEqual(false);
  });

  it('two Date objects are still compared in the runtime zone', () => {
    expect(sameDay(new Date(2026, 8, 9, 1), new Date(2026, 8, 9, 23))).toEqual(true);
    expect(sameDay(new Date(2026, 8, 9), new Date(2026, 8, 10))).toEqual(false);
  });
});

function setup() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    venueProfiles: [{ courtsCount: 8, startTime: '08:00', endTime: '20:00', venueId: 'v' }],
    drawProfiles: [{ drawId: 'd', drawSize: 16, idPrefix: 'm' }],
    startDate: D,
    endDate: '2026-09-11',
  });
  tournamentEngine.setState(tournamentRecord);
  const event = tournamentRecord.events[0];
  const round = {
    tournamentId: tournamentRecord.tournamentId,
    structureId: event.drawDefinitions[0].structures[0].structureId,
    eventId: event.eventId,
    drawId: 'd',
  };
  return { round };
}

const timesOfRound = (roundNumber: number) =>
  tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber && matchUp.schedule?.scheduledTime)
    .map((matchUp) => `${matchUp.schedule.scheduledDate} ${matchUp.schedule.scheduledTime}`)
    .sort();

describe('a profile date written as a date-time is its calendar day', () => {
  it('merges into the existing date, is stored as the day, and every round on it is scheduled', () => {
    const { round } = setup();
    let result: any = tournamentEngine.addSchedulingProfileRound({
      round: { ...round, roundNumber: 1 },
      scheduleDate: D,
      venueId: 'v',
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addSchedulingProfileRound({
      round: { ...round, roundNumber: 2 },
      scheduleDate: ZONED,
      venueId: 'v',
    });
    expect(result.success).toEqual(true);

    const { schedulingProfile } = tournamentEngine.getSchedulingProfile();
    expect(schedulingProfile.map(({ scheduleDate }) => scheduleDate)).toEqual([D]);
    expect(schedulingProfile[0].venues[0].rounds.length).toEqual(2);

    result = tournamentEngine.scheduleProfileRounds({});
    expect(result.success).toEqual(true);
    expect(result.scheduledDates).toEqual([D]);
    expect(timesOfRound(1).length).toEqual(8);
    expect(timesOfRound(2).length).toEqual(4);
  });

  it('a new profile date given as a date-time is stored as the day', () => {
    const { round } = setup();
    const result = tournamentEngine.addSchedulingProfileRound({
      round: { ...round, roundNumber: 1 },
      scheduleDate: ZONED,
      venueId: 'v',
    });
    expect(result.success).toEqual(true);
    expect(tournamentEngine.getSchedulingProfile().schedulingProfile[0].scheduleDate).toEqual(D);
  });
});

describe('the direct scheduler sees the matchUps already timed on the day, however the date is written', () => {
  it('a date-time scheduleDate places round 2 exactly as the plain date does', () => {
    const run = (secondDate: string) => {
      setup();
      const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
      const idsOf = (roundNumber: number) =>
        matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber).map(({ matchUpId }) => matchUpId);
      expect(tournamentEngine.scheduleMatchUps({ scheduleDate: D, matchUpIds: idsOf(1) }).success).toEqual(true);
      expect(tournamentEngine.scheduleMatchUps({ scheduleDate: secondDate, matchUpIds: idsOf(2) }).success).toEqual(
        true,
      );
      return timesOfRound(2);
    };

    const plain = run(D);
    expect(plain.length).toEqual(4);
    expect(run(ZONED)).toEqual(plain);
  });
});

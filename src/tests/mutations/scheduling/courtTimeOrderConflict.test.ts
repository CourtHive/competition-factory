import { courtTimeOrderConflicts } from '@Mutate/matchUps/schedule/schedulers/proScheduler/courtTimeOrder';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { CONFLICT_COURT_TIME_ORDER, CONFLICT_MATCHUP_ORDER, SCHEDULE_WARNING } from '@Constants/scheduleConstants';
import {
  WALKOVER,
  DOUBLE_WALKOVER,
  CANCELLED,
  DEAD_RUBBER,
  BYE,
  COMPLETED,
  TO_BE_PLAYED,
  IN_PROGRESS,
  DEFAULTED,
  DOUBLE_DEFAULT,
  ABANDONED,
  RETIRED,
} from '@Constants/matchUpStatusConstants';

/**
 * CONFLICT_COURT_TIME_ORDER — a court's times out of step with its order of play.
 *
 * TMX detected this on its own until now (`courtTimeOrderIssues.ts`), because `proConflicts` never read
 * `scheduledTime`. Reported from production, 2026-10-11: the 08:00 match on Court 12 was a
 * walkover, so the director put the next 08:00 match on that court, and the warning fired between them
 * though only one was ever played.
 */

const DATE = '2026-10-11';

const slot = (matchUpId: string, courtOrder: any, scheduledTime?: string, extra: any = {}): any => ({
  matchUpId,
  schedule: { courtId: extra.courtId ?? 'c1', courtOrder, scheduledTime, scheduledDate: extra.scheduledDate ?? DATE },
  ...(extra.matchUpStatus ? { matchUpStatus: extra.matchUpStatus } : {}),
});

const pairs = (matchUps: any[]) =>
  courtTimeOrderConflicts(matchUps).map(({ earlierMatchUpId, matchUpId }) => [earlierMatchUpId, matchUpId]);

describe('courtTimeOrderConflicts', () => {
  it('reports a later courtOrder at an earlier or equal time, against the matchUp before it', () => {
    expect(pairs([slot('a', 1, '14:00'), slot('b', 2, '09:00')])).toEqual([['a', 'b']]);
    expect(pairs([slot('a', 1, '08:00'), slot('b', 2, '08:00')])).toEqual([['a', 'b']]);
  });

  it('reports nothing when times rise with the order of play', () => {
    expect(pairs([slot('a', 1, '08:00'), slot('b', 2, '09:00'), slot('c', '3', '10:30')])).toEqual([]);
  });

  it('compares adjacent matchUps only, so each break is reported once', () => {
    expect(pairs([slot('a', 1, '12:00'), slot('b', 2, '10:00'), slot('c', 3, '11:00')])).toEqual([['a', 'b']]);
  });

  it('keeps courts and dates apart', () => {
    expect(pairs([slot('a', 1, '14:00'), slot('b', 2, '09:00', { courtId: 'c2' })])).toEqual([]);
    expect(pairs([slot('a', 1, '14:00'), slot('b', 2, '09:00', { scheduledDate: '2026-10-12' })])).toEqual([]);
  });

  it('skips a matchUp with no court, order or readable time, without breaking the chain', () => {
    const noCourt = { matchUpId: 'x', schedule: { courtOrder: 2, scheduledTime: '07:00' } };
    expect(pairs([slot('a', 1, '10:00'), noCourt, slot('b', 3, '09:00')])).toEqual([['a', 'b']]);
    expect(pairs([slot('a', 1, '10:00'), slot('x', undefined, '07:00'), slot('b', 3, '09:00')])).toEqual([['a', 'b']]);
    expect(pairs([slot('a', 1, '10:00'), slot('x', 2, 'later'), slot('b', 3, '09:00')])).toEqual([['a', 'b']]);
    expect(pairs([{ matchUpId: 'y' }, slot('a', 1, '10:00')])).toEqual([]);
  });

  it('compares matchUps that carry no date as one day', () => {
    const undated = (matchUpId: string, courtOrder: number, scheduledTime: string) => ({
      matchUpId,
      schedule: { courtId: 'c1', courtOrder, scheduledTime },
    });
    expect(pairs([undated('a', 1, '14:00'), undated('b', 2, '09:00')])).toEqual([['a', 'b']]);
  });

  it('leaves two matchUps in the same courtOrder to the double-booking check', () => {
    expect(pairs([slot('a', 1, '10:00'), slot('b', 1, '09:00')])).toEqual([]);
  });

  it('reads a time carried on an ISO date-time', () => {
    expect(pairs([slot('a', 1, `${DATE}T14:00`), slot('b', 2, `${DATE}T09:00`)])).toEqual([['a', 'b']]);
  });

  it.each([WALKOVER, DOUBLE_WALKOVER, CANCELLED, DEAD_RUBBER, BYE])(
    'a %s uses no court time, so the matchUp put on its court at the same time is not out of order',
    (matchUpStatus) => {
      expect(pairs([slot('a', 1, '08:00', { matchUpStatus }), slot('b', 2, '08:00')])).toEqual([]);
      // and the chain runs on past it
      const chain = [slot('a', 1, '10:00'), slot('x', 2, '11:00', { matchUpStatus }), slot('b', 3, '09:00')];
      expect(pairs(chain)).toEqual([['a', 'b']]);
    },
  );

  it.each([COMPLETED, TO_BE_PLAYED, IN_PROGRESS, DEFAULTED, DOUBLE_DEFAULT, ABANDONED, RETIRED])(
    'a %s still counts, since the court may have been used',
    (matchUpStatus) => {
      expect(pairs([slot('a', 1, '08:00', { matchUpStatus }), slot('b', 2, '08:00')])).toEqual([['a', 'b']]);
    },
  );
});

function setup() {
  tournamentEngine.reset();
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles: [{ courtsCount: 2, startTime: '07:00', endTime: '20:00' }],
    startDate: DATE,
    endDate: DATE,
    setState: true,
  });
  const { courts } = tournamentEngine.getVenuesAndCourts();
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const find = (roundNumber: number, roundPosition: number) =>
    matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);
  return { drawId, court: courts[0], find };
}

function place(drawId: string, matchUpId: string, court: any, courtOrder: number, scheduledTime: string) {
  const schedule = { courtId: court.courtId, venueId: court.venueId, courtOrder, scheduledDate: DATE, scheduledTime };
  const result = tournamentEngine.addMatchUpScheduleItems({ schedule, matchUpId, drawId });
  expect(result.success).toEqual(true);
}

function issues() {
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true, nextMatchUps: true });
  const scheduled = matchUps.filter((m: any) => m.schedule?.courtId && m.schedule?.scheduledDate === DATE);
  const { rowIssues } = tournamentEngine.proConflicts({ matchUps: scheduled });
  return Object.values(rowIssues ?? {}).flat() as any[];
}

describe('proConflicts reports CONFLICT_COURT_TIME_ORDER', () => {
  it('as a WARNING on the later matchUp, naming the one before it', () => {
    const { drawId, court, find } = setup();
    const [first, second] = [find(1, 1), find(1, 2)];
    place(drawId, first.matchUpId, court, 1, '14:00');
    place(drawId, second.matchUpId, court, 2, '09:00');

    const flagged = issues().filter((issue) => issue.issueType === CONFLICT_COURT_TIME_ORDER);
    expect(flagged).toEqual([
      {
        matchUpId: second.matchUpId,
        issue: SCHEDULE_WARNING,
        issueType: CONFLICT_COURT_TIME_ORDER,
        issueIds: [first.matchUpId],
      },
    ]);
  });

  it('CONTROL: not when the times rise with the order of play', () => {
    const { drawId, court, find } = setup();
    place(drawId, find(1, 1).matchUpId, court, 1, '08:00');
    place(drawId, find(1, 2).matchUpId, court, 2, '09:00');
    expect(issues().filter((issue) => issue.issueType === CONFLICT_COURT_TIME_ORDER)).toEqual([]);
  });

  it('not for the matchUp a director put on the court of a recorded walkover at the same time (the production case)', () => {
    const { drawId, court, find } = setup();
    const [walkover, next] = [find(1, 1), find(1, 2)];
    place(drawId, walkover.matchUpId, court, 1, '08:00');
    place(drawId, next.matchUpId, court, 2, '08:00');
    const recorded = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      matchUpId: walkover.matchUpId,
      drawId,
    });
    expect(recorded.success).toEqual(true);

    expect(issues().filter((issue) => issue.issueType === CONFLICT_COURT_TIME_ORDER)).toEqual([]);
  });

  it('stands behind a stronger issue on the same matchUp', () => {
    // the round-2 matchUp in courtOrder 1 and its round-1 feeder in courtOrder 2, an hour EARLIER: the
    // feeder is out of time order, but it is also scheduled after the matchUp it feeds, which outranks it
    const { drawId, court, find } = setup();
    const [feeder, fed] = [find(1, 1), find(2, 1)];
    place(drawId, fed.matchUpId, court, 1, '09:00');
    place(drawId, feeder.matchUpId, court, 2, '08:00');

    const onFeeder = issues().filter((issue) => issue.matchUpId === feeder.matchUpId);
    expect(onFeeder.map((issue) => issue.issueType)).toEqual([CONFLICT_MATCHUP_ORDER]);
    expect(onFeeder[0].issue).not.toEqual(SCHEDULE_WARNING);
  });
});

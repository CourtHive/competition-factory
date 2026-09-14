import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe, beforeEach } from 'vitest';

// constants
import { ASSIGN_COURT, SCHEDULED_DATE, SCHEDULED_TIME } from '@Constants/timeItemConstants';

/**
 * `calledAt` says "called to court" — to THAT court, on THAT day. Nothing but
 * `clearScheduledMatchUps` used to clear it, so re-dating a matchUp (which
 * already sheds courtOrder/courtId/venueId as stale grid position) left a stamp
 * behind asserting a call to a court the matchUp is no longer on.
 *
 * Measured on a live tournament: four quarterfinals were called on the afternoon
 * of one day, then moved to 08:00 the next with court and venue removed. Their
 * schedules carried `{ scheduledDate, scheduledTime, calledAt }` and nothing
 * else, and the call-timing variance report read them as called 1009 and 1026
 * minutes early.
 *
 * A lifecycle transition still does NOT retire the stamp — only a change of
 * placement does.
 */

const DAY_ONE = '2026-06-15';
const DAY_TWO = '2026-06-16';
const CALLED_AT = '2026-06-15T18:54:53.079Z';

function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
    venueProfiles: [{ courtsCount: 3 }],
    endDate: DAY_TWO,
    startDate: DAY_ONE,
    setState: true,
  });
  const { courts }: any = tournamentEngine.getVenuesAndCourts();
  const { matchUps }: any = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  return { court: courts[0], matchUp: matchUps[0] };
}

function readSchedule(drawId: string, matchUpId: string) {
  return tournamentEngine.findMatchUp({ matchUpId, drawId }).matchUp.schedule;
}

function place(drawId: string, matchUpId: string, court: any) {
  const result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: {
      scheduledDate: DAY_ONE,
      scheduledTime: '14:00',
      venueId: court.venueId,
      courtId: court.courtId,
      calledAt: CALLED_AT,
      courtOrder: 2,
    },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(readSchedule(drawId, matchUpId).calledAt).toEqual(CALLED_AT);
}

describe('a placement change retires calledAt', () => {
  beforeEach(() => {
    tournamentEngine.reset();
  });

  it('clears the stamp when a re-date sheds the prior day grid position', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;
    place(drawId, matchUpId, court);

    // The production shape: a re-date carrying only date and time.
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAY_TWO, scheduledTime: '08:00' },
      removePriorValues: true,
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    const schedule = readSchedule(drawId, matchUpId);
    expect(schedule.scheduledDate).toEqual(DAY_TWO);
    expect(schedule.scheduledTime).toEqual('08:00');
    // The three that were already shed, and the fourth that was not.
    expect(schedule.courtId).toBeUndefined();
    expect(schedule.venueId).toBeUndefined();
    expect(schedule.courtOrder).toBeUndefined();
    expect(schedule.calledAt).toBeUndefined();
  });

  it('keeps a calledAt supplied by the same call that re-dates', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;
    place(drawId, matchUpId, court);

    const recalled = '2026-06-16T12:05:00.000Z';
    tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAY_TWO, scheduledTime: '08:00', calledAt: recalled },
      removePriorValues: true,
      matchUpId,
      drawId,
    });

    expect(readSchedule(drawId, matchUpId).calledAt).toEqual(recalled);
  });

  it('keeps the stamp when the time moves but the day does not', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;
    place(drawId, matchUpId, court);

    tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAY_ONE, scheduledTime: '15:30' },
      matchUpId,
      drawId,
    });

    const schedule = readSchedule(drawId, matchUpId);
    expect(schedule.scheduledTime).toEqual('15:30');
    // Same day, same court — the call still describes where the matchUp is.
    expect(schedule.courtId).toEqual(court.courtId);
    expect(schedule.calledAt).toEqual(CALLED_AT);
  });

  it('clears the stamp when clearMatchUpSchedule clears the placement', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;
    place(drawId, matchUpId, court);

    const result: any = tournamentEngine.clearMatchUpSchedule({ matchUpId, drawId });
    expect(result.success).toEqual(true);
    expect(readSchedule(drawId, matchUpId)?.calledAt).toBeUndefined();
  });

  it('leaves the stamp alone when the clear does not touch the placement', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;
    place(drawId, matchUpId, court);

    const result: any = tournamentEngine.clearMatchUpSchedule({
      scheduleAttributes: ['courtAnnotation'],
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(readSchedule(drawId, matchUpId).calledAt).toEqual(CALLED_AT);
  });

  it('clears the stamp for each of the placement attributes on its own', () => {
    for (const itemType of [ASSIGN_COURT, SCHEDULED_DATE, SCHEDULED_TIME]) {
      tournamentEngine.reset();
      const { court, matchUp } = setup();
      const { drawId, matchUpId } = matchUp;
      place(drawId, matchUpId, court);

      tournamentEngine.clearMatchUpSchedule({ scheduleAttributes: [itemType], matchUpId, drawId });
      expect(readSchedule(drawId, matchUpId)?.calledAt).toBeUndefined();
    }
  });
});

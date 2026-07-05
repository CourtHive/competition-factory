import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe, beforeEach } from 'vitest';

/**
 * A matchUp's `courtOrder` is a row on ONE specific day's schedule grid. When a
 * matchUp is moved to a different `scheduledDate`, the old `courtOrder` (and the
 * court/venue it was assigned to that day) refer to a different day's grid and
 * must NOT carry over — otherwise the match renders on the same numbered row on
 * the new day with empty rows above it.
 *
 * Regression: a production BOBOCA re-date (provisioner payload of
 * `{ scheduledDate, scheduledTime }` only, removePriorValues:true) left the prior
 * day's courtOrder attached, so the day's first matches appeared on rows 5-6.
 */
describe('changing scheduledDate clears stale grid position', () => {
  beforeEach(() => {
    tournamentEngine.reset();
  });

  function setup() {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 8 }],
      venueProfiles: [{ courtsCount: 3 }],
      startDate: '2024-01-01',
      endDate: '2024-01-07',
      setState: true,
    });
    const { courts } = tournamentEngine.getVenuesAndCourts();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
    return { court: courts[0], matchUp: matchUps[0] };
  }

  function readSchedule(drawId: string, matchUpId: string) {
    return tournamentEngine.findMatchUp({ matchUpId, drawId }).matchUp.schedule;
  }

  it('clears courtOrder/courtId/venueId when only the date changes', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;

    let result = tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-01', venueId: court.venueId, courtId: court.courtId, courtOrder: 5 },
    });
    expect(result.success).toEqual(true);

    let schedule = readSchedule(drawId, matchUpId);
    expect(schedule.courtOrder).toEqual(5);
    expect(schedule.courtId).toEqual(court.courtId);

    // Re-date with ONLY the date (mirrors the provisioner payload).
    result = tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-02', scheduledTime: '08:00' },
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);

    schedule = readSchedule(drawId, matchUpId);
    expect(schedule.scheduledDate).toEqual('2024-01-02');
    expect(schedule.courtOrder).toBeUndefined();
    expect(schedule.courtId).toBeUndefined();
    expect(schedule.venueId).toBeUndefined();
  });

  it('preserves grid position when the date is unchanged', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;

    tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-01', venueId: court.venueId, courtId: court.courtId, courtOrder: 3 },
    });

    // Re-applying the same date must not disturb the existing grid placement.
    const result = tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-01', scheduledTime: '09:00' },
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);

    const schedule = readSchedule(drawId, matchUpId);
    expect(schedule.courtOrder).toEqual(3);
    expect(schedule.courtId).toEqual(court.courtId);
  });

  it('respects an explicit courtOrder supplied alongside a date change', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;

    tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-01', venueId: court.venueId, courtId: court.courtId, courtOrder: 5 },
    });

    // A deliberate move to a new day AND a new row keeps the caller's courtOrder.
    const result = tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-02', venueId: court.venueId, courtId: court.courtId, courtOrder: 2 },
      removePriorValues: true,
    });
    expect(result.success).toEqual(true);

    const schedule = readSchedule(drawId, matchUpId);
    expect(schedule.scheduledDate).toEqual('2024-01-02');
    expect(schedule.courtOrder).toEqual(2);
  });
});

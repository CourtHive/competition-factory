import { expect, it, describe, beforeEach } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

/**
 * A matchUp's `courtOrder` is a row on ONE specific day's schedule grid. When a
 * matchUp is moved to a different `scheduledDate`, the old `courtOrder` (and the
 * court it was assigned to that day, with the venue that came with the court) refer
 * to a different day's grid and must NOT carry over — otherwise the match renders on
 * the same numbered row on the new day with empty rows above it. A venue placed
 * without a court is where the match is played, and stays.
 *
 * Regression: a production re-date (provisioner payload of
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

  // the schedule as stored on the record, not as a hydrated read builds it
  function storedSchedule(matchUpId: string) {
    const { tournamentRecord } = tournamentEngine.getTournament();
    const structures = tournamentRecord.events[0].drawDefinitions[0].structures;
    const stored = structures.flatMap((structure) => structure.matchUps).find((m) => m.matchUpId === matchUpId);
    return stored.schedule;
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

    // removed from the stored schedule, not written as empty values
    expect(Object.keys(storedSchedule(matchUpId)).sort()).toEqual(['scheduledDate', 'scheduledTime']);
  });

  it('keeps a venue placed without a court: the venue goes only with a court', () => {
    const { court, matchUp } = setup();
    const { drawId, matchUpId } = matchUp;

    // a timed scheduler places a matchUp at a venue with no court
    tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-01', scheduledTime: '10:00', venueId: court.venueId, courtOrder: 2 },
    });

    const result = tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId,
      schedule: { scheduledDate: '2024-01-02' },
    });
    expect(result.success).toEqual(true);

    expect(storedSchedule(matchUpId)).toEqual({
      scheduledDate: '2024-01-02',
      scheduledTime: '10:00',
      venueId: court.venueId,
    });
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

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { addDays } from '@Tools/dateTime';
import { expect, it } from 'vitest';

// constants
import { SCHEDULE_NOT_CLEARED } from '@Constants/errorConditionConstants';

/**
 * A FORCED DATE CHANGE THAT CANNOT UNSCHEDULE REFUSES BEFORE IT WRITES. `setTournamentDates({ force: true })` clears
 * the schedules a new range leaves outside it. When none can be cleared (each is schedule-locked) the call refuses with
 * SCHEDULE_NOT_CLEARED; it used to do so after writing the new dates, the events' dates and the courts' availability.
 */
const startDate = '2026-06-01';

function scheduled() {
  const drawId = 'drawId';
  mocksEngine.generateTournamentRecord({
    autoSchedule: true,
    schedulingProfile: [
      { venues: [{ venueId: 'venueId', rounds: [{ drawId, roundNumber: 1 }] }], scheduleDate: startDate },
      { venues: [{ venueId: 'venueId', rounds: [{ drawId, roundNumber: 2 }] }], scheduleDate: addDays(startDate, 1) },
    ],
    venueProfiles: [{ venueId: 'venueId', courtsCount: 4, startTime: '08:00', endTime: '21:00' }],
    drawProfiles: [{ idPrefix: 'm', drawId, drawSize: 32 }],
    endDate: addDays(startDate, 2),
    setState: true,
    startDate,
  });
  return tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((matchUp: any) => matchUp.schedule?.scheduledDate === startDate);
}

it('refuses with the record as it was when every schedule outside the new range is locked', () => {
  const outside = scheduled();
  expect(outside.length).toBeGreaterThan(0);
  for (const { matchUpId, drawId } of outside)
    expect(tournamentEngine.setMatchUpScheduleLock({ matchUpId, drawId, lock: {} }).success).toEqual(true);
  const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);

  const result: any = tournamentEngine.setTournamentDates({ startDate: addDays(startDate, 1), force: true });
  expect(result.error).toEqual(SCHEDULE_NOT_CLEARED);
  expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
});

it('control: unlocked, the same change unschedules them and moves the dates', () => {
  const outside = scheduled();
  const result: any = tournamentEngine.setTournamentDates({ startDate: addDays(startDate, 1), force: true });
  expect(result.success).toEqual(true);
  expect(result.unscheduledMatchUpIds).toHaveLength(outside.length);
  expect(tournamentEngine.getTournamentInfo().tournamentInfo.startDate).toEqual(addDays(startDate, 1));
});

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

const startDate = '2024-01-15';
const endDate = '2024-01-17';
const MATCHUP_ID = 'm-1-1';

function seed(schedule: { scheduledDate: string; scheduledTime?: string; courtOrder?: number }) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, idPrefix: 'm' }],
    venueProfiles: [{ courtsCount: 2 }],
    setState: true,
    startDate,
    endDate,
  });
  const { tournamentId } = tournamentRecord;
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  const { courts } = tournamentEngine.getVenuesAndCourts();
  const { courtId, venueId } = courts[0];
  const placement = schedule.courtOrder ? { courtId, venueId } : {};
  const result = tournamentEngine.bulkScheduleMatchUps({
    matchUpDetails: [{ matchUpId: MATCHUP_ID, drawId, tournamentId, schedule: { ...schedule, ...placement } }],
  });
  expect(result.scheduled).toEqual(1);
}

const scheduleOf = (matchUpId: string) =>
  tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpIds: [matchUpId] } }).matchUps[0].schedule;

const reschedule = (scheduleChange) =>
  tournamentEngine.bulkRescheduleMatchUps({ matchUpIds: [MATCHUP_ID], scheduleChange });

it('B1: a daysChange past endDate is refused even when a minutesChange is also given', () => {
  seed({ scheduledDate: endDate, scheduledTime: '10:00' });

  // the minutes verdict used to overwrite the days verdict: the matchUp was written to endDate + 1
  const result = reschedule({ daysChange: 1, minutesChange: 30 });
  expect(result.success).toEqual(true);
  expect(result.rescheduled).toEqual([]);
  expect(result.notRescheduled.map(({ matchUpId }) => matchUpId)).toEqual([MATCHUP_ID]);
  expect(scheduleOf(MATCHUP_ID).scheduledDate).toEqual(endDate);
  expect(scheduleOf(MATCHUP_ID).scheduledTime).toEqual('10:00');
});

it('B1: a time that would leave the day refuses the matchUp even when its daysChange is in range', () => {
  seed({ scheduledDate: startDate, scheduledTime: '23:30' });

  const result = reschedule({ daysChange: 1, minutesChange: 60 });
  expect(result.notRescheduled.map(({ matchUpId }) => matchUpId)).toEqual([MATCHUP_ID]);
  expect(scheduleOf(MATCHUP_ID).scheduledDate).toEqual(startDate);
});

it('B2: a minutesChange that lands on midnight is refused, not written as 00:00 of the same day', () => {
  seed({ scheduledDate: startDate, scheduledTime: '23:00' });

  // 23:00 + 60 is 24:00, the NEXT day's 00:00; it was accepted (> 1440) and written to this day
  const result = reschedule({ minutesChange: 60 });
  expect(result.notRescheduled.map(({ matchUpId }) => matchUpId)).toEqual([MATCHUP_ID]);
  expect(scheduleOf(MATCHUP_ID).scheduledTime).toEqual('23:00');

  // the last minute of the day is still a time on that day
  const accepted = reschedule({ minutesChange: 59 });
  expect(accepted.rescheduled.map(({ matchUpId }) => matchUpId)).toEqual([MATCHUP_ID]);
  expect(scheduleOf(MATCHUP_ID).scheduledTime).toEqual('23:59');
  expect(scheduleOf(MATCHUP_ID).scheduledDate).toEqual(startDate);
});

it('B3: a daysChange clears the prior day grid position, as re-dating through scheduleItems does', () => {
  seed({ scheduledDate: startDate, courtOrder: 3 });
  expect(scheduleOf(MATCHUP_ID).courtOrder).toEqual(3);

  const result = reschedule({ daysChange: 1 });
  expect(result.rescheduled.map(({ matchUpId }) => matchUpId)).toEqual([MATCHUP_ID]);

  // the 2024-01-15 row 3 on court 1 is not a position on 2024-01-16's grid
  const schedule = scheduleOf(MATCHUP_ID);
  expect(schedule.scheduledDate).toEqual('2024-01-16');
  expect(schedule.courtOrder).toBeUndefined();
  expect(schedule.courtId).toBeUndefined();
  expect(schedule.venueId).toBeUndefined();
});

it('B3: a minutesChange alone keeps the grid position', () => {
  seed({ scheduledDate: startDate, scheduledTime: '10:00', courtOrder: 2 });

  const result = reschedule({ minutesChange: 30 });
  expect(result.rescheduled.map(({ matchUpId }) => matchUpId)).toEqual([MATCHUP_ID]);
  const schedule = scheduleOf(MATCHUP_ID);
  expect(schedule.scheduledTime).toEqual('10:30');
  expect(schedule.courtOrder).toEqual(2);
  expect(schedule.courtId).toBeDefined();
});

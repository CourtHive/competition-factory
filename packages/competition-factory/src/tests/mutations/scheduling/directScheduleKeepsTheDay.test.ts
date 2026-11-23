import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * A listed matchUp dated on another day is scheduled on that day: the direct scheduler for one day never moves it,
 * and reports it in noTimeMatchUpIds (scheduling-pipeline.md § 6 rule 1, CA 2026-10-28). It used to take this day's
 * time and keep its own date, landing at the new time on the old day.
 */
const scheduleOf = (matchUpId: string) => tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule ?? {};

it('leaves a listed matchUp dated on another day where it is, and reports it', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    setState: true,
  });
  const r1 = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const [earlier, later] = r1;
  let result: any = tournamentEngine.addMatchUpScheduledDate({
    matchUpId: earlier.matchUpId,
    drawId: earlier.drawId,
    scheduledDate: '2026-10-01',
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.bulkScheduleMatchUps({
    schedule: { scheduledDate: '2026-10-03', scheduledTime: '09:00' },
    matchUpIds: [later.matchUpId],
  });
  expect(result.success).toEqual(true);

  const matchUpIds = r1.map(({ matchUpId }) => matchUpId);
  result = tournamentEngine.scheduleMatchUps({ scheduleDate: '2026-10-02', matchUpIds });
  expect(result.success).toEqual(true);
  expect(scheduleOf(earlier.matchUpId).scheduledDate).toEqual('2026-10-01');
  expect(scheduleOf(earlier.matchUpId).scheduledTime).toBeUndefined();
  expect(scheduleOf(later.matchUpId)).toMatchObject({ scheduledDate: '2026-10-03', scheduledTime: '09:00' });
  expect(result.scheduledMatchUpIds).not.toContain(earlier.matchUpId);
  expect(result.scheduledMatchUpIds).not.toContain(later.matchUpId);
  expect(result.noTimeMatchUpIds).toEqual(expect.arrayContaining([earlier.matchUpId, later.matchUpId]));
  // the others are timed on the day asked for
  for (const { matchUpId } of r1.slice(2)) expect(scheduleOf(matchUpId).scheduledDate).toEqual('2026-10-02');

  // its own day's call times it there
  result = tournamentEngine.scheduleMatchUps({ scheduleDate: '2026-10-01', matchUpIds: [earlier.matchUpId] });
  expect(result.success).toEqual(true);
  expect(result.scheduledMatchUpIds).toEqual([earlier.matchUpId]);
  expect(scheduleOf(earlier.matchUpId).scheduledDate).toEqual('2026-10-01');
  expect(scheduleOf(earlier.matchUpId).scheduledTime).toBeDefined();
});

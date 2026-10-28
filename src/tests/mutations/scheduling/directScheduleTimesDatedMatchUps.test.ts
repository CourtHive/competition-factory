import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * The direct scheduler leaves alone only the listed matchUps already TIMED on the date (scheduling-pipeline.md § 6
 * rule 1); only those hold a court (§ 3.9, § 6 rule 3). A listed matchUp dated on the date with no time is timed. Every
 * matchUp on the date, timed or not, counts toward its participants' daily loads (§ 3.5).
 */
const day = '2026-10-02';
const scheduleOf = (matchUpId: string) => tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule ?? {};

it('times a listed matchUp dated on the date without a time, and leaves a timed one where it is', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    setState: true,
  });
  const r1 = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const [dated, timed] = r1;
  let result: any = tournamentEngine.addMatchUpScheduledDate({
    matchUpId: dated.matchUpId,
    drawId: dated.drawId,
    scheduledDate: day,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.bulkScheduleMatchUps({
    schedule: { scheduledDate: day, scheduledTime: '15:00' },
    matchUpIds: [timed.matchUpId],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleMatchUps({ matchUpIds: r1.map(({ matchUpId }) => matchUpId), scheduleDate: day });
  expect(result.success).toEqual(true);

  expect(scheduleOf(dated.matchUpId).scheduledTime).toBeDefined();
  expect(result.scheduledMatchUpIds).toContain(dated.matchUpId);
  expect(scheduleOf(timed.matchUpId).scheduledTime).toEqual('15:00');
  expect(result.scheduledMatchUpIds).not.toContain(timed.matchUpId);
  // every listed matchUp that can be played is accounted for: timed, or reported
  const accounted = [...result.scheduledMatchUpIds, ...(result.noTimeMatchUpIds ?? []), timed.matchUpId];
  expect(r1.every(({ matchUpId }) => accounted.includes(matchUpId))).toEqual(true);
});

it('counts an unlisted matchUp dated on the date toward its participants’ daily loads', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }],
    participantsProfile: { participantsCount: 4 },
    endDate: day,
    startDate: day,
    setState: true,
  });
  let result: any = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 1 } });
  expect(result.success).toEqual(true);
  const r1 = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const drawIds = [...new Set(r1.map(({ drawId }) => drawId))];
  const [first, second] = drawIds.map((drawId) => r1.filter((m) => m.drawId === drawId));
  for (const { matchUpId, drawId } of first) {
    result = tournamentEngine.addMatchUpScheduledDate({ matchUpId, drawId, scheduledDate: day });
    expect(result.success).toEqual(true);
  }
  // each participant is already certain to play once on the date: the second draw's matchUps are over the limit
  result = tournamentEngine.scheduleMatchUps({
    matchUpIds: second.map(({ matchUpId }) => matchUpId),
    scheduleDate: day,
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledMatchUpIds).toEqual([]);
  expect(result.overLimitMatchUpIds.length).toEqual(2);
});

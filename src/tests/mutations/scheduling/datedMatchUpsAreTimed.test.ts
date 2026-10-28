import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * A matchUp dated on the day without a time is timed by the profile scheduler too (scheduling-pipeline.md § 4 step 2),
 * a matchUp placed on the court grid without a time included; when a time contradicts the grid, the conflict is
 * reported (`proConflicts`), never dropped.
 */
const day = '2026-10-02';
const scheduleOf = (matchUpId: string) => tournamentEngine.findMatchUp({ matchUpId }).matchUp?.schedule ?? {};

function setup() {
  const {
    drawIds: [drawId],
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8 }],
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    setState: true,
  });
  const r1 = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  return { drawId, venueId, r1 };
}

it('the profile scheduler times a profiled matchUp dated on the day without a time', () => {
  const { drawId, venueId, r1 } = setup();
  const { tournamentId, eventId, structureId, matchUpId } = r1[0];
  let result: any = tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: day });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, eventId, drawId, structureId, roundNumber: 1 },
    scheduleDate: day,
    venueId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [day] });
  expect(result.success).toEqual(true);
  expect(scheduleOf(matchUpId).scheduledTime).toBeDefined();
  expect(result.scheduledMatchUpIds[day]).toContain(matchUpId);
  expect(result.scheduledMatchUpIds[day].length).toEqual(r1.length);
});

it('a matchUp on the court grid without a time is timed, and a time that contradicts the grid is reported', () => {
  const { drawId, venueId, r1 } = setup();
  const courtId = tournamentEngine.getVenuesAndCourts().courts[0].courtId;
  // every first-round matchUp on one court, in rows 4..1 in list order, with no time
  r1.forEach(({ matchUpId }, index) => {
    const result = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: day, courtId, venueId, courtOrder: r1.length - index },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  const result: any = tournamentEngine.scheduleMatchUps({
    matchUpIds: r1.map(({ matchUpId }) => matchUpId),
    scheduleDate: day,
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledMatchUpIds.length).toEqual(r1.length);
  for (const { matchUpId } of r1) {
    expect(scheduleOf(matchUpId).scheduledTime).toBeDefined();
    expect(scheduleOf(matchUpId).courtId).toEqual(courtId);
  }
  // two courts' worth of times on one court, against the rows' order: reported, each naming a matchUp just timed
  expect(result.proConflicts.length).toBeGreaterThan(0);
  const timed = r1.map(({ matchUpId }) => matchUpId);
  for (const { matchUpId, issueType } of result.proConflicts) {
    expect(timed).toContain(matchUpId);
    expect(issueType).toEqual('courtTimeOrderConflict');
  }
});

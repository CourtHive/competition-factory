import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * The direct scheduler's recovery gate is the timed pipeline's (scheduling-pipeline.md § 6, § 3.4): a placement is
 * checked against a participant's matchUp already timed on the date in either order. A placement BEFORE a booked
 * matchUp must leave the booked one free: its own minutes and recovery have to end by the booked start.
 */
it('scheduleMatchUps does not place a matchUp that would run into a participant’s later booked matchUp', () => {
  const startDate = '2026-10-01';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }],
    participantsProfile: { participantsCount: 4 },
    venueProfiles: [{ courtsCount: 2, startTime: '08:00', endTime: '20:00' }],
    endDate: startDate,
    setState: true,
    startDate,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const [firstDrawId, secondDrawId] = [...new Set(matchUps.map(({ drawId }) => drawId))];
  const booked = matchUps.find(({ drawId }) => drawId === firstDrawId);
  const shared = booked.sides.map(({ participantId }) => participantId);
  const candidate = matchUps.find(
    ({ drawId, sides }) => drawId === secondDrawId && sides.some(({ participantId }) => shared.includes(participantId)),
  );
  expect(candidate).toBeDefined();

  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: startDate, scheduledTime: '09:00' },
    matchUpId: booked.matchUpId,
    drawId: booked.drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleMatchUps({
    matchUpIds: [candidate.matchUpId],
    averageMatchUpMinutes: 90,
    scheduleDate: startDate,
    recoveryMinutes: 30,
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ matchUpId: candidate.matchUpId, drawId: candidate.drawId });
  // 08:00 would run until 10:00 with its recovery, into the 09:00 matchUp; the first free time is that matchUp's end
  // plus recovery, 11:00
  expect(matchUp.schedule.scheduledTime >= '11:00').toEqual(true);
});

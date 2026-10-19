import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';

// The lines of a TEAM dual were hydrated without `afterRecoveryTimes`, so a line never carried `timeAfterRecovery`.
// Participant schedule analysis judges a conflict by the prior item's recovery time, and so it never reported one
// for a player whose singles line and doubles line overlapped.

const scheduledDate = '2026-10-17';

function scheduledLines() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    completeAllMatchUps: true, // assigns the lineUps that put individuals on the lines
    startDate: scheduledDate,
    setState: true,
  });

  const lines = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
  }).matchUps;
  const individuals = (matchUp) =>
    matchUp.sides.flatMap((side) => side.participant?.individualParticipantIds ?? [side.participant?.participantId]);
  const singles = lines.find((matchUp) => matchUp.matchUpType === SINGLES);
  const participantId = individuals(singles)[0];
  const doubles = lines.find(
    (matchUp) => matchUp.matchUpType === DOUBLES && individuals(matchUp).includes(participantId),
  );
  expect(participantId).toBeDefined();
  expect(doubles).toBeDefined();

  for (const [{ matchUpId, drawId }, scheduledTime] of [
    [singles, '09:00'],
    [doubles, '09:30'],
  ]) {
    const schedule = { scheduledDate, scheduledTime };
    expect(tournamentEngine.addMatchUpScheduleItems({ matchUpId, drawId, schedule }).success).toEqual(true);
  }

  return { participantId, singles, doubles };
}

test('a TEAM line carries its recovery time when afterRecoveryTimes is requested', () => {
  const { singles } = scheduledLines();
  const matchUpFilters = { matchUpIds: [singles.matchUpId] };

  const { schedule } = tournamentEngine.allTournamentMatchUps({ afterRecoveryTimes: true, matchUpFilters }).matchUps[0];
  expect(schedule.averageMinutes).toBeGreaterThan(0);
  expect(schedule.timeAfterRecovery).toEqual('11:30');

  // and only when it is requested
  const unrequested = tournamentEngine.allTournamentMatchUps({ matchUpFilters }).matchUps[0].schedule;
  expect(unrequested.timeAfterRecovery).toBeUndefined();
});

test('overlapping lines of one player are a schedule conflict', () => {
  const { participantId, singles, doubles } = scheduledLines();
  const { participants } = tournamentEngine.getParticipants({ scheduleAnalysis: true, withMatchUps: true });
  const participant = participants.find((p) => p.participantId === participantId);

  expect(participant.scheduleConflicts).toEqual([
    { priorScheduledMatchUpId: singles.matchUpId, matchUpIdWithConflict: doubles.matchUpId },
  ]);
});

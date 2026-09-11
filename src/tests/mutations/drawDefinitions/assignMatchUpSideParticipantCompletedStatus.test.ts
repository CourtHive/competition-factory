import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { CANNOT_REMOVE_PARTICIPANTS } from '@Constants/errorConditionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';

// Regression: assignMatchUpSideParticipant guarded un-assignment against completed
// matchUps via completedMatchUpStatuses.includes(matchUp.matchUpstatus) — a misspelling
// that always read undefined, so a completed-but-scoreless status (WALKOVER/DEFAULT)
// slipped through and a participant could be removed from a completed ad-hoc matchUp.
it('blocks un-assigning a participant from a completed (WALKOVER) ad-hoc matchUp', () => {
  const eventProfiles = [{ drawProfiles: [{ drawSize: 4, drawType: AD_HOC, automated: true, roundsCount: 1 }] }];
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ eventProfiles, setState: true });

  const target = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m) => m.sides?.filter((s) => s.participantId).length === 2);
  expect(target).toBeDefined();

  const woResult: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    drawId,
  });
  expect(woResult.success).toEqual(true);

  const updated = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === target.matchUpId);
  expect(updated.matchUpStatus).toEqual(WALKOVER);
  // guard must rely on status, not score — a walkover carries no scoreStringSide1
  expect(updated.score?.scoreStringSide1).toBeFalsy();

  // un-assign attempt (no participantId) must be blocked because the matchUp is completed
  const result: any = tournamentEngine.assignMatchUpSideParticipant({
    matchUpId: target.matchUpId,
    sideNumber: 1,
    drawId,
  });
  expect(result.error).toEqual(CANNOT_REMOVE_PARTICIPANTS);
});

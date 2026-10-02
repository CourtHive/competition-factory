import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * A LINE SCORED WITH A WINNER IS COMPLETED, NOT IN PROGRESS.
 *
 * Found by the v2 outcome pipeline's differential mode, 2026-10-02. Scoring a line of a dual that is
 * already decided, with a score and a winner but no status, took the dual's direction back first: that
 * wrote the line as TO_BE_PLAYED with the new score, which the in-progress rule turns into IN_PROGRESS,
 * and the second write added the winner without a status. The line ended IN_PROGRESS WITH A WINNER, the
 * contradiction the refusal table rejects on input (a live status with a winner, spec section 2 row 9).
 * Every other route writes a status-less result with a winner as COMPLETED; this one now does too.
 */
it('a line re-scored with a winner, undoing the decision of its dual, reads COMPLETED', () => {
  const { drawIds } = mocksEngine.generateTournamentRecord({
    // lines are scored without line-ups, as the existing TEAM scoring tests do
    policyDefinitions: { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } },
    drawProfiles: [{ drawSize: 4, eventType: TEAM }],
    setState: true,
  });
  const drawId = drawIds[0];
  const dual = () =>
    tournamentEngine
      .allTournamentMatchUps({ inContext: true })
      .matchUps.find((m: any) => m.matchUpType === TEAM && m.roundNumber === 1 && m.roundPosition === 1);
  const lineOutcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;

  // decide the dual through its lines, remembering the one that decided it
  let decidingLineId: string | undefined;
  for (const line of dual().tieMatchUps) {
    if (dual().winningSide) break;
    const result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId: line.matchUpId, outcome: lineOutcome });
    expect(result.success).toEqual(true);
    decidingLineId = line.matchUpId;
  }
  expect(dual().winningSide).toEqual(1);

  // re-score the deciding line to the other side, with a winner and no status: the dual is no longer decided
  const side2Wins = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-2', winningSide: 2 }).outcome;
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { score: side2Wins.score, winningSide: 2 },
    matchUpId: decidingLineId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(dual().winningSide).toBeUndefined();
  const line = dual().tieMatchUps.find((m: any) => m.matchUpId === decidingLineId);
  expect(line.winningSide).toEqual(2);
  expect(line.matchUpStatus).not.toEqual(IN_PROGRESS);
  expect(line.matchUpStatus).toEqual(COMPLETED);
});

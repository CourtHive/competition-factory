import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
} from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A participant arriving at a PENDING propagated exit advances out of it only if they arrived on the
 * WINNING side.
 *
 * `advanceDrawPosition`'s `positionAssigned && isPropagatedExit` branch advanced the arriving
 * drawPosition unconditionally. A participant can also arrive on the EXITING side: re-scoring an
 * upstream matchUp swaps which participant is the loser, so the consolation seat is vacated and
 * re-filled, and by then the matchUp is already an exit. The first fill does not trip it — at that
 * point `progressExitStatus` has not yet turned the matchUp into one.
 *
 * The result is that the LOSER of the consolation walkover sits in the next round while the winner
 * is dropped from the draw — `WINNING_SIDE_ADVANCEMENT_MISMATCH`, and visible to a tournament
 * director on screen.
 *
 * Gated on `propagateExitStatus`, which nothing in the ecosystem currently sets; the policy is
 * attached here so the scenario is reachable at all.
 */

const DRAW_ID = 'pending-exit-advancement';

function mainRoundOne(roundPosition: number) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.stage === 'MAIN' && matchUp.roundNumber === 1 && matchUp.roundPosition === roundPosition,
    );
}

function issues() {
  const drawDefinition = tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
  const result: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  return (result?.inconsistencies ?? []).map((issue: any) => issue.issueType);
}

it.each([
  { drawType: FEED_IN_CHAMPIONSHIP, first: 3 },
  { drawType: FEED_IN_CHAMPIONSHIP_TO_SF, first: 3 },
  { drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, first: 3 },
  { drawType: FIRST_MATCH_LOSER_CONSOLATION, first: 3 },
])('re-scoring a walkover in a $drawType does not advance the consolation loser', ({ drawType, first }) => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 8, drawSize: 8, drawType, drawId: DRAW_ID }],
    nonRandom: 1,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: { [POLICY_TYPE_SCORING]: { policyName: 'carry exits', propagateExitStatus: true } },
  });

  const score = (roundPosition: number, outcome: any) => {
    const matchUp = mainRoundOne(roundPosition);
    expect(matchUp?.matchUpId).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, drawId: DRAW_ID, outcome });
    expect(result.success).toEqual(true);
  };

  // 1. the walkover propagates its loser into the consolation, carrying the exit status
  score(first, { matchUpStatus: WALKOVER, winningSide: 2 });
  // the control: nothing is wrong yet, so a clean result at the end is about the re-score
  expect(issues()).toEqual([]);

  // 2. the re-score swaps which participant is the loser — the consolation seat is re-filled while
  //    the matchUp is already a propagated exit
  score(first, { winningSide: 1 });
  expect(issues()).toEqual([]);

  // 3. the sibling delivers the second consolation player, resolving the pending exit
  score(first % 2 === 1 ? first + 1 : first - 1, { winningSide: 2 });
  expect(issues()).toEqual([]);

  // and the participant now in the consolation's second round is the one who WON the walkover
  const consolation = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.filter((matchUp: any) => matchUp.stage !== 'MAIN');
  const decided = consolation.filter((matchUp: any) => matchUp.matchUpStatus === WALKOVER && matchUp.winningSide);
  // the control: the scenario must actually have produced a decided consolation walkover
  expect(decided.length).toBeGreaterThan(0);

  for (const matchUp of decided) {
    const winner = (matchUp.sides ?? []).find((side: any) => side.sideNumber === matchUp.winningSide);
    const loser = (matchUp.sides ?? []).find((side: any) => side.sideNumber !== matchUp.winningSide);
    if (!winner?.participantId || !loser?.participantId || !matchUp.winnerMatchUpId) continue;
    const next = consolation.find((candidate: any) => candidate.matchUpId === matchUp.winnerMatchUpId);
    const advanced = (next?.sides ?? []).map((side: any) => side.participantId).filter(Boolean);
    expect(advanced).not.toContain(loser.participantId);
  }
});

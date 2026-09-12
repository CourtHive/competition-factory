import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { FIRST_MATCH_LOSER_CONSOLATION, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

/**
 * An unwind that empties a `positionAssignment` must also drop that drawPosition from the matchUps
 * that only hold it by advancement.
 *
 * `removeDirectedLoser` deleted the loser's `participantId` from the target structure's
 * positionAssignments but never removed the drawPosition from the consolation matchUps the
 * participant had advanced into. `getUpdatedDrawPositions` can only claim a slot that is
 * `undefined` in the array, so the stale entry blocked that slot permanently and the next arrival
 * was refused with ERR_EXISTING_POSITION_ASSIGNMENT — for a matchUp that was, in substance, half
 * empty. Its twin `removeDirectedWinner` had always stripped, via
 * `removeSubsequentRoundsParticipant`; only the loser direction did not.
 *
 * Both cases below are shrunk reproductions from the 600-seed sweep window
 * (`SEED_START=9000001`), which is why the seeds are the sweep's own and the step lists are three
 * long. Each ends in a RE-SCORE of an already-decided round-1 matchUp to a double exit: that is
 * what runs the removal path with a participant already advanced in the consolation.
 */

const DRAW_ID = 'unwind-removes-drawposition';

function issues() {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const result: any = getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID });
  return (result?.inconsistencies ?? []).map((issue: any) => issue.issueType);
}

function mainRoundOne(roundPosition: number) {
  return tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.stage === 'MAIN' && matchUp.roundNumber === 1 && matchUp.roundPosition === roundPosition,
    );
}

it.each([
  {
    scenario: 'a DOUBLE_WALKOVER re-score of a DEFAULTED matchUp',
    drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
    participantsCount: 8,
    drawSize: 8,
    seed: 9000036,
    steps: [
      { roundPosition: 3, outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
      { roundPosition: 4, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { roundPosition: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ],
  },
  {
    scenario: 'a DOUBLE_DEFAULT re-score after a WALKOVER fed the consolation',
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    participantsCount: 16,
    drawSize: 16,
    seed: 9000035,
    steps: [
      { roundPosition: 8, outcome: { winningSide: 1 } },
      { roundPosition: 7, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { roundPosition: 8, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
    ],
  },
  {
    scenario: 'a DOUBLE_DEFAULT re-score in a FIRST_MATCH_LOSER_CONSOLATION',
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    participantsCount: 14,
    drawSize: 16,
    seed: 9000029,
    steps: [
      { roundPosition: 4, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      { roundPosition: 3, outcome: { winningSide: 1 } },
      { roundPosition: 3, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
    ],
  },
])('$scenario is not refused by a drawPosition the unwind already emptied', (testCase) => {
  const { participantsCount, drawType, drawSize, seed, steps } = testCase;

  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId: DRAW_ID }],
    nonRandom: seed,
    setState: true,
  });
  tournamentEngine.attachPolicies({
    policyDefinitions: { [POLICY_TYPE_SCORING]: { policyName: 'carry exits', propagateExitStatus: true } },
  });

  for (const [index, step] of steps.entries()) {
    const matchUp = mainRoundOne(step.roundPosition);
    expect(matchUp?.matchUpId).toBeDefined();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome: step.outcome,
      drawId: DRAW_ID,
    });
    // the first two steps are the setup; the third is the one that used to be refused. Asserting
    // every step keeps a future setup change from turning this into a vacuous pass.
    expect(result.error, `step ${index + 1} (roundPosition ${step.roundPosition})`).toBeUndefined();
  }

  // CONTROL, not the regression assertion: the committed inconsistency oracle must stay clean, so
  // the fix cannot buy the refusal back by leaving the draw in a worse shape. Its
  // DRAW_POSITION_UNASSIGNED check is the scoped form of "a matchUp references a drawPosition whose
  // assignment holds nobody" — scoped because it exempts exits, and a PENDING propagated exit
  // legitimately advances a still-vacant drawPosition that is awaiting its arrival. These three
  // scenarios are clean on this oracle before the fix too; the falsifying assertion is the loop
  // above, which is RED on master at step 3 in all three cases.
  expect(issues()).toEqual([]);
});

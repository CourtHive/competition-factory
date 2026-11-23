import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { BYE, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A DISSOLVED CONVERGENCE OWES ITS LOSER SEAT THE BYE AGAIN (census S8, policy-off DRAW_INCONSISTENCY STALLED_POSITION,
 * COMPASS 8/8 under `doubleExitPropagateBye: false`, seed 20853116, shrunk from 30 steps to 10).
 *
 * `West|1|1` is fed over loser links by `East|1|1` and `East|1|2`. Won over `East|1|2`'s double default with nobody to
 * lose, it claims a BYE on `South|1|1` dp 1, and the BYE stands while `East|1|1`'s double walkover makes it a double
 * exit of two produced exits. Re-scoring `East|1|2` as a walkover sends its loser carrying the exit, and the
 * convergence, re-advanced, takes back the BYE its single exit claimed: dp 1 holds the produced walkover instead
 * (`aDoubleExitTakesBackTheByeItsSingleExitClaimed`). Re-scoring `East|1|2` as a played result dissolves the
 * convergence: `West|1|1` is won over `East|1|1`'s produced exit and again has nobody to lose. The produced walkover
 * went, but the BYE did not come back, so dp 1 stood empty opposite a participant whose opponent could never arrive.
 * Entered directly as a played result, `East|1|2` leaves the BYE where it was.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 8, drawSize: 8, seed: 20853116 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

const BEFORE_CONVERGENCE = [
  at('East|1|4', { winningSide: 1 }),
  at('East|1|3', { winningSide: 1 }),
  at('East|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('West|1|2', RETIRED_6_3),
  at('East|2|2', { winningSide: 1 }),
];
const CONVERGE = at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 });
const DISSOLVE = at('East|1|2', { winningSide: 1 });
const SCHEDULE = [
  ...BEFORE_CONVERGENCE,
  CONVERGE,
  DISSOLVE,
  at('East|3|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('West|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];

function drawAfter(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.thrown).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      },
    ]),
  );
}

it('the census schedule leaves no stalled seat', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'dissolved-convergence-bye-census', POLICY_OFF)).toBeNull();
});

it('while converged the loser seat holds the produced exit; dissolved, it holds the BYE again', () => {
  const converged = drawAfter([...BEFORE_CONVERGENCE, CONVERGE], 'dissolved-convergence-bye-converged');
  expect(converged['West|1|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(converged['South|1|1'].occupants[0]).toBeUndefined();
  expect(converged['South|1|1'].matchUpStatus).toEqual(WALKOVER);

  const dissolved = drawAfter([...BEFORE_CONVERGENCE, CONVERGE, DISSOLVE], 'dissolved-convergence-bye-dissolved');
  expect(dissolved['West|1|1'].matchUpStatus).toEqual(WALKOVER);
  expect(dissolved['South|1|1'].occupants[0]).toEqual(BYE);
  expect(dissolved['South|1|1'].matchUpStatus).toEqual(BYE);
});

it('the walkover and its correction leave the draw the played result alone leaves', () => {
  const corrected = drawAfter([...BEFORE_CONVERGENCE, CONVERGE, DISSOLVE], 'dissolved-convergence-bye-corrected');
  const direct = drawAfter([...BEFORE_CONVERGENCE, DISSOLVE], 'dissolved-convergence-bye-direct');
  expect(corrected).toEqual(direct);
});

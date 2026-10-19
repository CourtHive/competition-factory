import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A DOUBLE EXIT'S OWN POSITION LEAVES EVERY ROUND IT REACHED (census S8, policy-off ERROR_IMPLIES_NO_MUTATION,
 * FEED_IN_CHAMPIONSHIP 16/11 under `doubleExitPropagateBye: false`, seed 21123326, shrunk from 30 steps to 12).
 *
 * `Main|1|2`'s loser is fed to Consolation dp 9, which passes the BYEs of `Consolation|1|1` and `2|1` into `3|1`,
 * opposite the walkover `Consolation|2|2`'s double walkover produced. `Consolation|4|1` holds a BYE (`Main|3|1` has
 * nobody to lose), so what `3|1` sends on passes it into `5|1`. With `Main|1|2` a double default, `3|1` is a double
 * walkover and `5|1` converges its produced exit with `4|2`'s. Re-scoring `Main|1|2` as a walkover sends its loser,
 * carrying the walkover, into dp 9. Forward placement advances them through `3|1`, whose other side is a double exit's,
 * and past `4|1`'s BYE into `5|1`; the exit pass then converges `3|1` again and takes dp 9 back as the double exit's
 * own advance (P44). The release took it out of `4|1` but not out of `5|1`: a double exit read as a recorded result,
 * so dp 9 stayed there with no feeder holding it, and `5|1` was awarded to it. Forward play later sent `3|2`'s winner
 * through `4|2`'s walkover into `5|1`, now full, and the call refused ERR_EXISTING_POSITION_ASSIGNMENT after writing.
 *
 * Released, dp 9 leaves `5|1` holding only `3|1`'s produced walkover, as a single exit. That exit was produced, so it
 * awards no empty seat: it stands pending, as forward play lands it. Re-derived, it was awarded to the side nobody had
 * reached. Entered directly as a walkover, `Main|1|2` leaves the same draw.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 11,
  seed: 21123326,
  drawSize: 16,
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const BEFORE_CORRECTION = [
  at('Main|2|3', { winningSide: 2 }),
  at('Main|1|7', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|4', { winningSide: 1 }),
  at('Main|3|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Consolation|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
];
const DOUBLE = at('Main|1|2', { matchUpStatus: DOUBLE_DEFAULT });
const CORRECTED = at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 });
const SCHEDULE = [
  ...BEFORE_CORRECTION,
  DOUBLE,
  CORRECTED,
  at('Main|2|1', { winningSide: 1 }),
  at('Main|2|2', { winningSide: 1 }),
  at('Main|3|1', { winningSide: 2 }),
  at('Consolation|3|2', { winningSide: 2 }),
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
    expect(observed.error).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      },
    ]),
  );
}

it('the census schedule refuses nothing after a write', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'own-position-every-round-census', POLICY_OFF)).toBeNull();
});

it("the walkover's loser stays in the double walkover they converged, and goes no further", () => {
  const corrected = drawAfter([...BEFORE_CORRECTION, DOUBLE, CORRECTED], 'own-position-every-round-corrected');
  const loser = corrected['Consolation|1|1'].occupants[1];
  expect(loser).toBeDefined();
  expect(corrected['Consolation|3|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(corrected['Consolation|3|1'].occupants).toContain(loser);
  expect(corrected['Consolation|4|1'].drawPositions).not.toContain(9);
  // released from the double exit it was advanced into, too
  expect(corrected['Consolation|5|1'].drawPositions).toEqual([]);
  expect(corrected['Consolation|6|1'].occupants).not.toContain(loser);
  // what is left is the walkover `3|1` produced: pending, awarded to nobody
  expect(corrected['Consolation|5|1'].matchUpStatus).toEqual(WALKOVER);
  expect(corrected['Consolation|5|1'].winningSide).toBeUndefined();
});

it('the double default and its correction leave the draw the walkover alone leaves', () => {
  const corrected = drawAfter([...BEFORE_CORRECTION, DOUBLE, CORRECTED], 'own-position-every-round-via-double');
  const direct = drawAfter([...BEFORE_CORRECTION, CORRECTED], 'own-position-every-round-direct');
  expect(corrected).toEqual(direct);
});

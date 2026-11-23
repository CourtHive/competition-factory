import { byeSeatsOwedTo, feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  clearOutcome,
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE A CALL DISSOLVED IS OWED ITS BYE BACK (census Phase B, policy-off DO_UNDO_IDENTITY, COMPASS 32/30 under
 * `doubleExitPropagateBye: false`, seed 30004303, shrunk from 30 steps to 7 keeping the probe and the first divergence).
 *
 * `East|1|8`'s double walkover sends its produced walkover into `West|1|4` side 2, so `West|1|4` is won over an exit
 * with nobody to lose, and its loser seat, `South|1|2` dp 4, is the BYE it claims (`propagateUnfillableLoserBye`): a
 * BYE matchUp in South. The probe, `East|1|7` walked over, sends a second exit into `West|1|4` side 1: a double
 * walkover, which under the policy off takes back the BYE its single exit claimed (`reclaimSingleExitBye`) and sends a
 * produced walkover into dp 4 instead. Clearing the probe withdraws that exit, and `West|1|4` is re-derived to the single
 * walkover it was, through `applyWithdrawnExits`, with nobody to lose again. That path, unlike `settleRederivedDoubleExit`
 * (#5519) and `removeDoubleExit`, never gave the BYE back: dp 4 stood empty, `South|1|2` read DEFAULTED won by an empty
 * side, and `South|2|1` and `South|3|1` followed it. The BYE is now owed once the call has settled
 * (`oweDissolvedConvergencesTheirByes`), so a convergence that dissolves and converges again within one call is left
 * alone (`aLoserSeatHoldingAByeIsNotConverged`).
 *
 * The scheduled draw once recorded the BYE as `East|1|8`'s claim (`byeClaims`); the ledger is retired (Mentat P58, CA
 * 2026-10-21), so what the claim stood for is read from the draw: `West|1|4` sends nobody across its loser link
 * (`feederSendsNobody`: `NOBODY_LOST`), and `South|1|2` is among the seats `East|1|8` is the reason for
 * (`byeSeatsOwedTo`). The round trip holds that reading too.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 30004303 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const SCHEDULE = [
  at('East|1|7', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|7', clearOutcome),
  at('East|1|6', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
];
const PROBE = at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 });
const WATCH = ['West|1|4', 'South|1|2', 'South|2|1', 'South|3|1'];

function enter(drawId: string, step: Step) {
  const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
  const observed = observeMutation({
    propagateExitStatus: true,
    matchUpId: target.matchUpId,
    outcome: step.outcome,
    drawId,
  });
  expect(observed.error).toBeUndefined();
  expect(observed.thrown).toBeUndefined();
}

function view(drawId: string) {
  const matchUps = getDrawMatchUps(drawId);
  const drawDefinition = getDrawDefinition(drawId);
  const find = (key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);
  const feeder = find('West|1|4');
  const loserTargetLink = positionTargets({
    matchUpId: feeder.matchUpId,
    inContextDrawMatchUps: matchUps,
    drawDefinition,
  })?.targetLinks?.loserTargetLink;
  const derived = {
    reason: feederSendsNobody({ inContextDrawMatchUps: matchUps, loserTargetLink, drawDefinition, feeder }),
    owed: byeSeatsOwedTo({
      inContextDrawMatchUps: matchUps,
      drawDefinition,
      matchUpId: find('East|1|8').matchUpId,
    }).map(coordinate),
  };
  const watched = Object.fromEntries(
    matchUps
      .filter((matchUp: any) => WATCH.includes(coordinate(matchUp)))
      .map((matchUp: any) => [
        coordinate(matchUp),
        {
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide ?? null,
          drawPositions: matchUp.drawPositions,
          provenance: matchUp.sideExitProvenance ?? null,
        },
      ]),
  );
  const south = drawDefinition.structures.find((structure: any) => structure.structureName === 'South');
  const dp4 = south.positionAssignments.find((assignment: any) => assignment.drawPosition === 4);
  return { watched, dp4, derived };
}

function scheduled(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const step of SCHEDULE) enter(drawId, step);
  return view(drawId);
}

it("the scheduled draw holds South dp 4's BYE, owed to East|1|8 because West|1|4 has nobody to lose", () => {
  const { watched, dp4, derived } = scheduled('owed-bye-scheduled');
  expect(dp4).toEqual({ drawPosition: 4, bye: true, byeFromPropagation: true });
  expect(watched['West|1|4']).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1 });
  expect(watched['South|1|2']).toMatchObject({ matchUpStatus: BYE, winningSide: null });
  expect(watched['South|1|2'].provenance?.['2']).toBeUndefined();
  expect(derived.reason).toEqual('NOBODY_LOST');
  expect(derived.owed).toContain('South|1|2');
  expect(watched['South|2|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
});

it('the probe converges West|1|4 and takes the BYE back', () => {
  scheduled('owed-bye-probe');
  enter('owed-bye-probe', PROBE);
  const { watched, dp4 } = view('owed-bye-probe');
  expect(watched['West|1|4'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(dp4?.bye).toBeFalsy();
  expect(watched['South|1|2'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
});

it("clearing the probe gives the dissolved convergence's loser seat its BYE back", () => {
  const before = scheduled('owed-bye-round-trip');
  enter('owed-bye-round-trip', PROBE);
  enter('owed-bye-round-trip', { ...PROBE, outcome: clearOutcome });
  const after = view('owed-bye-round-trip');
  expect(after.dp4).toEqual(before.dp4);
  expect(after.watched).toEqual(before.watched);
  expect(after.derived).toEqual(before.derived);
  expect(after.watched['South|3|1'].matchUpStatus).not.toEqual(TO_BE_PLAYED);
});

import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  clearOutcome,
  projectRoundTrip,
  normalize,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A RELAYED PENDING EXIT'S SEAT STAYS EMPTY WHEN THE CONVERGENCE IT WAS PART OF DISSOLVES (census openings policy-off,
 * DO_UNDO_IDENTITY at the clear, COMPASS 16/13 under `doubleExitPropagateBye: false`: 21078668, and nineteen siblings in
 * COMPASS 32).
 *
 * `East|1|7`'s double walkover produces a walkover into `West|1|4`, a BYE matchUp, which relays it into `West|2|2`, where
 * it waits pending for the loser of `East|1|5`. Forward play places no BYE at `West|2|2`'s loser seat, `Southwest` dp 2:
 * only an exit a double exit produces STRAIGHT into a matchUp makes that matchUp's seat a BYE while it is pending
 * (`conditionallyAdvanceDrawPosition`). The probe makes `East|1|5` a double walkover too; its walkover, relayed past
 * `West|1|3`'s BYE, converges `West|2|2`, whose seat shows the produced exit (CA ruling (A), 2026-10-21). Clearing it
 * dissolves `West|2|2` back to the pending exit, and the dissolution re-owed the seat a BYE as though the exit had been
 * produced straight into it, so the round trip left `Southwest|1|1` a BYE where the schedule had it TO_BE_PLAYED.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (matchUps: any[], key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);

const CONFIG = { drawType: COMPASS, propagateExitStatus: false, participantsCount: 13, drawSize: 16, seed: 21078668 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const SCHEDULE: Step[] = [
  at('East|1|4', { winningSide: 1 }),
  at('East|1|3', { winningSide: 2 }),
  at('East|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|2', { winningSide: 1 }),
];
const PROBE = at('East|1|5', { matchUpStatus: DOUBLE_WALKOVER });

function apply(drawId: string, step: Step) {
  const target = find(getDrawMatchUps(drawId), coordinate(step));
  const result = observeMutation({
    propagateExitStatus: CONFIG.propagateExitStatus,
    matchUpId: target.matchUpId,
    outcome: step.outcome,
    drawId,
  });
  expect(result.thrown).toBeUndefined();
  expect(result.error).toBeUndefined();
}

function scheduled(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY)).toEqual(true);
  for (const step of SCHEDULE) apply(drawId, step);
}

const southwestSeat = (drawId: string, drawPosition: number) =>
  getDrawDefinition(drawId)
    .structures.find((structure: any) => structure.structureName === 'Southwest')
    .positionAssignments.find((assignment: any) => assignment.drawPosition === drawPosition);

it("the scheduled draw holds West|2|2's relayed walkover pending, with its loser seat empty", () => {
  scheduled('relayed-pending-scheduled');
  const matchUps = getDrawMatchUps('relayed-pending-scheduled');
  expect(find(matchUps, 'West|2|2')).toMatchObject({ matchUpStatus: WALKOVER });
  expect(find(matchUps, 'West|2|2').winningSide).toBeUndefined();
  expect(find(matchUps, 'Southwest|1|1').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(southwestSeat('relayed-pending-scheduled', 2)).toEqual({ drawPosition: 2 });
});

it('the probe converges West|2|2, and its clear returns the scheduled draw', () => {
  const drawId = 'relayed-pending-round-trip';
  scheduled(drawId);
  const before = normalize(projectRoundTrip(getDrawDefinition(drawId)));
  apply(drawId, PROBE);
  expect(find(getDrawMatchUps(drawId), 'West|2|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  apply(drawId, { ...PROBE, outcome: clearOutcome });
  expect(southwestSeat(drawId, 2)).toEqual({ drawPosition: 2 });
  expect(normalize(projectRoundTrip(getDrawDefinition(drawId)))).toEqual(before);
});

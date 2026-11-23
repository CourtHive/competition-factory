import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';
import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  clearOutcome,
  projectDraw,
  normalize,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A DISSOLVED CONVERGENCE ADVANCES THE RE-DERIVED AWARD, AND THE RESERVATION BEHIND IT (census A1 case 7,
 * DO_UNDO_IDENTITY, COMPASS 32/32 under `doubleExitPropagateBye: false`: 20503744).
 *
 * `East|1|7`'s double walkover produces a walkover into `West|1|4`, awarded to the seat nobody has reached, drawPosition
 * 8; as the double exit's same-structure advancement it goes on into `West|2|2`, where `West|1|3`'s produced walkover
 * stands pending, and that pending exit reserves it a round on, in `West|3|1`. The probe makes `East|1|8` a double
 * walkover too, whose produced walkover converges `West|1|4`, and then `West|2|2`, into double walkovers. Clearing it
 * dissolves both and re-derives `West|1|4` to the award, and the seat was advanced nowhere: `West|2|2` and `West|3|1`
 * lost drawPosition 8. The settle advances the award (question 1 of `settleForwardConsequences`: an exit that came
 * straight down its origin's link, to a structural seat) and makes the reservation again (question 3).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const scoreable = (matchUp: any) => (matchUp?.sides ?? []).filter((side: any) => side?.participantId).length === 2;
const find = (matchUps: any[], key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 20503744 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const SCHEDULE: Step[] = [
  at('East|1|1', { winningSide: 2 }),
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|15', { winningSide: 2 }),
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|15', { winningSide: 1 }),
  at('East|1|2', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
  at('East|1|16', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|6', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('West|1|1', { winningSide: 1 }),
  at('East|1|15', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|11', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('East|1|2', { winningSide: 1 }),
  at('East|1|12', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|14', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('South|1|1', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|9', { winningSide: 2 }),
  at('East|1|9', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|9', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('West|1|3', { winningSide: 1 }),
  at('East|1|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|4', { winningSide: 1 }),
  at('South|2|2', { winningSide: 2 }),
  at('East|1|16', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
  at('East|1|3', { winningSide: 2 }),
];
const PROBE = at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER });

/** the schedule as the census replayed it (a step at a matchUp not ready to be scored is skipped), then the probe and its clear */
function roundTrip(drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY)).toEqual(true);
  for (const step of SCHEDULE) {
    const target = find(getDrawMatchUps(drawId), coordinate(step));
    if (!scoreable(target)) continue;
    const result = observeMutation({ ...mutation(target, step.outcome), drawId });
    expect(result.thrown).toBeUndefined();
  }
  const scheduled = getDrawMatchUps(drawId);
  const before = normalize(projectDraw(getDrawDefinition(drawId)));
  const probe = find(scheduled, coordinate(PROBE));
  const forward = observeMutation({ ...mutation(probe, PROBE.outcome), drawId });
  expect(forward.error).toBeUndefined();
  const cleared = observeMutation({ ...mutation(probe, clearOutcome), drawId });
  expect(cleared.error).toBeUndefined();
  const after = getDrawMatchUps(drawId);
  const restored = normalize(projectDraw(getDrawDefinition(drawId)));
  return { scheduled, after, before, restored };
}
const mutation = (matchUp: any, outcome: any) => ({
  propagateExitStatus: CONFIG.propagateExitStatus,
  matchUpId: matchUp.matchUpId,
  outcome,
});

it('the probe and its clear leave the scheduled draw', () => {
  const { before, restored } = roundTrip('re-derived-award');
  expect(restored).toEqual(before);
});

it('the award is advanced, and the pending exit it meets reserves it a round on', () => {
  const { after } = roundTrip('re-derived-reservation');
  expect(find(after, 'West|1|4').winningSide).toEqual(2);
  expect(find(after, 'West|2|2').drawPositions).toEqual([8]);
  expect(find(after, 'West|2|2').matchUpStatus).toEqual(WALKOVER);
  expect(find(after, 'West|3|1').drawPositions).toEqual([8]);
});

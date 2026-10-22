import { checkLoserSeatsDerived } from '@Tests/testHarness/exitPropagation/properties';
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
 * A RELAYED EXIT'S BYE IS CLAIMED BY THE MATCHUP IT DECIDES, in every order (census openings policy-off,
 * LOSER_SEAT_DERIVED, COMPASS 16/11 under `doubleExitPropagateBye: false`: 21146979, 21157479).
 *
 * `East|1|5`'s double walkover produces a walkover into `West|1|3`, a BYE matchUp, which relays it into `West|2|2`. When
 * the loser of `East|1|7` stands opposite, `West|2|2` is awarded to them, and its loser seat in `Southwest` becomes the
 * BYE nobody can fill. Entered in that order, the BYE is claimed by `West|2|2` itself: the exit was relayed, not
 * produced straight into it. Reached the other way round — `East|1|7`'s walkover carried in, converging `West|2|2`, then
 * re-scored as a played result, re-deriving the convergence to the award — the BYE was claimed by `East|1|5`, as though
 * its exit had been produced straight into `West|2|2`. Clearing `East|1|5` then withdrew `West|2|2`'s award and the BYE's
 * claim, and left the BYE: `Southwest|1|1` dp 2 held a propagated BYE while its feeder, now TO_BE_PLAYED, sends somebody.
 */

const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (matchUps: any[], key: string) => matchUps.find((matchUp: any) => coordinate(matchUp) === key);

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 11, drawSize: 16, seed: 21146979 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

function drawAfter(drawId: string, steps: [string, any][]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY)).toEqual(true);
  for (const [key, outcome] of steps) {
    const target = find(getDrawMatchUps(drawId), key);
    const result = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
    expect(result.thrown).toBeUndefined();
    expect(result.error).toBeUndefined();
  }
  return normalize(projectRoundTrip(getDrawDefinition(drawId)));
}

const converged: [string, any][] = [
  ['East|1|5', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['East|1|7', { winningSide: 2 }],
];
const forward: [string, any][] = [
  ['East|1|7', { winningSide: 2 }],
  ['East|1|5', { matchUpStatus: DOUBLE_WALKOVER }],
];
const cleared: [string, any] = ['East|1|5', clearOutcome];

it('the award a dissolved convergence re-derives leaves the draw forward entry leaves', () => {
  const dissolved = drawAfter('relayed-claim-dissolved', converged);
  expect(find(getDrawMatchUps('relayed-claim-dissolved'), 'West|2|2')).toMatchObject({
    matchUpStatus: WALKOVER,
    winningSide: 2,
  });
  expect(drawAfter('relayed-claim-forward', forward)).toEqual(dissolved);
});

it('clearing the double exit takes the BYE back in either order', () => {
  const dissolved = drawAfter('relayed-claim-dissolved-cleared', [...converged, cleared]);
  expect(find(getDrawMatchUps('relayed-claim-dissolved-cleared'), 'West|2|2').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(checkLoserSeatsDerived('relayed-claim-dissolved-cleared')).toEqual([]);
  const southwest = getDrawDefinition('relayed-claim-dissolved-cleared').structures.find(
    (structure: any) => structure.structureName === 'Southwest',
  );
  expect(southwest.positionAssignments.find((assignment: any) => assignment.drawPosition === 2)).toEqual({
    drawPosition: 2,
  });
  expect(drawAfter('relayed-claim-forward-cleared', [...forward, cleared])).toEqual(dissolved);
});

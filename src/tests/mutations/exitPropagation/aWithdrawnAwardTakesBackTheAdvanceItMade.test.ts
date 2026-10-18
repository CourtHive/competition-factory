import { getDrawMatchUps, observeMutation, clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawDefinition, projectDraw } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A WITHDRAWN AWARD TAKES BACK THE ADVANCE IT MADE (census A1 int2 dpws, FEED_IN_CHAMPIONSHIP_TO_SF 16/11 seed
 * 21041635 under `doubleExitPropagateBye: false`; minimized from 30 steps).
 *
 * `Main|1|5`'s double walkover produces a walkover that waits, pending, in `Consolation|2|3` beside the fed dp 5, which
 * nobody holds yet; nothing is advanced for it into `Consolation|3|2`. `Main|2|2` scored sends its loser to dp 5, who
 * is awarded the walkover on arrival and advanced to `Consolation|3|2`. Clearing `Main|2|2` takes the loser back and
 * `withdrawAwardsToEmptiedSeats` takes the award back, but the release before it kept dp 5 in `Consolation|3|2`: it
 * read the feeder's award as a produced exit's own advance (`advancedByProducedExit`), which a leaving occupant does not
 * undo. An award that does not stand with the seat empty was the occupant's, and so was the advance. Every rebuild of
 * the two standing results, in either order, leaves dp 5 out of `Consolation|3|2`.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);

// the legacy `matchUpStatusCodes` are left out: they are F1's, exempt from the round trip and counted on their own ledger
const withoutCodes = (projection: any[]) =>
  projection.map((structure) => ({
    ...structure,
    matchUps: structure.matchUps.map((row: any[]) => row.filter((_: any, index: number) => index !== 4)),
  }));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
  propagateExitStatus: false,
  participantsCount: 11,
  drawSize: 16,
  seed: 21041635,
};
const STANDING = [at('Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }), at('Main|1|4', { winningSide: 1 })];
const PROBE = at('Main|2|2', { winningSide: 2 });

function enter(drawId: string, step: Step) {
  const { matchUpId } = find(drawId, coordinate(step));
  const observed = observeMutation({ propagateExitStatus: false, matchUpId, outcome: step.outcome, drawId });
  expect(observed.error).toBeUndefined();
  return matchUpId;
}

it('a loser awarded a pending walkover and taken back leaves no position in the round they were advanced to', () => {
  setSubscriptions({});
  const drawId = 'withdrawn-award-takes-its-advance';
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const step of STANDING) enter(drawId, step);
  const forward = withoutCodes(projectDraw(getDrawDefinition(drawId)));

  // the walkover waits over the empty dp 5 and has advanced nothing
  expect(find(drawId, 'Consolation|2|3').matchUpStatus).toEqual(WALKOVER);
  expect(find(drawId, 'Consolation|2|3').winningSide).toBeUndefined();
  expect(find(drawId, 'Consolation|2|3').drawPositions.filter(Boolean)).toEqual([5, 11]);
  expect(find(drawId, 'Consolation|3|2').drawPositions.filter(Boolean)).toEqual([6]);

  const matchUpId = enter(drawId, PROBE);
  // the probe's loser arrives at dp 5, is awarded the walkover and goes on
  expect(find(drawId, 'Consolation|2|3').winningSide).toEqual(1);
  expect(find(drawId, 'Consolation|3|2').drawPositions.filter(Boolean)).toEqual([5, 6]);

  const cleared = observeMutation({ propagateExitStatus: false, matchUpId, outcome: clearOutcome, drawId });
  expect(cleared.error).toBeUndefined();
  expect(find(drawId, 'Consolation|2|3').matchUpStatus).toEqual(WALKOVER);
  expect(find(drawId, 'Consolation|2|3').winningSide).toBeUndefined();
  expect(find(drawId, 'Consolation|3|2').drawPositions.filter(Boolean)).toEqual([6]);
  // and the whole draw is the one the standing results reach
  expect(withoutCodes(projectDraw(getDrawDefinition(drawId)))).toEqual(forward);
});

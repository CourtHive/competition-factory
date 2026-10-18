import { getDrawMatchUps, observeMutation, clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawDefinition, projectDraw } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A SEAT EMPTIED FURTHER ON LEAVES NO AWARD BEHIND (census A1 residue R3b, COMPASS 32/30 seed 20733408 under
 * `doubleExitPropagateBye: false`, the schedule of `aLoserWhoIsNobodyHoldsNoSeat`).
 *
 * `East|1|2`'s double walkover makes `South|1|2` a double walkover, whose produced walkover waits in `South|2|1` beside
 * the empty dp 2 and reserves it in `South|3|1`. `East|1|4`'s walkover sends its loser to `West|1|2`, who is carried
 * through `South|1|1`'s BYE into dp 2 and is awarded the produced walkover there. Clearing `East|1|4` takes them back,
 * and `removeOnwardLoserPlacements` empties dp 2 a link further on, but only `removeDirectedLoser`'s own seat was asked
 * whether its award stands: `South|2|1` kept `winningSide: 1` over nobody, and the release took dp 2 out of
 * `South|3|1`. "A produced exit awards no empty seat, on any path" (exit-propagation.md). The round trip now leaves the
 * draw that forward play reaches from the three standing results.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);

// the legacy `matchUpStatusCodes` are left out: they are F1's, exempt from the round trip and counted on their own
// ledger (the cleared draw reads `['', 'WO']` on `South|2|1`, which forward play leaves blank)
const withoutCodes = (projection: any[]) =>
  projection.map((structure) => ({
    ...structure,
    matchUps: structure.matchUps.map((row: any[]) => row.filter((_: any, index: number) => index !== 4)),
  }));
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20733408 };
const STANDING = [
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|8', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
];
const PROBE = at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 });

function enter(drawId: string, step: Step) {
  const { matchUpId } = find(drawId, coordinate(step));
  const observed = observeMutation({ propagateExitStatus: true, matchUpId, outcome: step.outcome, drawId });
  expect(observed.error).toBeUndefined();
  return matchUpId;
}

it('a loser carried into a produced exit and taken back leaves the exit pending and its reservation standing', () => {
  setSubscriptions({});
  const drawId = 'seat-emptied-further-on';
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const step of STANDING) enter(drawId, step);
  const forward = withoutCodes(projectDraw(getDrawDefinition(drawId)));

  // the forward state: the produced walkover waits over the empty dp 2, which it has reserved in the next round
  expect(find(drawId, 'South|2|1').matchUpStatus).toEqual(WALKOVER);
  expect(find(drawId, 'South|2|1').winningSide).toBeUndefined();
  expect(find(drawId, 'South|2|1').drawPositions.filter(Boolean)).toEqual([2]);
  expect(find(drawId, 'South|3|1').drawPositions.filter(Boolean)).toEqual([2]);

  const matchUpId = enter(drawId, PROBE);
  // the probe's loser reaches dp 2 through the BYE and meets the produced walkover there
  expect(find(drawId, 'South|2|1').sides[0].participantId).toBeDefined();
  const cleared = observeMutation({ propagateExitStatus: true, matchUpId, outcome: clearOutcome, drawId });
  expect(cleared.error).toBeUndefined();

  const southTwo = find(drawId, 'South|2|1');
  expect(southTwo.matchUpStatus).toEqual(WALKOVER);
  expect(southTwo.winningSide).toBeUndefined();
  expect(southTwo.sides[0].participantId).toBeUndefined();
  const southThree = find(drawId, 'South|3|1');
  expect(southThree.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(southThree.drawPositions.filter(Boolean)).toEqual([2]);
  // and the whole draw is the one the standing results reach
  expect(withoutCodes(projectDraw(getDrawDefinition(drawId)))).toEqual(forward);
});

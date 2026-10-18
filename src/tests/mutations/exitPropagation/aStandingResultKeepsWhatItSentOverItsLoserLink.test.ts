import {
  getDrawMatchUps,
  getDrawDefinition,
  observeMutation,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A RESULT THAT STANDS KEEPS WHAT IT SENT OVER ITS LOSER LINK (census A1 int2, provenance set: 36 COMPASS rows under
 * `doubleExitPropagateBye: false`; COMPASS 16/14, `propagateExitStatus: true`, seed 21027146).
 *
 * `East|1|2`'s walkover loser carries the walkover past `West|1|1`'s BYE into `West|2|1`, which is decided for the seat
 * opposite before anyone reaches it (a carried exit awards its opponent's side). The carrier is that matchUp's loser, so
 * they go on over its loser link into `Southwest|1|1`, carrying the walkover there too. A double walkover at
 * `East|1|3` then produces a walkover in `West|1|2`, whose winner reaches `West|2|1`'s empty seat and goes on.
 *
 * Clearing the double walkover walks the unwind into `West|2|1` to take that winner back (`sentOnThrough`). `West|2|1`'s
 * own walkover is not this unwind's (its origin is `East|1|2`) and it stands, yet `removeDoubleExit` went on to its
 * loser target as if its result were being withdrawn: `Southwest|1|1` was reset to TO_BE_PLAYED, its carry gone, while
 * the carrier still stood there. In every entry order `Southwest|1|1` holds the carry (14 of 14 on the census case,
 * COMPASS 32/31 21134894).
 */

const CLEAR = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
const view = (matchUp: any) => ({
  drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
  sideExitProvenance: matchUp.sideExitProvenance,
  matchUpStatus: matchUp.matchUpStatus,
  winningSide: matchUp.winningSide,
});

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 14, drawSize: 16, seed: 21027146 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const STEPS = [
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|4', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
];
const PROBE = at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER });

it('clearing a double walkover leaves the carry a standing result sent over its loser link', () => {
  const drawId = 'standing-loser-link';
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY)).toEqual(true);
  for (const step of STEPS) {
    const { matchUpId } = find(drawId, coordinate(step));
    expect(
      observeMutation({ propagateExitStatus: true, matchUpId, outcome: step.outcome, drawId }).error,
    ).toBeUndefined();
  }
  const carried = view(find(drawId, 'Southwest|1|1'));
  expect(carried.matchUpStatus).toEqual(WALKOVER);
  expect(carried.winningSide).toEqual(2);
  expect(carried.sideExitProvenance?.[1]?.sourceMatchUpId).toEqual(find(drawId, 'West|2|1').matchUpId);
  const before = projectDraw(getDrawDefinition(drawId));

  const { matchUpId } = find(drawId, coordinate(PROBE));
  const forward = observeMutation({ propagateExitStatus: true, matchUpId, outcome: PROBE.outcome, drawId });
  expect(forward.error).toBeUndefined();
  expect(find(drawId, 'West|2|1').drawPositions.filter(Boolean)).toHaveLength(2);
  const cleared = observeMutation({ propagateExitStatus: true, matchUpId, outcome: CLEAR, drawId });
  expect(cleared.error).toBeUndefined();

  expect(view(find(drawId, 'Southwest|1|1'))).toEqual(carried);
  expect(projectDraw(getDrawDefinition(drawId))).toEqual(before);
});

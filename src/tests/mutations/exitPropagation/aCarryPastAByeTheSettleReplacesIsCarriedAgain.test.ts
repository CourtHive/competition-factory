import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  projectDraw,
} from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { COMPASS } from '@Constants/drawDefinitionConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A CARRY PAST A BYE THE SETTLE PUTS BACK IS CARRIED AGAIN (census A1 wave 3 R12, the on/off path: COMPASS 32/32 seed
 * 21097909 and 32/31 21155755, each on the off and the on arm, 4 rows; this is 21097909 shrunk to three
 * walkovers and the probe).
 *
 * Three first-round walkovers in East send their carriers on. One ends at `Southeast|1|1` opposite a BYE, the BYE
 * `South|1|1`'s double walkover leaves at its loser seat, and is carried past it into `Southeast|2|1`, which reads
 * WALKOVER, awarded to the seat still to be filled. A double walkover at `East|1|2` turns `West|1|1` into a BYE match,
 * so `South|1|1` is a BYE match too. Clearing it unwinds that: `South|1|1` loses its BYE, its own loser seat's BYE is
 * taken back, and the carry past it goes with it, as the rule says. Then `settleForwardConsequences` directs
 * `West|1|1`'s re-derived loser into `South|1|1`, the double walkover there forms again and puts the BYE back in front
 * of the carrier. The carry past a late BYE (`reconcileCarriesPastByes`) had already been asked, in `settleDraw`, so
 * `Southeast|2|1` was left TO_BE_PLAYED with the carrier in it. It is asked again once the forward settle has
 * written, and the clear returns the draw it started from.
 */

const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 32, seed: 21097909, drawSize: 32 };
const DRAW_ID = 'carry-past-a-bye-the-settle-replaces';
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (key: string) => getDrawMatchUps(DRAW_ID).find((matchUp: any) => coordinate(matchUp) === key);

function enter(key: string, outcome: any) {
  const observed = observeMutation({
    propagateExitStatus: true,
    matchUpId: find(key).matchUpId,
    drawId: DRAW_ID,
    outcome,
  });
  expect(observed.error).toBeUndefined();
  expect(observed.thrown).toBeUndefined();
}

it('a carrier passing a BYE the forward settle placed again is carried past it again', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID)).toBe(true);
  enter('East|1|6', { matchUpStatus: WALKOVER, winningSide: 2 });
  enter('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 });
  enter('East|1|1', { matchUpStatus: WALKOVER, winningSide: 2 });

  expect(find('South|1|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find('Southeast|1|1').matchUpStatus).toEqual(BYE);
  const carried = find('Southeast|2|1');
  expect(carried.matchUpStatus).toEqual(WALKOVER);
  expect(carried.winningSide).toEqual(2);
  const carrier = carried.sides.find((side: any) => side.sideNumber === 1)?.participantId;
  expect(carrier).toBeDefined();
  const before = projectDraw(getDrawDefinition(DRAW_ID));

  enter('East|1|2', { matchUpStatus: DOUBLE_WALKOVER });
  expect(find('West|1|1').matchUpStatus).toEqual(BYE);
  expect(find('South|1|1').matchUpStatus).toEqual(BYE);
  enter('East|1|2', CLEAR);

  const after = find('Southeast|2|1');
  expect(after.sides.find((side: any) => side.sideNumber === 1)?.participantId).toEqual(carrier);
  expect(after.matchUpStatus).toEqual(WALKOVER);
  expect(after.winningSide).toEqual(2);
  expect(projectDraw(getDrawDefinition(DRAW_ID))).toEqual(before);
});

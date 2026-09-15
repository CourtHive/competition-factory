import { compareRoutes, coordKey, generateDraw, playForward } from '@Tests/testHarness/exitPropagation/routeComparison';
import type { Coord } from '@Tests/testHarness/exitPropagation/routeComparison';
import { expect, it, describe } from 'vitest';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * `swapWinnerLoser` must correct EVERY structure the source structure feeds — not only the one
 * this matchUp's own loser link points at.
 *
 * ## The defect
 *
 * `subsequentStructureIds` was built from (a) same-stage structures with a GREATER `stageSequence`,
 * (b) **this matchUp's own** loser/winner target structures, and (c) structures in that target's
 * stage with a greater `stageSequence`. Every other structure fed by a **different round of the
 * same source structure** sits at the **same** `stageSequence`, so it was never iterated and its
 * `positionAssignments` were never corrected.
 *
 * Measured topology at drawSize 16 — every one of these targets is at the same `stageSequence`:
 *
 *   COMPASS   East r1 -> West   | East r2 -> North   | East r3 -> Northeast   (all PLAY_OFF seq 2)
 *   OLYMPIC   East r1 -> West   | East r2 -> North                           (all PLAY_OFF seq 2)
 *   CURTIS    Main r1 -> Consolation 1 | Main r2 -> Consolation 1 | Main r3 -> Play Off
 *
 * So flipping `East|1|4` corrected West and left North and Northeast holding the participant who
 * no longer lost that round — while the one who now loses it is absent entirely. Both halves are
 * wrong at once.
 *
 * ## Why the oracle is a comparison, not an assertion on a position
 *
 * Route B — clear downstream, apply without the flag, re-enter — is what every consumer that does
 * NOT send `allowChangePropagation` already gets. It is the reference by definition, so the
 * property is "the two routes agree", which needs no independent model of what each bracket ought
 * to do. `getDrawInconsistencies` rates some of these divergences clean, so a scanner cannot
 * substitute for the comparison.
 */

const DRAW_SIZE = 16;
const SEED = 7001;

/** Resolve a coordinate to its index in the play order, failing loudly if it is not there. */
function indexOf(playOrder: Coord[], coord: Coord): number {
  const index = playOrder.findIndex((entry) => coordKey(entry) === coordKey(coord));
  // A coordinate that names no played matchUp would make every assertion below vacuous — the flip
  // would simply never run. Fail here instead, naming the coordinate.
  expect(index, `${coordKey(coord)} was never played`).toBeGreaterThanOrEqual(0);
  return index;
}

function routesAgreeOn(drawType: string, coord: Coord): string[] {
  const drawId = `fed-${drawType}`;
  generateDraw(drawType, drawId, DRAW_SIZE, SEED);
  const playOrder = playForward(drawId);
  const index = indexOf(playOrder, coord);

  const { differences, skipped } = compareRoutes({
    playOrder,
    drawType,
    drawSize: DRAW_SIZE,
    drawId,
    index,
    seed: SEED,
  });

  // A skipped comparison proves nothing in either direction — it means one route declined the
  // flip, so a passing assertion below would be vacuous. This is the "prove the probe exercises
  // the mechanism" guard.
  expect(differences, `comparison did not run: ${skipped}`).not.toBeNull();
  return differences as string[];
}

describe('swapWinnerLoser corrects every structure the source structure feeds', () => {
  it('COMPASS — flipping East r1 corrects North and Northeast, not just West', () => {
    expect(routesAgreeOn(COMPASS, { structureName: 'East', roundNumber: 1, roundPosition: 4 })).toEqual([]);
  });

  it('OLYMPIC — flipping East r1 corrects North as well as West', () => {
    expect(routesAgreeOn(OLYMPIC, { structureName: 'East', roundNumber: 1, roundPosition: 4 })).toEqual([]);
  });

  /**
   * `roundPosition: 3`, not 4, and the difference is the whole point.
   *
   * Under a side-1-always-wins play-forward the `Main|1|4` winner loses in round 2 and never
   * reaches the round-3 feed, so that flip cannot touch `Play Off` and the assertion passed
   * against the unfixed engine — a test that is green before the fix measures nothing. `Main|1|3`
   * is one of the four coordinates the differential shows actually diverging on `Play Off`.
   */
  it('CURTIS_CONSOLATION — flipping Main r1 corrects Play Off as well as Consolation 1', () => {
    expect(routesAgreeOn(CURTIS_CONSOLATION, { structureName: 'Main', roundNumber: 1, roundPosition: 3 })).toEqual([]);
  });

  /**
   * NEGATIVE CONTROL — green both before and after the fix.
   *
   * SINGLE_ELIMINATION feeds no structure at all, so widening the set of structures visited cannot
   * change its outcome. If this ever goes red, the change has reached somewhere it has no business
   * being, and the three assertions above stop meaning "Gap 1 is closed".
   */
  it('SINGLE_ELIMINATION — a draw that feeds nothing is unaffected', () => {
    expect(routesAgreeOn(SINGLE_ELIMINATION, { structureName: 'Main', roundNumber: 1, roundPosition: 4 })).toEqual([]);
  });

  /**
   * SECOND CONTROL — both of FMLC's loser links target the SAME structure, so FMLC has no Gap 1.
   * It is listed here to pin that down: this case was already agreeing before the change and must
   * still agree after it. FMLC's remaining divergences are Gaps 2 and 3, which this workstream
   * deliberately does not fix — so a coordinate known to be clean is the one asserted.
   */
  it('FIRST_MATCH_LOSER_CONSOLATION — single fed structure, unaffected', () => {
    expect(
      routesAgreeOn(FIRST_MATCH_LOSER_CONSOLATION, { structureName: 'Main', roundNumber: 1, roundPosition: 4 }),
    ).toEqual([]);
  });
});

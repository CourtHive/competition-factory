import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { matchUpIsScored } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A RESULT THE SETTLE REMOVES TAKES ITS `scoredTime` WITH IT (outcome-pipeline.md § 5 step 5; found preparing the
 * outcome v2 executor's S2, 2026-10-24).
 *
 * `reconcileScoredTimes` takes the stamp off every matchUp left without a result. It was asked before `settleDraw`
 * and the passes after it, and those can take a result away. Here (the schedule of
 * `aCarryPastAConvergencesByeIsCarriedOnTheFirstEntry`, COMPASS 32/27 seed 21138626), `East|1|3`'s double walkover
 * converges two exits in `West|2|1`; the settle serves the convergence's loser link and `Southwest|1|1`, which held
 * the first carrier's walkover, becomes a BYE. Its `scoredTime` stayed until the next call, whatever that call was.
 *
 * Measured over the exitPropagation, drawDefinitions and matchUps suites before the change: 19 calls ended with a
 * matchUp holding a `scoredTime` and no result (13 BYEs, 6 TO_BE_PLAYED, in COMPASS, DOUBLE_ELIMINATION and the
 * FEED_IN draws); after it, none.
 */
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const config = { participantsCount: 27, propagateExitStatus: true, drawSize: 32, drawType: COMPASS, seed: 21138626 };
const steps = [
  { key: 'East|1|2', outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  { key: 'East|1|8', outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
  { key: 'East|1|4', outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
  { key: 'East|1|3', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
];
const stampedWithoutAResult = (drawId: string) =>
  getDrawMatchUps(drawId)
    .filter((matchUp: any) => matchUp.schedule?.scoredTime && !matchUpIsScored(matchUp))
    .map(coordinate);

it('a matchUp the settle turns into a BYE keeps no scoredTime past the call', () => {
  setSubscriptions({});
  const drawId = 'a-result-the-settle-removes';
  expect(prepareDraw(config, drawId)).toEqual(true);
  for (const { key, outcome } of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    const observed = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome, drawId });
    expect(observed.error).toBeUndefined();
    expect(stampedWithoutAResult(drawId), `after ${key}`).toEqual([]);
  }
  // CONTROL: the settle did turn the walkover's holder into a BYE in the last call
  const holder = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === 'Southwest|1|1');
  expect(holder.matchUpStatus).toEqual(BYE);
});

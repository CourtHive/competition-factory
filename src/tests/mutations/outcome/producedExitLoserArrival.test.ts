import { CARRIED, compareUndirectedWinner, won } from '@Tests/testHarness/outcome/directionFixtures';
import { describe, it } from 'vitest';

// constants and types
import type { Scenario, Target } from '@Tests/testHarness/outcome/directionFixtures';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
} from '@Constants/drawDefinitionConstants';

/**
 * C29: A LOSER ARRIVING WHERE A DOUBLE EXIT'S PRODUCED EXIT STANDS PENDING. Every first-round matchUp of the main
 * structure is played, then a first-round matchUp of the loser structure is a double exit: its produced exit stands in
 * the next round's matchUp, awarded to nobody, the seat the main structure's second round feeds still empty. That
 * second-round matchUp is then decided. v1's `assignDrawPosition` places its loser on the fed seat, awards them the
 * held exit (`applyPositionToMatchUp`) and sends their position on (`advanceIntoWinnerMatchUp`): C19's award, on the
 * loser's link (`producedLoserArrival`). The award is written with no direction, so nothing propagates from it, with
 * or without `propagateExitStatus` on the call (`awardsStandingExit`).
 */

const at = (structureName: string, roundNumber: number, roundPosition: number): Target => ({
  structureName,
  roundNumber,
  roundPosition,
});

// [drawType, drawSize, loser structure, its first-round double exit, the main second-round matchUp feeding beside it]
const RECIPES: [string, number, string, number, number][] = [
  [FEED_IN_CHAMPIONSHIP, 8, 'Consolation', 1, 2],
  [FEED_IN_CHAMPIONSHIP, 8, 'Consolation', 2, 1],
  [FEED_IN_CHAMPIONSHIP, 16, 'Consolation', 1, 4],
  [FEED_IN_CHAMPIONSHIP, 16, 'Consolation', 2, 3],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 16, 'Consolation', 1, 4],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 16, 'Consolation', 2, 3],
  [FEED_IN_CHAMPIONSHIP_TO_SF, 16, 'Consolation', 1, 4],
  [FEED_IN_CHAMPIONSHIP_TO_SF, 16, 'Consolation', 2, 3],
  [DOUBLE_ELIMINATION, 16, 'Backdraw', 1, 1],
  [DOUBLE_ELIMINATION, 16, 'Backdraw', 2, 2],
];

function arrival(
  [drawType, drawSize, structureName, doubled, fed]: (typeof RECIPES)[number],
  doubleExit: string,
  winningSide: 1 | 2,
  carried: boolean,
): Scenario {
  return {
    drawProfile: { drawType, drawSize },
    nonRandom: 1,
    setup: [
      ...Array.from({ length: drawSize / 2 }, (_, index) => ({ target: at('Main', 1, index + 1), outcome: won(1) })),
      { target: at(structureName, 1, doubled), outcome: { matchUpStatus: doubleExit }, params: CARRIED },
    ],
    steps: [{ target: at('Main', 2, fed), outcome: won(winningSide), params: carried ? CARRIED : {} }],
  };
}

describe('C29 a loser arriving where a double exit produced its exit, still pending', () => {
  const cases = RECIPES.flatMap((recipe) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((doubleExit) =>
      ([1, 2] as const).flatMap((winningSide) =>
        [false, true].map(
          (carried) =>
            [
              `${recipe[0]} ${recipe[1]} ${recipe[2]} 1/${recipe[3]} ${doubleExit}, Main 2/${recipe[4]} won by side ${winningSide}, propagateExitStatus ${carried}`,
              recipe,
              doubleExit,
              winningSide,
              carried,
            ] as const,
        ),
      ),
    ),
  );
  it.each(cases)(
    '%s: owned, with the record, results and notices v1 leaves',
    (_, recipe, doubleExit, side, carried) => {
      compareUndirectedWinner(arrival(recipe, doubleExit, side, carried), true);
    },
  );
});

import { CARRIED, POLICY_OFF, compareUndirectedWinner, won } from '@Tests/testHarness/outcome/directionFixtures';
import { describe, it, vi } from 'vitest';

// constants and types
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
} from '@Constants/drawDefinitionConstants';

// counts v1's matchUp writes, so `compareUndirectedWinner` can assert v2 left none (`v2.v1Writes === 0`)
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

/**
 * C30: A LOSER ARRIVING WHERE A DOUBLE EXIT'S PRODUCED EXIT STANDS AWARDED TO THEIR SEAT. Under USTA's policy
 * (`doubleExitPropagateBye` off) the main structure's first-round double exit produces an exit in the loser structure,
 * awarded at once to the seat the paired feeder's loser will take, and that seat's position goes on. The paired feeder
 * is then decided: v1's `assignDrawPosition` places its loser on the awarded seat, re-derives the award's codes and
 * announces both matchUps as the assignment (`awardedProducedArrival`, C18's ops with the produced exit as carrier).
 * FIRST_MATCH_LOSER_CONSOLATION's onward matchUp is a BYE, and v1 relays the position through it: that stays v1's.
 */

const MAIN_R1 = (roundPosition: number) => ({ structureName: 'Main', roundNumber: 1, roundPosition });

// [drawType, drawSize]
const OWNED: [string, number][] = [
  [FIRST_ROUND_LOSER_CONSOLATION, 8],
  [FIRST_ROUND_LOSER_CONSOLATION, 16],
  [DOUBLE_ELIMINATION, 8],
  [DOUBLE_ELIMINATION, 16],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 8],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 16],
  [FEED_IN_CHAMPIONSHIP, 8],
  [FEED_IN_CHAMPIONSHIP, 16],
  [CURTIS_CONSOLATION, 16],
];
const RELAYED: [string, number][] = [
  [FIRST_MATCH_LOSER_CONSOLATION, 8],
  [FIRST_MATCH_LOSER_CONSOLATION, 16],
];

function arrival(
  drawType: string,
  drawSize: number,
  doubleExit: string,
  winningSide: 1 | 2,
  carried: boolean,
): Scenario {
  return {
    drawProfile: { drawType, drawSize },
    nonRandom: 1,
    policyDefinitions: POLICY_OFF,
    setup: [{ target: MAIN_R1(1), outcome: { matchUpStatus: doubleExit }, params: CARRIED }],
    steps: [{ target: MAIN_R1(2), outcome: won(winningSide), params: carried ? CARRIED : {} }],
  };
}

const casesOf = (draws: [string, number][]) =>
  draws.flatMap(([drawType, drawSize]) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((doubleExit) =>
      ([1, 2] as const).flatMap((winningSide) =>
        [false, true].map(
          (carried) =>
            [
              `${drawType} ${drawSize} Main 1/1 ${doubleExit}, 1/2 won by side ${winningSide}, propagateExitStatus ${carried}`,
              drawType,
              drawSize,
              doubleExit,
              winningSide,
              carried,
            ] as const,
        ),
      ),
    ),
  );

describe('C30 a loser arriving where a double exit produced its exit, awarded to their seat', () => {
  it.each(casesOf(OWNED))(
    '%s: owned, with the record, results and notices v1 leaves',
    (_, drawType, drawSize, doubleExit, side, carried) => {
      compareUndirectedWinner(arrival(drawType, drawSize, doubleExit, side, carried), true);
    },
  );
  it.each(casesOf(RELAYED))(
    '%s: the onward BYE relays the position, v1s',
    (_, drawType, drawSize, doubleExit, side, carried) => {
      // recorded whole (batch 3): the title is historical
      compareUndirectedWinner(arrival(drawType, drawSize, doubleExit, side, carried), true);
    },
  );
});

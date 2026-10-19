import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP_TO_SF, MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A CARRY GOES HOME WHEN THE BYE IT PASSED IS REPLACED (census run 18, regressions from census run 17's #5425/#5426;
 * default progression policy).
 *
 * A first-round double walkover in Main leaves its loser seat in the Consolation a propagated BYE. A participant who
 * walked over or defaulted elsewhere is carried past that BYE, and past the next, and their exit decides a matchUp two
 * rounds on. Then the double walkover is relabelled as a played result: its loser takes the BYE's seat, and the carrier
 * comes home to meet them. The copy of the carry two rounds on stayed where it was:
 *
 *  - 20660398 (FEED_IN_CHAMPIONSHIP_TO_SF 16/14): `Consolation|3|2`, DEFAULTED for its empty seat, was released only
 *    from rounds the removal knew a BYE had been passed in — and the removal took a BYE away without saying so. The
 *    default stood, a later result could not seat its winner, and was refused after it had written
 *    (ERROR_IMPLIES_NO_MUTATION).
 *  - 20685332 (MODIFIED_FEED_IN_CHAMPIONSHIP 16/14): `Consolation|3|2`'s walkover had been awarded to a participant
 *    already there, who went on to `4|1`. The participant replacing the BYE came through to `3|2`, won it on the stale
 *    walkover, and reached `4|1` too (TWO_POSITIONS_FROM_ONE_FEEDER).
 *
 * In both, `Consolation|3|2` ends as forward play leaves it: undecided, with whoever has really arrived.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const CASES = [
  {
    config: {
      drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
      propagateExitStatus: true,
      participantsCount: 14,
      drawSize: 16,
      seed: 20660398,
    },
    schedule: [
      at('Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|6', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|5', { winningSide: 2 }),
      at('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('Main|1|6', { winningSide: 1 }),
      at('Consolation|1|3', { winningSide: 2 }),
    ],
    expected: { 'Consolation|3|2': { matchUpStatus: TO_BE_PLAYED, winningSide: undefined } },
  },
  {
    config: {
      drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
      propagateExitStatus: true,
      participantsCount: 14,
      drawSize: 16,
      seed: 20685332,
    },
    schedule: [
      at('Main|1|2', { winningSide: 1 }),
      at('Main|2|1', { winningSide: 1 }),
      at('Main|1|7', { winningSide: 1 }),
      at('Consolation|2|4', { winningSide: 1 }),
      at('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('Main|1|5', { winningSide: 2 }),
    ],
    expected: {
      'Consolation|3|2': { matchUpStatus: TO_BE_PLAYED, winningSide: undefined },
      'Consolation|4|1': { matchUpStatus: TO_BE_PLAYED, winningSide: undefined },
    },
  },
];

it.each(CASES)('$config.seed: the census finds nothing', ({ config, schedule }) => {
  setSubscriptions({});
  expect(replay(config, schedule, `carry-goes-home-${config.seed}`)).toBeNull();
});

it.each(CASES)(
  '$config.seed: every result is accepted, and the carry is gone from where its carrier is not',
  ({ config, schedule, expected }) => {
    setSubscriptions({});
    const drawId = `carry-goes-home-steps-${config.seed}`;
    prepareDraw(config, drawId);
    const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    for (const step of schedule) {
      const result = observeMutation({
        matchUpId: find(coordinate(step)).matchUpId,
        propagateExitStatus: true,
        outcome: step.outcome,
        drawId,
      });
      expect(result.error).toBeUndefined();
    }
    for (const [key, state] of Object.entries(expected)) {
      const matchUp = find(key);
      expect({ matchUpStatus: matchUp.matchUpStatus, winningSide: matchUp.winningSide }).toEqual(state);
      // whoever stands here arrived: no position in it is held by more than one participant's advance
      const seated = (matchUp.sides ?? []).map((side: any) => side.participantId).filter(Boolean);
      expect(new Set(seated).size).toEqual(seated.length);
    }
  },
);

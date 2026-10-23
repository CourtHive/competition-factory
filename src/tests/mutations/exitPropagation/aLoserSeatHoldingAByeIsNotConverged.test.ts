import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGED LOSER SEAT IS THE SAME IN EVERY ORDER (census policy-off MONOTONIC_DECISION, COMPASS 32/31 under
 * `doubleExitPropagateBye: false`, seed 20551581, failing since run 15; shrunk from 30 steps to 15, the mechanism to 5).
 *
 * `South|1|3` holds a produced walkover (`West|1|5` defaulted, `West|1|6` walked over) and sends it into
 * `Southeast|1|2` side 1. `South|1|4` converges two carriers (`East|1|13`'s and `East|1|15`'s losers), so its loser
 * seat, `Southeast|1|2` dp 4, holds a produced walkover and `Southeast|1|2` is a double walkover. `East|1|16`'s default
 * then makes `West|1|8` a double default: its carrier leaves `South|1|4`, the convergence is re-derived to a single
 * exit and withdrawn from dp 4, and `South|1|4`, now a carrier beside a produced exit, converges again. Under the policy
 * off a double exit's loser seat shows the exit it produced, never a BYE (CA ruling (A), 2026-10-21), so dp 4 holds the
 * produced walkover and `Southeast|1|2` is a double walkover whichever of `East|1|13` and `East|1|16` comes first. (Before
 * the ruling the seat that already held a BYE was settled, and this file pinned `Southeast|1|2` as a BYE in both orders.)
 *
 * The census schedule's probes also take `West|1|2` and `East|2|2` from a pending single exit to a convergence and back.
 * Clearing the probe must give the seat back the BYE the pending exit owes it, claimed by the double exit that produced it,
 * as forward play leaves it (`restoreProducedExitLoserBye`).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 31, drawSize: 32, seed: 20551581 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const DEFAULTED_1 = { matchUpStatus: DEFAULTED, winningSide: 1 };
const WALKOVER_1 = { matchUpStatus: WALKOVER, winningSide: 1 };
const WALKOVER_2 = { matchUpStatus: WALKOVER, winningSide: 2 };

const CENSUS_SCHEDULE = [
  at('East|1|12', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', DEFAULTED_1),
  at('East|1|9', DEFAULTED_1),
  at('East|1|11', WALKOVER_1),
  at('East|1|15', DEFAULTED_1),
  at('East|1|7', { winningSide: 2 }),
  at('East|1|12', { winningSide: 1 }),
  at('East|1|13', WALKOVER_1),
  at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|5', WALKOVER_2),
  at('East|1|16', DEFAULTED_1),
  at('East|1|11', { winningSide: 1 }),
  at('East|1|2', { winningSide: 2 }),
  at('East|1|5', { winningSide: 1 }),
  at('East|1|8', { winningSide: 1 }),
];

const SOUTH_1_3_PRODUCED = [at('East|1|9', DEFAULTED_1), at('East|1|11', WALKOVER_1), at('East|1|15', DEFAULTED_1)];
const CONVERGE_THEN_BYE = [...SOUTH_1_3_PRODUCED, at('East|1|13', WALKOVER_1), at('East|1|16', DEFAULTED_1)];
const BYE_THEN_CARRIER = [...SOUTH_1_3_PRODUCED, at('East|1|16', DEFAULTED_1), at('East|1|13', WALKOVER_1)];

function drawAfter(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.thrown).toBeUndefined();
  }
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: matchUp.drawPositions,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? BYE : undefined)),
      },
    ]),
  );
}

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, CENSUS_SCHEDULE, 'bye-held-loser-seat-census', POLICY_OFF)).toBeNull();
});

it('a converged loser seat shows the exit its convergence produced, so the matchUp it feeds converges', () => {
  const draw = drawAfter(CONVERGE_THEN_BYE, 'bye-held-loser-seat-converged');
  expect(draw['South|1|4'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  // under the policy off `South|1|4`'s loser seat, `Southeast|1|2` dp 4, shows the walkover it produced, never a BYE (CA
  // ruling (A), 2026-10-21), so the two produced walkovers meet there
  expect(draw['Southeast|1|2'].occupants).toEqual([undefined, undefined]);
  expect(draw['Southeast|1|2'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  // and that convergence's produced walkover waits, unawarded, in the next round
  expect(draw['Southeast|2|1'].matchUpStatus).toEqual(WALKOVER);
  expect(draw['Southeast|2|1'].winningSide).toBeUndefined();
});

it('the BYE-held loser seat is the same whichever result is entered first', () => {
  const convergedFirst = drawAfter(CONVERGE_THEN_BYE, 'bye-held-loser-seat-converged-first');
  const byeFirst = drawAfter(BYE_THEN_CARRIER, 'bye-held-loser-seat-bye-first');
  expect(convergedFirst).toEqual(byeFirst);
});

it('a walkover corrected to a played win leaves its winner nowhere in the consolation structures', () => {
  const draw = drawAfter(
    [
      ...SOUTH_1_3_PRODUCED,
      at('East|1|13', WALKOVER_1),
      at('East|1|5', WALKOVER_2),
      at('East|1|16', DEFAULTED_1),
      at('East|1|5', { winningSide: 1 }),
    ],
    'bye-held-loser-seat-corrected',
  );
  const [winner] = draw['East|1|5'].occupants;
  const elsewhere = Object.entries(draw)
    .filter(([key, matchUp]: any) => !key.startsWith('East|') && matchUp.occupants.includes(winner))
    .map(([key]) => key);
  expect(elsewhere).toEqual([]);
  expect(draw['Southeast|1|1'].occupants).toEqual([BYE, undefined]);
});

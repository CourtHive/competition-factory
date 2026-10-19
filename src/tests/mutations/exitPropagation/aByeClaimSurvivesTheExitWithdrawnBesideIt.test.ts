import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A BYE CLAIM SURVIVES THE EXIT WITHDRAWN BESIDE IT (census run 20 policy-off, MONOTONIC_DECISION, COMPASS 16/13:
 * 20964176).
 *
 * `West|2|2` holds two produced walkovers, a convergence, which sends a produced exit to its loser seat in
 * `Southwest|1|1`. Re-scoring `East|1|5` as a played win dissolves it: `West|2|2` is a single exit won by the
 * participant who arrives, its loser is nobody, and the seat in `Southwest|1|1` becomes a BYE, claimed by `West|2|2`.
 * In the same settle the produced exit the double exit had sent to that seat is withdrawn, and the withdrawal cleared
 * the side's whole record: the claim went with the exit. When a relabel of `East|1|7` later brought `West|2|2` a real
 * opponent, nothing recorded the BYE as `West|2|2`'s, so it stood, and `West|2|2`'s loser replaced it a result later.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const config = { drawType: COMPASS, propagateExitStatus: false, participantsCount: 13, drawSize: 16, seed: 20964176 };
const schedule = [
  at('East|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|5', { winningSide: 1 }),
  at('East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|2', { winningSide: 1 }),
  at('East|1|3', { winningSide: 1 }),
  at('West|1|2', { winningSide: 1 }),
  at('East|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('West|2|1', { winningSide: 2 }),
  at('East|2|1', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('East|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];
const corrected = [0, 1];

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const result: any = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.thrown).toBeUndefined();
  }
  return getDrawMatchUps(drawId);
}

const byCoordinate = (matchUps: any[]) =>
  Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );

it('the BYE West|2|2 claims for its loser is recorded as its claim after the convergence dissolves', () => {
  const matchUps = play(schedule.slice(0, 3), 'claim-recorded');
  const claimant = matchUps.find((matchUp: any) => coordinate(matchUp) === 'West|2|2');
  const seat = matchUps.find((matchUp: any) => coordinate(matchUp) === 'Southwest|1|1');
  expect(seat.matchUpStatus).toEqual(BYE);
  const claims = [1, 2].flatMap((sideNumber) => seat.sideExitProvenance?.[sideNumber]?.byeClaims ?? []);
  expect(claims).toContain(claimant.matchUpId);
});

it('the BYE goes when West|2|2 gains an opponent, and the draw is the one the results entered directly reach', () => {
  const viaCorrection = play(schedule, 'claim-corrected');
  const seat = viaCorrection.find((matchUp: any) => coordinate(matchUp) === 'Southwest|1|1');
  expect(seat.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(seat.sides.some((side: any) => side?.bye)).toEqual(false);

  const direct = play(
    schedule.filter((_, index) => !corrected.includes(index)),
    'claim-direct',
  );
  expect(byCoordinate(viaCorrection)).toEqual(byCoordinate(direct));
});

it('the full schedule replays clean, the probe that reported it included', () => {
  setSubscriptions({});
  expect(replay(config, schedule, 'claim-replay', POLICY_OFF)).toBeNull();
});

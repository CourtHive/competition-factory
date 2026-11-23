import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A DOUBLE EXIT TAKES BACK THE BYE ITS SINGLE EXIT CLAIMED (census S6 Class B, run-18 and s17b policy-off
 * MONOTONIC_DECISION, COMPASS 32/30 under `doubleExitPropagateBye: false`, seed 20694910).
 *
 * `West|1|6`, won over `East|1|12`'s double default, had nobody to lose, so `South` dp 6 became a BYE it claimed
 * (`propagateUnfillableLoserBye`). `East|1|11` re-scored as a walkover sent a loser carrying an exit onto the winner's
 * seat, and `West|1|6` converged: a double exit, whose loser seat receives a produced exit under the policy off. The BYE
 * stood. Entered forward, with either of the two results first, dp 6 holds the produced exit, and it meets dp 7's in
 * `South|2|2`.
 *
 * The census entered the whole history; the last call is its probe.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20694910 };
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };

const SCHEDULE = [
  at('East|1|10', CLEAR),
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|6', { winningSide: 1 }),
  at('East|1|11', { winningSide: 2 }),
  at('East|1|2', RETIRED_6_3),
  at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|9', { winningSide: 2 }),
  at('East|1|8', { winningSide: 2 }),
  at('East|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|12', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|11', { winningSide: 2 }),
  at('East|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|7', { winningSide: 1 }),
  at('East|1|9', { winningSide: 1 }),
  at('East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|4', { winningSide: 1 }),
  at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|2|6', { winningSide: 1 }),
  at('East|1|9', { winningSide: 1 }),
  at('East|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|8', { winningSide: 2 }),
  at('East|1|3', { winningSide: 1 }),
  at('East|1|3', { winningSide: 2 }),
  at('East|1|15', { winningSide: 2 }),
  at('East|2|6', { winningSide: 2 }),
  at('East|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|2|8', RETIRED_6_3),
  at('East|2|8', { winningSide: 2 }),
];
// the census probes, in the order it applied them (a probe re-applied by the idempotence and do/undo checks included)
const PROBES = [
  at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|13', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];

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
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
}

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'double-exit-bye-census', POLICY_OFF)).toBeNull();
});

it('a BYE a single exit claimed goes when it converges: the seat holds the produced exit', () => {
  const census = drawAfter([...SCHEDULE, ...PROBES], 'double-exit-bye-dp6');
  expect(census['South|1|3'].occupants).toEqual(['BYE', undefined]);
  // dp 6's produced walkover meets dp 7's a round on
  expect(census['South|2|2'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
});

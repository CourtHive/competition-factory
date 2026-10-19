import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import {
  BYE,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A PENDING EXIT AWAITING AN ARRIVAL CAN STILL DELIVER (census S8 policy-off, MONOTONIC_DECISION, OLYMPIC 32/30:
 * 20609643).
 *
 * `South|2|1` holds a produced walkover beside its BYE. Its target `South|3|1`'s other feeder, `South|2|2`, holds a
 * PENDING walkover (sent on from `South|1|3` since #5455's "a held exit is sent on while its target's other feeder can
 * deliver"), whose other seat waits for whoever comes through `South|1|4`. That feeder read as a dead end: an exit,
 * with no participant and no winner. So when a later walkover in `East|1|6` re-converged `West|1|3` and, through it,
 * `South|1|2`, the exit re-produced into `South|2|1` stayed behind its BYE and `South|3|1`, which had held the BYE,
 * read TO_BE_PLAYED: a decided matchUp undecided by an unrelated result. Entered first, the same walkover left a BYE
 * there instead. Whoever reaches the pending exit's empty seat wins it and goes on, so the feeder can deliver, the held
 * exit goes on pending, and every order of these results reaches one draw. Passed before 5acc7ac91e.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const config = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20609643 };
const schedule = [
  at('East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|2', { winningSide: 2 }),
  at('East|1|9', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];
const later = [at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER }), at('East|1|4', { matchUpStatus: DOUBLE_DEFAULT })];
const walkover = at('East|1|6', { matchUpStatus: WALKOVER, winningSide: 1 });

function drawAfter(steps: Step[], drawId: string) {
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

it('20609643: the schedule and its relational probes leave a consistent, monotonic draw', () => {
  setSubscriptions({});
  expect(replay(config, schedule, 'pending-delivers', POLICY_OFF)).toBeNull();
});

it('20609643: the walkover entered last does not undecide the matchUp past the BYE', () => {
  const before = drawAfter([...schedule, ...later], 'pending-delivers-before');
  const after = drawAfter([...schedule, ...later, walkover], 'pending-delivers-after');
  expect(before['South|3|1'].matchUpStatus).not.toEqual(TO_BE_PLAYED);
  expect(after['South|3|1'].matchUpStatus).not.toEqual(TO_BE_PLAYED);
});

it('20609643: the held exit goes on pending, the BYE stays, whichever order the walkover comes in', () => {
  const last = drawAfter([...schedule, ...later, walkover], 'pending-delivers-last');
  const first = drawAfter([walkover, ...schedule, ...later], 'pending-delivers-first');
  const between = drawAfter([...schedule, walkover, ...later], 'pending-delivers-between');
  expect(first).toEqual(last);
  expect(between).toEqual(last);
  expect(last['South|2|1'].matchUpStatus).toEqual(BYE);
  expect(last['South|3|1']).toEqual({
    matchUpStatus: WALKOVER,
    winningSide: undefined,
    occupants: [undefined, undefined],
  });
});

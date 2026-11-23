import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A DISSOLVED CONVERGENCE TAKES BACK THE BYES IT CLAIMED ONWARD (census s14 policy-off MONOTONIC_DECISION, COMPASS 16/13,
 * seed 20512801).
 *
 * `East|1|6`'s double walkover sends its exit over the loser link into `West|1|3`, where `East|1|5`'s walkover carrier
 * meets it: the two converge, and the double walkover's produced exit decides `West|2|2` a round on, with a BYE claimed
 * in `Southwest|1|1` for that matchUp's loser. `East|1|5` is then cleared and re-entered as a played win: the
 * convergence dissolves to the kept exit, which came straight down its loser link and nobody stands opposite, so it
 * settles pending. That branch settled the exit and returned, and the BYE claimed for `West|2|2`'s loser stayed: when
 * `West|2|2` was played, its loser replaced the BYE and the census read `Southwest|1|1` as un-decided. The other branch
 * of the same re-derivation already withdraws the BYEs a double exit claimed further on (exit propagation, "A BYE
 * claimed further on goes the same way"); both do now, and the draw is the one the played win entered directly reaches.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 13, drawSize: 16, seed: 20512801 };
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };
const SCHEDULE = [
  at('East|1|6', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|4', { winningSide: 1 }),
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|2', { winningSide: 2 }),
  at('West|2|1', { winningSide: 2 }),
  at('East|1|5', CLEAR),
  at('East|1|5', { winningSide: 1 }),
  at('East|1|7', { winningSide: 2 }),
  at('East|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
];

function drawAfter(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const result: any = observeMutation({
      propagateExitStatus: true,
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

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'dissolved-convergence-byes', POLICY_OFF)).toBeNull();
});

it('the loser seat of the matchUp the convergence decided is open again', () => {
  const draw = drawAfter(SCHEDULE, 'dissolved-convergence-byes-corrected');
  expect(draw['Southwest|1|1'].occupants).not.toContain('BYE');
  expect(draw['Southwest|1|1'].matchUpStatus).toEqual(TO_BE_PLAYED);
});

it('the correction reaches the draw the played win entered directly reaches', () => {
  const corrected = drawAfter(SCHEDULE, 'dissolved-convergence-byes-corrected');
  const direct = drawAfter(
    SCHEDULE.filter((_, index) => index !== 2 && index !== 5),
    'dissolved-convergence-byes-direct',
  );
  expect(corrected).toEqual(direct);
});

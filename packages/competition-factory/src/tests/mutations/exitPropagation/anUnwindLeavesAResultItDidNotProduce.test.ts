import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * AN UNWIND LEAVES A RESULT IT DID NOT PRODUCE (census s13 and s16 policy-off DRAW_INCONSISTENCY WINNER_NOT_ADVANCED,
 * COMPASS 32: 20472094, 20596101, 20599098).
 *
 * Two losers carry their exits into West and on into `Southwest|1|2`, where the two carries converge. A double exit in
 * East then sends its produced exit into West, onto the seat opposite one of the carriers, and is corrected to a played
 * win. Unwinding it walked on from `West|2|3`, the carrier's matchUp, as if that matchUp's walkover were the double
 * exit's: it took the carrier's own exit back out of `Southwest|1|2`, which then read DEFAULTED won by the carrier, who
 * never advanced. `West|2|3`'s walkover is the carrier's, untouched by the correction, so nothing it sent on is taken
 * back. The draw equals the one the played win entered directly reaches.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const CASES = [
  {
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 29, drawSize: 32, seed: 20472094 },
    schedule: [
      at('East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|15', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|10', { winningSide: 1 }),
    ],
    corrected: 2,
  },
  {
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 20596101 },
    schedule: [
      at('East|1|13', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|11', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('East|1|15', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|13', { winningSide: 2 }),
    ],
    corrected: 0,
  },
  {
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 20599098 },
    schedule: [
      at('East|1|15', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|11', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('East|1|14', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|14', { winningSide: 1 }),
    ],
    corrected: 2,
  },
];

function drawAfter(config: any, steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId, POLICY_OFF);
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

it.each(CASES)('$config.seed: the corrected schedule leaves a consistent draw', ({ config, schedule }) => {
  setSubscriptions({});
  expect(replay(config, schedule, `unwind-leaves-${config.seed}`, POLICY_OFF)).toBeNull();
});

it.each(CASES)(
  '$config.seed: the correction reaches the draw the played win entered directly reaches',
  ({ config, schedule, corrected }) => {
    const viaCorrection = drawAfter(config, schedule, `unwind-leaves-corrected-${config.seed}`);
    const direct = drawAfter(
      config,
      schedule.filter((_, index) => index !== corrected),
      `unwind-leaves-direct-${config.seed}`,
    );
    expect(viaCorrection).toEqual(direct);
    expect(viaCorrection['Southwest|1|2'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  },
);

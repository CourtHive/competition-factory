import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * AN UNWIND WALKS ON THROUGH A RESULT WHOSE EXIT A DISSOLVED CONVERGENCE PRODUCED (census run 20 policy-off,
 * ERROR_IMPLIES_NO_MUTATION ERR_OCCUPIED_DRAW_POSITION, DOUBLE_ELIMINATION 8: 20994634, 20932043).
 *
 * `Main|2|1`'s double default converges in `Backdraw|3|1` with a loser's carried default and produces a DEFAULTED,
 * which goes on past the Backdraw final's BYE into the Main final. Re-scoring `Main|2|1` as a played win dissolves the
 * convergence. The unwind reached the Main final from `Main|3|1`, read its exit's origin as `Backdraw|3|1`, which it
 * had not yet visited, and stopped there: "an unwind does not walk on through a result it leaves standing" (#5455).
 * But that result was the dissolved convergence's, so it was not standing. The Main final kept it, the participant who
 * came through the Backdraw was sent on into the Decider, and the next result was refused after a write. Both seeds
 * passed on run 19's ref; bisected to b21f2fafd1 in #5455.
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
    config: {
      drawType: DOUBLE_ELIMINATION,
      propagateExitStatus: true,
      participantsCount: 4,
      drawSize: 8,
      seed: 20994634,
    },
    schedule: [
      at('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }),
      at('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('Main|2|1', { winningSide: 2 }),
      at('Main|3|1', { winningSide: 2 }),
      at('Backdraw|4|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('Main|4|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
    ],
    corrected: [0],
  },
  {
    config: {
      drawType: DOUBLE_ELIMINATION,
      propagateExitStatus: false,
      participantsCount: 5,
      drawSize: 8,
      seed: 20932043,
    },
    schedule: [
      at('Main|1|3', { winningSide: 2 }),
      at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|2|1', { winningSide: 2 }),
      at('Backdraw|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('Main|3|1', { winningSide: 1 }),
      at('Backdraw|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('Backdraw|3|1', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|4|1', { winningSide: 2 }),
    ],
    corrected: [1, 3],
  },
];

function drawAfter(config: any, steps: Step[], drawId: string) {
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

it.each(CASES)('$config.seed: the corrected schedule leaves a consistent draw', ({ config, schedule }) => {
  setSubscriptions({});
  expect(replay(config, schedule, `dissolved-${config.seed}`, POLICY_OFF)).toBeNull();
});

it.each(CASES)(
  '$config.seed: the correction reaches the draw the results entered directly reach',
  ({ config, schedule, corrected }) => {
    const viaCorrection = drawAfter(config, schedule, `dissolved-corrected-${config.seed}`);
    const direct = drawAfter(
      config,
      schedule.filter((_, index) => !corrected.includes(index)),
      `dissolved-direct-${config.seed}`,
    );
    expect(viaCorrection).toEqual(direct);
  },
);

it('the correction entered first, then the rest, reaches the same draw (20994634)', () => {
  const [{ config, schedule }] = CASES;
  const reordered = [schedule[1], schedule[0], ...schedule.slice(2)];
  expect(drawAfter(config, reordered, 'dissolved-reordered')).toEqual(drawAfter(config, schedule, 'dissolved-logged'));
});

import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A HOLDER'S BYE LEAVES EVERY ROUND IT REACHED (census s14 MONOTONIC_DECISION, FIRST_MATCH_LOSER_CONSOLATION 16/14 and
 * 16/13, 20515211 in both default arms and 20532322 under `allowChangePropagation`).
 *
 * `Consolation|1|2`'s double walkover leaves its produced exit in `Consolation|2|2`; a BYE then takes that matchUp's other
 * seat, and the BYE position goes on alone, through `3|1` (a BYE too) into `4|1`. The double walkover is corrected to a
 * played win, its winner passes the BYE, and the BYE's position was taken back out of `3|1` only: `4|1` held both of
 * `3|1`'s positions, the BYE and the participant who had passed it, and read BYE until `3|2`'s result arrived and
 * replaced the BYE. A matchUp receives one position from each feeder; entered as a played win from the start, `4|1`
 * holds the winner alone, waiting for `3|2`.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

const CASES = [
  {
    config: {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      propagateExitStatus: false,
      participantsCount: 14,
      drawSize: 16,
      seed: 20515211,
    },
    allowChangePropagation: false,
    schedule: [
      at('Main|1|4', { winningSide: 2 }),
      at('Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('Consolation|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|5', { winningSide: 1 }),
      at('Main|1|7', { winningSide: 2 }),
      at('Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
      at('Main|2|2', { winningSide: 1 }),
      at('Main|2|4', { winningSide: 1 }),
      at('Consolation|2|4', { winningSide: 2 }),
      at('Main|1|6', { winningSide: 2 }),
      at('Consolation|1|2', { winningSide: 1 }),
      at('Consolation|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
    ],
    corrected: 2,
  },
  {
    config: {
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      propagateExitStatus: false,
      participantsCount: 13,
      drawSize: 16,
      seed: 20532322,
    },
    allowChangePropagation: true,
    schedule: [
      at('Main|1|7', { winningSide: 1 }),
      at('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('Main|1|3', { winningSide: 1 }),
      at('Consolation|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|5', { winningSide: 1 }),
      at('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|4', RETIRED_6_3),
      at('Main|2|4', { winningSide: 2 }),
      at('Main|2|3', { winningSide: 2 }),
      at('Main|1|2', { winningSide: 2 }),
      at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
    ],
    corrected: undefined,
  },
];

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

function drawAfter(config: any, steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId);
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

it.each(CASES)(
  '$config.seed: the census schedule un-decides nothing',
  ({ config, schedule, allowChangePropagation }) => {
    if (allowChangePropagation) process.env.ALLOW_CHANGE_PROPAGATION = '1';
    setSubscriptions({});
    expect(replay(config, schedule, `holders-bye-${config.seed}`)).toBeNull();
  },
);

it.each(CASES)(
  '$config.seed: the consolation semi-final holds no BYE beside the winner',
  ({ config, schedule, allowChangePropagation }) => {
    if (allowChangePropagation) process.env.ALLOW_CHANGE_PROPAGATION = '1';
    const draw = drawAfter(config, schedule, `holders-bye-last-${config.seed}`);
    expect(draw['Consolation|4|1'].occupants).not.toContain('BYE');
    expect(draw['Consolation|4|1'].matchUpStatus).not.toEqual('BYE');
  },
);

it('20515211: the correction reaches the draw the played win entered directly reaches', () => {
  const [{ config, schedule, corrected }] = CASES;
  const viaCorrection = drawAfter(config, schedule, 'holders-bye-corrected');
  const direct = drawAfter(
    config,
    schedule.filter((_, index) => index !== corrected),
    'holders-bye-direct',
  );
  expect(viaCorrection).toEqual(direct);
});

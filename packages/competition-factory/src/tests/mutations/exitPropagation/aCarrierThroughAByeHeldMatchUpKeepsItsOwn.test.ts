import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIER PASSING A BYE-HELD MATCHUP, OR ARRIVING IN A CONVERGENCE, KEEPS ITS OWN EXIT (census run 17 F3
 * MONOTONIC_DECISION, OLYMPIC 32 under `doubleExitPropagateBye: false`, seeds 20651826, 20689242, 20740054).
 *
 * A late double walkover converges `West|1|6`, and the BYE its loser link places in `South|1|3` dissolves that
 * matchUp's own double walkover. Its walkover carrier then goes on through `South|2|2` — BYE-held in 20651826, itself a
 * convergence in 20740054 — towards the South final. Each matchUp on the way still recorded the dissolved double
 * walkover's produced exit on the carrier's side, the carrier's own exit was never written over it, and settle then
 * voided it: the carrier reached the final as a live participant (20651826) or won `South|2|2` against a defaulted one
 * (20740054), and the final re-opened. The hop after a BYE also read its feeder from a view a hop out of date.
 *
 * Entered with the double walkover FIRST, the same results leave the carrier's exit standing all the way, so each case
 * is pinned twice: the census's own `replay` (every per-step property and the forward monotonic probes), and the whole
 * draw — status, winningSide and occupants of every matchUp — compared between the two orders.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

const CASES = [
  {
    config: { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 29, drawSize: 32, seed: 20651826 },
    schedule: [
      at('East|1|10', RETIRED_6_3),
      at('East|1|14', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|6', { winningSide: 2 }),
      at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|9', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|3', { winningSide: 1 }),
      at('East|1|2', { winningSide: 2 }),
      at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
    ],
    // the census probes that complete the reproduction, in the order it applied them; the last is the late one
    probes: [at('East|1|11', { matchUpStatus: DOUBLE_WALKOVER })],
  },
  {
    config: { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20740054 },
    schedule: [
      at('East|1|3', { winningSide: 1 }),
      at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|6', { winningSide: 1 }),
      at('East|1|4', RETIRED_6_3),
      at('East|1|8', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|10', { winningSide: 2 }),
      at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|14', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|9', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('West|1|2', RETIRED_6_3),
    ],
    probes: [
      at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|5', { winningSide: 1 }),
      at('East|1|11', { matchUpStatus: DOUBLE_WALKOVER }),
    ],
  },
];

function drawAfter(config: any, steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome: step.outcome, drawId });
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

it.each(CASES)('$config.seed: the late double walkover un-decides nothing', ({ config, schedule }) => {
  setSubscriptions({});
  expect(replay(config, schedule, `bye-held-carry-${config.seed}`, POLICY_OFF)).toBeNull();
});

it.each(CASES)(
  '$config.seed: the draw is the one the double walkover entered first reaches',
  ({ config, schedule, probes }) => {
    const late = probes.at(-1) as Step;
    const lateLast = drawAfter(config, [...schedule, ...probes], `bye-held-carry-last-${config.seed}`);
    const lateFirst = drawAfter(
      config,
      [late, ...schedule, ...probes.slice(0, -1)],
      `bye-held-carry-first-${config.seed}`,
    );
    expect(lateLast['South|3|1'].matchUpStatus).not.toEqual(TO_BE_PLAYED);
    expect(lateLast).toEqual(lateFirst);
  },
);

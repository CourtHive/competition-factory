import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A HELD EXIT IS SENT ON TO A SEAT AN EXIT HAS ALREADY AWARDED TO SOMEBODY STILL TO ARRIVE (census run 17 F3
 * MONOTONIC_DECISION, COMPASS and OLYMPIC 32 under `doubleExitPropagateBye: false`; Class A, seeds 20630712, 20646749,
 * 20683666, 20660897, 20721378, 20730952, 20741446).
 *
 * A produced exit comes to rest beside a BYE (`Southeast|1|1` in 20630712) and is held there, to be sent on once the
 * matchUp it feeds can be played. The other feeder of that matchUp is itself an exit already awarded to a side nobody
 * has reached yet (`Southeast|1|2`: `South|1|3`'s produced walkover, won by the seat `South|1|4`'s loser will take).
 * That feeder was read as finished — an exit feeder delivers nobody — so the held exit stayed where it was, and the
 * matchUp it feeds read TO_BE_PLAYED. Entered in the other order, the exit reached that matchUp before the feeder was
 * decided and waited there, pending, for the arrival.
 *
 * An exit awarded to an empty seat still delivers whoever reaches that seat, so the held exit goes on and waits for
 * them. Each case is pinned by the census's own `replay` and by the matchUp it un-decided. 20630712 is also pinned on the
 * whole draw — status, winningSide and occupants of every matchUp — against the late result entered first. The other two
 * still differ from that order in one South round-2 matchUp, which holds a BYE in one order and the relayed exit, pending,
 * in the other: that is the run-17 Class B order-dependence, not this one.
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
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 31, drawSize: 32, seed: 20630712 },
    schedule: [
      at('East|1|10', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|3', RETIRED_6_3),
      at('East|1|8', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|4', { winningSide: 2 }),
    ],
    // the census probes that complete the reproduction, in the order it applied them; the last is the late one
    probes: [
      at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
    ],
    undecided: 'Southeast|2|1',
  },
  {
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 20683666 },
    schedule: [
      at('East|1|1', { winningSide: 1 }),
      at('East|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('East|1|5', { winningSide: 1 }),
      at('East|1|6', { winningSide: 2 }),
      at('West|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
    ],
    probes: [
      at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    ],
    undecided: 'South|2|1',
  },
  {
    config: { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 20646749 },
    schedule: [
      at('East|1|16', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|13', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|1', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|9', { winningSide: 1 }),
      at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|8', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|10', { winningSide: 1 }),
      at('East|1|14', { winningSide: 2 }),
      at('East|1|3', { winningSide: 1 }),
      at('East|1|4', { winningSide: 1 }),
    ],
    probes: [
      at('East|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|11', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('East|1|15', { matchUpStatus: WALKOVER, winningSide: 2 }),
    ],
    undecided: 'South|2|2',
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

it.each(CASES)('$config.seed: the late result un-decides nothing', ({ config, schedule }) => {
  setSubscriptions({});
  expect(replay(config, schedule, `held-exit-awaiting-${config.seed}`, POLICY_OFF)).toBeNull();
});

it.each(CASES)('$config.seed: the matchUp it un-decided stays decided', ({ config, schedule, probes, undecided }) => {
  const lateLast = drawAfter(config, [...schedule, ...probes], `held-exit-awaiting-last-${config.seed}`);
  expect(lateLast[undecided].matchUpStatus).not.toEqual(TO_BE_PLAYED);
});

it.each(CASES.slice(0, 1))(
  '$config.seed: the draw is the one the late result entered first reaches',
  ({ config, schedule, probes }) => {
    const late = probes.at(-1) as Step;
    const lateLast = drawAfter(config, [...schedule, ...probes], `held-exit-awaiting-last-${config.seed}`);
    const lateFirst = drawAfter(
      config,
      [late, ...schedule, ...probes.slice(0, -1)],
      `held-exit-awaiting-first-${config.seed}`,
    );
    expect(lateLast).toEqual(lateFirst);
  },
);

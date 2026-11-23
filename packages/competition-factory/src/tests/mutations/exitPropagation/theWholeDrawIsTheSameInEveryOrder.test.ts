import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { COMPASS } from '@Constants/drawDefinitionConstants';
import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * THE WHOLE DRAW IS THE SAME IN EVERY ORDER (census S6, run-17 Class B: a South/Southwest round-2 matchUp held a produced
 * exit beside a BYE in one entry order and the BYE alone in another; COMPASS 32 under `doubleExitPropagateBye: false`).
 *
 * Each case is the census's own history, every call as it was made (refusals included), then the probe that reported
 * the un-decided matchUp. Entered with the probe last, with the probe first, and as each matchUp's last accepted result
 * entered once round by round (the probe last and first), the draw is one draw: status, winner and occupants of every
 * matchUp.
 *
 * - 20694910 (s17b and run 18 policy-off, COMPASS 32/30): a double exit's produced walkover awarded to an empty seat
 *   claims the BYE its loser would have taken; a carrier later converges that matchUp. Its loser seat is that BYE, and
 *   nothing is produced onto it: the correction route recorded the produced exit on the BYE's own seat and sent it on,
 *   so `South|2|1` read a pending walkover in that order alone. Also closed here: the BYE a single exit claimed,
 *   withdrawn when a correction makes that matchUp a double exit (`South|1|3` dp 6).
 * - 20521366 (s14 policy-off, COMPASS 32/27): a held exit is sent on while its target's other feeder can still deliver
 *   (CA, 2026-09-24); the settle held it until that feeder was decided, so `North|2|1` read a pending DEFAULTED when the
 *   BYE came first and TO_BE_PLAYED when the exit did. And a withdrawn origin leaves the kept exit its own label
 *   (`East|2|4` DEFAULTED, not the mixed convergence's WALKOVER).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CLEAR = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

const CASES = [
  {
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20694910 },
    schedule: [
      at('East|1|10', CLEAR),
      at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|6', { winningSide: 1 }),
      at('East|1|11', { winningSide: 2 }),
      at('East|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
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
      at('East|2|8', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
      at('East|2|8', { winningSide: 2 }),
      at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
    ],
    probe: at('East|1|13', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  },
  {
    config: { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 20521366 },
    schedule: [
      at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|10', { winningSide: 2 }),
      at('East|1|10', { winningSide: 2 }),
      at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|2|2', { winningSide: 1 }),
      at('East|1|7', { winningSide: 1 }),
      at('East|1|9', { winningSide: 2 }),
      at('East|1|9', { winningSide: 1 }),
      at('West|1|5', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
      at('East|1|6', CLEAR),
      at('East|1|15', { winningSide: 1 }),
      at('East|2|8', { winningSide: 1 }),
      at('East|1|13', { winningSide: 2 }),
      at('East|1|14', { matchUpStatus: DEFAULTED, winningSide: 1 }),
      at('West|1|7', { winningSide: 1 }),
      at('East|2|7', { matchUpStatus: DOUBLE_DEFAULT }),
      at('South|2|2', CLEAR),
      at('West|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|8', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
      at('South|2|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
      at('West|1|7', CLEAR),
      at('East|1|14', { winningSide: 2 }),
      at('East|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|14', { winningSide: 2 }),
      at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('South|2|2', { winningSide: 1 }),
      at('East|2|8', { winningSide: 2 }),
      at('East|1|9', { winningSide: 1 }),
      at('East|1|11', { winningSide: 1 }),
    ],
    probe: at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  },
];

/** plays the steps as the census does (a matchUp is scored only once both its participants are there) */
function play(config: any, steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId, POLICY_OFF);
  const accepted: Step[] = [];
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.thrown).toBeUndefined();
    if (!observed.error) accepted.push(step);
  }
  const draw = Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
  return { draw, accepted };
}

/** each matchUp's last accepted result, entered once, round by round */
function forwardOrder(steps: Step[]): Step[] {
  const net = new Map<string, Step>();
  for (const step of steps) {
    net.delete(coordinate(step));
    if (step.outcome.matchUpStatus !== TO_BE_PLAYED) net.set(coordinate(step), step);
  }
  return [...net.values()].toSorted(
    (a, b) =>
      Number(a.structureName !== 'East') - Number(b.structureName !== 'East') ||
      a.roundNumber - b.roundNumber ||
      a.roundPosition - b.roundPosition,
  );
}

it.each(CASES)(
  '$config.seed: the census schedule un-decides nothing',
  ({ config, schedule }) => {
    setSubscriptions({});
    expect(replay(config, schedule, `every-order-${config.seed}`, POLICY_OFF)).toBeNull();
  },
  180_000,
);

it.each(CASES)(
  '$config.seed: the whole draw is the same in every order',
  ({ config, schedule, probe }) => {
    const last = play(config, [...schedule, probe], `every-order-last-${config.seed}`);
    expect(play(config, [probe, ...schedule], `every-order-first-${config.seed}`).draw).toEqual(last.draw);
    const accepted = last.accepted.slice(0, -1);
    expect(play(config, forwardOrder([...accepted, probe]), `every-order-fwd-${config.seed}`).draw).toEqual(last.draw);
    expect(play(config, [probe, ...forwardOrder(accepted)], `every-order-fwd-first-${config.seed}`).draw).toEqual(
      last.draw,
    );
  },
  180_000,
);

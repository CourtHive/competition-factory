import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A HELD EXIT REACHES THE SAME SEAT IN EVERY ORDER (census run-17 Class B, MONOTONIC_DECISION; s17b policy-off 20641116,
 * COMPASS 32/27 under `doubleExitPropagateBye: false`).
 *
 * `West|2|4` is decided by the walkover its loser carries in from `East|1|13`; the census probe, `East|1|15`'s double
 * walkover, then sends a second exit there and the two converge. Its loser seat, `Southwest` drawPosition 4, receives
 * the produced walkover, beside the BYE drawPosition 3 holds; `Southwest|1|1`, the other feeder of `Southwest|2|1`, is an
 * exit awarded to a seat nobody has reached. Each order of entry broke a different rule:
 *
 * - probe last: the exit stayed held beside the BYE and `Southwest|2|1` read TO_BE_PLAYED, because only the carry path
 *   asked whether the opposite feeder can still deliver (#5437); the settle did not.
 * - probe first: correcting `East|1|13` from a double walkover re-derived `West|2|4` to the kept exit AWARDED to the
 *   empty seat, though that exit had been relayed past `West|1|8`'s BYE and forward play writes it pending. The loser
 *   arriving there took the award, so drawPosition 4 became the BYE of a loser nobody could be; the convergence that
 *   followed left it, and a BYE, not the produced exit, went on.
 *
 * The rule (exit-propagation.md): a double exit's loser seat under the policy receives the produced exit, the BYE stays
 * and the exit travels, and a held exit goes on to a seat an exit has awarded to somebody still to arrive. Every order
 * now leaves `Southwest|2|1` a pending WALKOVER, and the whole draw (status, winner and occupants of every matchUp) is
 * the same whichever order the census history is entered in.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CLEAR = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 27, drawSize: 32, seed: 20641116 };

// the census schedule, every call as it was made (one, `East|1|10`'s double default, is refused)
const SCHEDULE = [
  at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|9', { winningSide: 1 }),
  at('East|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|4', { winningSide: 1 }),
  at('East|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|6', { winningSide: 2 }),
  at('East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|4', { winningSide: 2 }),
  at('East|1|8', { winningSide: 1 }),
  at('East|1|11', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|10', { winningSide: 2 }),
  at('East|1|13', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|13', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|7', { winningSide: 2 }),
  at('East|1|7', { winningSide: 2 }),
  at('East|1|9', { winningSide: 1 }),
  at('East|1|8', CLEAR),
  at('East|2|5', { winningSide: 1 }),
  at('East|2|7', { winningSide: 1 }),
  at('East|2|5', { winningSide: 1 }),
  at('East|2|1', { winningSide: 1 }),
  at('East|2|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|10', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|3', { winningSide: 2 }),
  at('East|1|8', { winningSide: 2 }),
  at('West|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|9', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|2|2', { winningSide: 2 }),
  at('East|1|6', { winningSide: 2 }),
  at('East|3|3', { winningSide: 1 }),
];
// the census probe that reported the un-decided matchUp
const PROBE = at('East|1|15', { matchUpStatus: DOUBLE_WALKOVER });

/** each matchUp's last accepted outcome, entered once, round by round: the draw the results entered directly reach */
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

function drawAfter(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    // the census's own rule: a matchUp is scored only once both of its participants are there
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
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

// the double default on `East|1|10` is refused in the census order, so the forward order is built from what stood
const ACCEPTED = SCHEDULE.filter((step) => !(coordinate(step) === 'East|1|10' && step.outcome.matchUpStatus));

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'held-exit-every-order', POLICY_OFF)).toBeNull();
}, 180_000);

it('the probe entered last sends the held exit on to wait for the arrival', () => {
  const draw = drawAfter([...SCHEDULE, PROBE], 'held-exit-every-order-last');
  expect(draw['Southwest|1|2'].matchUpStatus).toEqual('BYE');
  expect(draw['Southwest|2|1']).toEqual({
    matchUpStatus: WALKOVER,
    winningSide: undefined,
    occupants: [undefined, undefined],
  });
}, 180_000);

it('the probe entered first leaves the produced exit, not a BYE, on the loser seat', () => {
  const draw = drawAfter([PROBE, ...SCHEDULE], 'held-exit-every-order-first');
  expect(draw['Southwest|1|2'].occupants).toEqual(['BYE', undefined]);
  expect(draw['Southwest|2|1'].matchUpStatus).toEqual(WALKOVER);
}, 180_000);

it('the whole draw is the same in every order', () => {
  const last = drawAfter([...SCHEDULE, PROBE], 'held-exit-every-order-last');
  expect(drawAfter([PROBE, ...SCHEDULE], 'held-exit-every-order-first')).toEqual(last);
  expect(drawAfter(forwardOrder([...ACCEPTED, PROBE]), 'held-exit-every-order-forward')).toEqual(last);
  expect(drawAfter([PROBE, ...forwardOrder(ACCEPTED)], 'held-exit-every-order-forward-first')).toEqual(last);
}, 180_000);

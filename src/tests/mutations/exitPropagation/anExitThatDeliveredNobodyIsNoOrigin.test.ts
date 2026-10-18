import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * AN EXIT THAT HAS DELIVERED NOBODY IS NO ORIGIN (census A1 residue F3b, COMPASS 32/31 seed 20551581 under
 * `doubleExitPropagateBye: false`, the census schedule of `aLoserSeatHoldingAByeIsNotConverged`).
 *
 * `South|1|3` holds the DEFAULTED `West|1|5`'s double default produced into it, and neither of its seats is filled: the
 * exit is pending, or awarded to the seat awaiting `West|1|6`'s loser, and either way it has sent nobody on. When
 * `South|1|4`'s produced walkover reached `South|2|2` side 2, the side `South|1|3` feeds was recorded as an arrival
 * from it (`{ previousMatchUpStatus: DEFAULTED }` on side 1), as though someone had won the DEFAULTED and were waiting
 * there. "A side that has not been decided has no origin" (exit-propagation.md): a single exit delivers its winner
 * only once someone holds the winning seat, as a BYE matchUp awaiting its other side delivers nobody (F3,
 * `aByeOriginWaitsForItsFeederToDeliver`). The entry was written in the census order, the probe `East|1|14` last, and
 * in the round-by-round order, and not when the results were entered last to first. In every order the exit is awarded
 * to the empty seat it came straight down its loser link to: in the census order it once stood pending, because
 * correcting `East|1|11` dissolved a convergence there and the award was taken back (census A1 R9,
 * `aDissolvedConvergenceKeepsItsLoserLinkAward`).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 31, drawSize: 32, seed: 20551581 };
const DEFAULTED_1 = { matchUpStatus: DEFAULTED, winningSide: 1 };
const WALKOVER_1 = { matchUpStatus: WALKOVER, winningSide: 1 };

const CENSUS_SCHEDULE = [
  at('East|1|12', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', DEFAULTED_1),
  at('East|1|9', DEFAULTED_1),
  at('East|1|11', WALKOVER_1),
  at('East|1|15', DEFAULTED_1),
  at('East|1|7', { winningSide: 2 }),
  at('East|1|12', { winningSide: 1 }),
  at('East|1|13', WALKOVER_1),
  at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|16', DEFAULTED_1),
  at('East|1|11', { winningSide: 1 }),
  at('East|1|2', { winningSide: 2 }),
  at('East|1|5', { winningSide: 1 }),
  at('East|1|8', { winningSide: 1 }),
  // the census probe: `East|1|14`'s walkover carries its loser to `West|1|7`, whose convergence produces the walkover
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 2 }),
];

/** each matchUp's last result, entered once, round by round; and the same results entered last to first */
const FORWARD_ORDER = [...new Map(CENSUS_SCHEDULE.map((step) => [coordinate(step), step])).values()].toSorted(
  (a, b) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition,
);
const REVERSE_ORDER = FORWARD_ORDER.toReversed();

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const observed = observeMutation({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error).toBeUndefined();
  }
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  return { pending: find('South|1|3'), fed: find('South|2|2') };
}

it('the side an exit awarded to nobody feeds records no arrival from it', () => {
  const { pending, fed } = play(CENSUS_SCHEDULE, 'delivered-nobody-census');
  expect(pending.matchUpStatus).toEqual(DEFAULTED);
  // awarded, as direct entry awards it, to the seat awaiting `West|1|6`'s loser, which nobody has reached
  expect(pending.winningSide).toEqual(2);
  expect(pending.sides.map((side: any) => side.participantId)).toEqual([undefined, undefined]);

  // side 2 is `South|1|4`'s produced walkover; side 1, fed by the undelivered DEFAULTED, has no origin
  expect(fed.matchUpStatus).toEqual(WALKOVER);
  expect(fed.sideExitProvenance?.[2]?.matchUpStatus).toEqual(WALKOVER);
  expect(fed.sideExitProvenance?.[1]).toBeUndefined();
  const named = Object.values(fed.sideExitProvenance ?? {}).filter(
    (entry: any) => entry?.sourceMatchUpId === pending.matchUpId,
  );
  expect(named).toEqual([]);
});

it('an exit awarded to a seat nobody has reached is no origin either, in every order', () => {
  const forward = play(FORWARD_ORDER, 'delivered-nobody-forward-order');
  const reverse = play(REVERSE_ORDER, 'delivered-nobody-reverse-order');
  for (const { pending, fed } of [forward, reverse]) {
    // entered directly, the produced DEFAULTED keeps its award to the seat awaiting `West|1|6`'s loser
    expect(pending.matchUpStatus).toEqual(DEFAULTED);
    expect(pending.winningSide).toEqual(2);
    expect(pending.sides.map((side: any) => side.participantId)).toEqual([undefined, undefined]);
    expect(fed.sideExitProvenance?.[1]).toBeUndefined();
    expect(fed.sideExitProvenance?.[2]?.matchUpStatus).toEqual(WALKOVER);
  }
  expect(forward.fed.sideExitProvenance).toEqual(reverse.fed.sideExitProvenance);
});

import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A LOSER-LINK AWARD SURVIVES ITS BYE'S WITHDRAWAL (census run 19 MONOTONIC_DECISION, COMPASS 32/32 under
 * `doubleExitPropagateBye: false`, seed 20834212).
 *
 * `South|1|4`'s double walkover sends its produced walkover straight down the loser link into `Southeast|1|2`, which
 * entered directly is awarded to the seat that will receive the next arrival (`exitStatusClearing` 2.3). Here it first
 * arrived beside a BYE that `East|1|9`'s double walkover had placed on that seat; correcting `East|1|9` to a played win
 * withdrew the BYE, and the removal's re-derivation took the award back as for an exit relayed past a BYE, leaving it
 * pending. The removal read every exit naming a double exit as its source as relayed; this one came straight down its
 * link. Pending, it read to the held exit in `Southeast|1|1` as a feeder that delivers nobody, so when the probe's
 * convergence in `South|1|2` sent that exit there it stayed held, and `Southeast|2|1`, decided before, read TO_BE_PLAYED.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 32, drawSize: 32, seed: 20834212 };
const SCHEDULE = [
  at('East|1|6', { winningSide: 1 }),
  at('East|1|5', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('East|1|9', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('West|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('East|1|3', { winningSide: 2 }),
  at('East|1|13', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|15', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|9', { winningSide: 1 }),
];
// the census probes, in the order it applied them; the last reported the un-decided matchUp
const PROBES = [
  at('East|1|4', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|7', { winningSide: 1 }),
  at('East|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }),
];

/** each matchUp's last accepted outcome, entered once, structure by structure and round by round */
function forwardOrder(steps: Step[]): Step[] {
  const net = new Map<string, Step>();
  for (const step of steps) {
    net.delete(coordinate(step));
    net.set(coordinate(step), step);
  }
  const structures = [...new Set(steps.map((step) => step.structureName))];
  return [...net.values()].toSorted(
    (a, b) =>
      structures.indexOf(a.structureName) - structures.indexOf(b.structureName) ||
      a.roundNumber - b.roundNumber ||
      a.roundPosition - b.roundPosition,
  );
}

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  const accepted: Step[] = [];
  let pending = steps;
  while (pending.length) {
    const left: Step[] = [];
    for (const step of pending) {
      const target = find(coordinate(step));
      // the census's own rule: a matchUp is scored only once both of its participants are there
      if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) {
        left.push(step);
        continue;
      }
      const observed = observeMutation({
        propagateExitStatus: true,
        matchUpId: target.matchUpId,
        outcome: step.outcome,
        drawId,
      });
      expect(observed.thrown).toBeUndefined();
      if (!observed.error) accepted.push(step);
    }
    if (left.length === pending.length) break;
    pending = left;
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
  return { find, accepted, draw };
}

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'loser-link-award', POLICY_OFF)).toBeNull();
});

it('the BYE withdrawn from the seat leaves the loser-link walkover awarded to it, as entered directly', () => {
  const { find } = play(SCHEDULE, 'loser-link-award-schedule');
  const target = find('Southeast|1|2');
  expect(target.matchUpStatus).toEqual(WALKOVER);
  expect(target.winningSide).toEqual(1);
});

it('the probes leave the matchUp it fed decided', () => {
  const { find } = play([...SCHEDULE, ...PROBES], 'loser-link-award-probed');
  expect(find('Southeast|2|1').matchUpStatus).not.toEqual(TO_BE_PLAYED);
});

it('the whole draw is the one the same results entered directly reach', () => {
  const census = play([...SCHEDULE, ...PROBES], 'loser-link-award-census');
  expect(play(forwardOrder(census.accepted), 'loser-link-award-forward').draw).toEqual(census.draw);
});

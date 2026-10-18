import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { COMPASS } from '@Constants/drawDefinitionConstants';
import {
  BYE,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * THE SEAT LEFT OPPOSITE A BYE GOES ON (census A1 residue R7, COMPASS 32/30 seed 20694910 under
 * `doubleExitPropagateBye: false`, the schedule of `theWholeDrawIsTheSameInEveryOrder`).
 *
 * A BYE advances the drawPosition opposite it when it lands, occupied or not (`assignDrawPositionBye`), so whoever
 * reaches that seat later is already one round on. `Northwest|1|1` held two BYEs, which send one BYE on, so
 * `Northwest|2|1` held dp 2 alone. `East|1|3`'s double walkover re-scored as a win took back the BYE it had put in
 * `Northwest|1|1` dp 1, and the release took back the BYE's advancement; nothing advanced dp 1, now the empty seat
 * opposite the BYE that stays, and `Northwest|2|1` was left holding nobody from that matchUp. Every entry order of the
 * standing results puts dp 1 there. The settle's `reconcileByeAdvancements` now advances a structural empty seat
 * opposite a lone BYE when the next matchUp has room, as the BYE did when it landed.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CLEAR = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
const RETIRED_1 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20694910 };

const SCHEDULE = [
  at('East|1|10', CLEAR),
  at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|6', { winningSide: 1 }),
  at('East|1|11', { winningSide: 2 }),
  at('East|1|2', RETIRED_1),
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
  // step 23: the double walkover that put a second BYE in `Northwest|1|1` is re-scored as a win
  at('East|1|3', { winningSide: 1 }),
  at('East|1|3', { winningSide: 2 }),
  at('East|1|15', { winningSide: 2 }),
  at('East|2|6', { winningSide: 2 }),
  at('East|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|2|8', RETIRED_1),
  at('East|2|8', { winningSide: 2 }),
  at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
  at('East|1|10', { matchUpStatus: DOUBLE_WALKOVER }),
];
// the schedule through step 23, the re-score
const RESCORED = 24;

const seats = (matchUp: any) => (matchUp.drawPositions ?? []).filter(Boolean);
const occupants = (matchUp: any) => matchUp.sides.map((side: any) => (side.bye ? BYE : side.participantId));

/** plays the steps as the census does (a matchUp is scored only once both its participants are there) */
function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId, POLICY_OFF)).toEqual(true);
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
  // read before the next draw is generated: `prepareDraw` replaces the tournament this one is in
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  const [pair, next] = [find('Northwest|1|1'), find('Northwest|2|1')];
  return { pair: { matchUpStatus: pair.matchUpStatus, occupants: occupants(pair) }, held: seats(next), accepted };
}

/** each matchUp's last accepted result, entered once, round by round */
function forwardOrder(steps: Step[]): Step[] {
  const net = new Map<string, Step>();
  for (const step of steps) {
    net.delete(coordinate(step));
    if (step.outcome.matchUpStatus !== TO_BE_PLAYED) net.set(coordinate(step), step);
  }
  return [...net.values()].toSorted((a, b) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition);
}

it('a matchUp losing one of its two BYEs advances the empty seat now opposite the other', () => {
  const rescored = play(SCHEDULE.slice(0, RESCORED), 'seat-opposite-bye-rescored');
  expect(rescored.pair).toEqual({ matchUpStatus: BYE, occupants: [undefined, BYE] });
  expect(rescored.held).toEqual([1]);

  const forward = play(forwardOrder(rescored.accepted), 'seat-opposite-bye-rescored-forward');
  expect(forward.pair).toEqual(rescored.pair);
  expect(forward.held).toEqual(rescored.held);
}, 180_000);

it('the whole schedule leaves the seat where every entry order puts it', () => {
  const scheduled = play(SCHEDULE, 'seat-opposite-bye-schedule');
  expect(scheduled.held).toEqual([1, 4]);
  const forward = play(forwardOrder(scheduled.accepted), 'seat-opposite-bye-schedule-forward');
  expect(forward.held).toEqual([1, 4]);
  expect(forward.pair).toEqual(scheduled.pair);
}, 180_000);

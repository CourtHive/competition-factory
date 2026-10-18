import { getDrawMatchUps, observeMutation, clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { DOUBLE_ELIMINATION, CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A CLEARED LOSER SEAT LEAVES NO AWARD BEHIND (census A1 group R3: cases 18, 20, 21 and 27).
 *
 * A loser directed into a seat opposite a PRODUCED exit is awarded it on arrival. When the result that sent them is
 * re-scored or cleared, `removeDirectedLoser` empties their seat and releases the rounds they went on to, but the
 * release never reads the seat's own matchUp (the round where the position first appears) nor one reached past a BYE,
 * so the produced exit stayed won by a seat nobody holds. "A produced exit awards no empty seat, on any path … it also
 * holds when a position is cleared out of a matchUp" (exit-propagation.md). The award is now asked again of
 * `positionClear`'s `awardStands`: a produced exit over an emptied seat stands pending, and the reservation it holds
 * for the next arrival stays where it was.
 *
 * Case 21 (DOUBLE_ELIMINATION 8/4 under `doubleExitPropagateBye: false`, seed 20537779) reached the stale award inside
 * the census schedule itself; case 18 (CURTIS_CONSOLATION 32/27, seed 9000062) reached it by a probe and its clear.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
const view = (matchUp: any) => ({
  drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
  sideExitProvenance: matchUp.sideExitProvenance,
  matchUpStatus: matchUp.matchUpStatus,
  winningSide: matchUp.winningSide,
});

/** The census replay: a step whose matchUp does not hold two participants is skipped; a refusal is part of the schedule. */
function schedule({ config, policy, steps, drawId }: { config: any; policy?: any; steps: Step[]; drawId: string }) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, policy)).toEqual(true);
  for (const step of steps) {
    const target = find(drawId, coordinate(step));
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, outcome: step.outcome, drawId });
  }
}

/** Apply the probe to the scheduled draw, then clear it. */
function probeAndClear(drawId: string, probe: Step) {
  const { matchUpId } = find(drawId, coordinate(probe));
  const forward = observeMutation({ propagateExitStatus: true, matchUpId, outcome: probe.outcome, drawId });
  expect(forward.error).toBeUndefined();
  const cleared = observeMutation({ propagateExitStatus: true, matchUpId, outcome: clearOutcome, drawId });
  expect(cleared.error).toBeUndefined();
}

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CASE_21 = {
  config: {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: true,
    participantsCount: 4,
    drawSize: 8,
    seed: 20537779,
  },
  steps: [
    at('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
    at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|2|1', { winningSide: 2 }),
    at('Main|2|1', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|2|2', { winningSide: 1 }),
    at('Main|3|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Backdraw|4|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Backdraw|4|1', { matchUpStatus: DOUBLE_DEFAULT }),
    at('Main|2|2', { winningSide: 2 }),
    at('Backdraw|3|1', { winningSide: 2 }),
    at('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|4|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Backdraw|4|1', { winningSide: 2 }),
    at('Backdraw|3|1', { winningSide: 2 }),
    at('Backdraw|4|1', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Main|4|1', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Backdraw|3|1', { winningSide: 2 }),
    at('Main|4|1', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Backdraw|3|1', { winningSide: 2 }),
    at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|3|1', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|4|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|1', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Decider|1|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|3|1', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
    at('Backdraw|3|1', { winningSide: 1 }),
    at('Decider|1|1', { winningSide: 1 }),
  ],
};
const CASE_18 = {
  config: {
    drawType: CURTIS_CONSOLATION,
    propagateExitStatus: true,
    participantsCount: 27,
    drawSize: 32,
    seed: 9000062,
  },
  steps: [
    at('Main|1|7', { winningSide: 2 }),
    at('Main|1|15', { winningSide: 1 }),
    at('Main|1|13', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|4', { winningSide: 2 }),
    at('Main|1|15', { winningSide: 1 }),
    at('Main|1|10', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|2|6', { winningSide: 2 }),
    at('Main|1|11', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|6', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    at('Main|2|6', { winningSide: 1 }),
    at('Main|1|10', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|1|15', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|15', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }),
    at('Main|1|9', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|15', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    at('Main|1|6', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|1|2', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    at('Main|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|3', { winningSide: 1 }),
    at('Main|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|7', { winningSide: 2 }),
    at('Main|1|13', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|1|4', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
    at('Consolation 1|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|4', { winningSide: 2 }),
    at('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
    at('Main|2|4', { matchUpStatus: DOUBLE_WALKOVER }),
    at('Main|1|11', { winningSide: 1 }),
  ],
  probe: at('Main|2|5', { winningSide: 2 }),
};

it('the census schedule leaves the produced walkover over an emptied Backdraw seat pending', () => {
  const drawId = 'cleared-loser-seat-schedule';
  schedule({ ...CASE_21, policy: POLICY_OFF, drawId });
  const matchUp = find(drawId, 'Backdraw|4|1');
  expect(matchUp.matchUpStatus).toEqual(WALKOVER);
  expect(matchUp.sides.some((side: any) => side?.participantId)).toEqual(false);
  expect(matchUp.winningSide).toBeUndefined();
});

it('a loser sent into a produced walkover and taken back leaves it pending, with its reservation', () => {
  const drawId = 'cleared-loser-seat-round-trip';
  schedule({ ...CASE_18, drawId });
  const before = view(find(drawId, 'Consolation 1|2|4'));
  const reservation = view(find(drawId, 'Consolation 1|3|2'));
  expect(before.matchUpStatus).toEqual(WALKOVER);
  expect(before.winningSide).toBeUndefined();
  probeAndClear(drawId, CASE_18.probe);
  expect(view(find(drawId, 'Consolation 1|2|4'))).toEqual(before);
  expect(view(find(drawId, 'Consolation 1|3|2'))).toEqual(reservation);
});

import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A BYE SENT ON FROM ITS HOLDER IS NO OPPONENT (census run 18 MONOTONIC_DECISION, DOUBLE_ELIMINATION 16/14, seed
 * 20625526, failing in all three arms).
 *
 * `Backdraw|2|1`'s double walkover reaches `Backdraw|3|1`, which `Backdraw|2|2` holds: its BYE and the exit
 * `Backdraw|1|2`'s double walkover left there. Before the two exits meet, the arrival reads `3|1` as a BYE and sends an
 * exit on into `Backdraw|4|1`; the BYE that matchUp holds goes on alone into `Backdraw|5|1`. The settle then converges
 * `3|1` and produces its exit into `4|1` — whose own BYE was now the lone position in `5|1`. That position was read as
 * the opponent the exit is awarded to, so it was moved on again: a BYE in the Backdraw final, and the Main final's loser
 * carried across its winner link into the decider, while `Backdraw|3|2`, whose winner is owed `5|1`'s other side, was
 * still to be played. Scoring `Backdraw|3|2` then took the decider seat and the Backdraw final's BYE back.
 *
 * The rule: a position that came out of the target is not an opponent waiting in the next matchUp. The BYE stays and
 * the exit travels, pending, as onto an empty matchUp; the holder's BYE is taken back out of `5|1` first. Entering
 * `Backdraw|3|2` before `Backdraw|2|1` reaches the same draw.
 */

const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: false,
  participantsCount: 14,
  drawSize: 16,
  seed: 20625526,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|4', { winningSide: 2 }),
  at('Main|1|5', { winningSide: 2 }),
  at('Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Backdraw|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|4', { winningSide: 2 }),
  at('Main|1|2', { winningSide: 2 }),
  at('Main|1|6', { winningSide: 2 }),
  at('Backdraw|2|4', { winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('Main|2|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Backdraw|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|4|1', { winningSide: 1 }),
];
const CONVERGING = at('Backdraw|2|1', { matchUpStatus: DOUBLE_WALKOVER });
const PLAYED = at('Backdraw|3|2', {
  matchUpStatus: RETIRED,
  winningSide: 1,
  score: { sets: [{ side1Score: 6, side2Score: 3 }] },
});

function play(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  for (const step of steps) {
    const result: any = observeMutation({
      propagateExitStatus: CONFIG.propagateExitStatus,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }
  return find;
}

const state = (find: (key: string) => any, key: string) => {
  const matchUp = find(key);
  return {
    matchUpStatus: matchUp.matchUpStatus,
    winningSide: matchUp.winningSide,
    drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
    participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
  };
};

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'bye-from-holder')).toBeNull();
});

it('the exit waits in the Backdraw semi-final, and nothing goes on past it', () => {
  const find = play('bye-from-holder-late', [...SCHEDULE, CONVERGING]);

  const semiFinal = find('Backdraw|5|1');
  expect(semiFinal.matchUpStatus).toEqual(WALKOVER);
  expect(semiFinal.winningSide).toBeUndefined();
  expect((semiFinal.drawPositions ?? []).filter(Boolean)).toEqual([]);

  // the Backdraw final holds only the Main final's loser, and nobody has crossed into the decider from it
  const final = find('Backdraw|6|1');
  expect(final.sides.some((side: any) => side?.bye)).toEqual(false);
  expect((final.drawPositions ?? []).filter(Boolean)).toHaveLength(1);
  expect(find('Main|5|1').sides.filter((side: any) => side?.participantId)).toHaveLength(1);
});

it('scoring the other semi-final feeder reaches the draw the forward order reaches', () => {
  const keys = ['Backdraw|4|1', 'Backdraw|4|2', 'Backdraw|5|1', 'Backdraw|6|1', 'Main|5|1'];
  const late = play('bye-from-holder-last', [...SCHEDULE, CONVERGING, PLAYED]);
  const lateStates = keys.map((key) => state(late, key));
  const forward = play('bye-from-holder-first', [...SCHEDULE, PLAYED, CONVERGING]);
  expect(lateStates).toEqual(keys.map((key) => state(forward, key)));
  expect(lateStates[2].winningSide).toEqual(2);
});

/**
 * The same read one structure on, under `doubleExitPropagateBye: false` (census s14 policy-off 20521366, COMPASS 32/27).
 * `East|1|4`'s walkover carries its loser into `West|2|1`, decided for the empty seat, and on as that matchUp's loser
 * past `Southwest|1|1`'s BYE into `Southwest|2|1`. `East|1|2`'s double walkover then converges `West|2|1`: a double exit
 * has no loser, so the carrier comes home, and the produced exit sent over the loser link waits beside the BYE in
 * `Southwest|1|1`, whose seat (dp 1) still stood alone in `Southwest|2|1`. Read as that matchUp's opponent, the seat was
 * awarded the exit coming from it, and `Southwest|2|1` held a WALKOVER that entering the double walkover first never
 * writes.
 */
const COMPASS_CONFIG = {
  drawType: COMPASS,
  propagateExitStatus: true,
  participantsCount: 27,
  drawSize: 32,
  seed: 20521366,
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const COMPASS_SCHEDULE = [
  at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|8', { matchUpStatus: DOUBLE_DEFAULT }),
  at('East|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
];
const COMPASS_CONVERGING = at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER });

function playCompass(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(COMPASS_CONFIG, drawId, POLICY_OFF);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  for (const step of steps) {
    const result: any = observeMutation({
      propagateExitStatus: true,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }
  return find;
}

it('a convergence over the loser link leaves the seat beyond its BYE as entering it first does', () => {
  const keys = ['Southwest|1|1', 'Southwest|1|2', 'Southwest|2|1', 'West|2|1'];
  const late = playCompass('bye-from-holder-compass-last', [...COMPASS_SCHEDULE, COMPASS_CONVERGING]);
  const lateStates = keys.map((key) => state(late, key));
  // the produced exit held beside `Southwest|1|1`'s BYE goes on to wait, pending, and is awarded to nobody: the seat
  // standing alone there is the holder's own (census S6, CA 2026-09-24; TO_BE_PLAYED in 18 of the schedule's 24 orders
  // while the exit was held, WALKOVER in the other 6, one state in all 24 since)
  expect(late('Southwest|2|1').matchUpStatus).toEqual('WALKOVER');
  expect(late('Southwest|2|1').winningSide).toBeUndefined();
  const first = playCompass('bye-from-holder-compass-first', [
    COMPASS_SCHEDULE[0],
    COMPASS_SCHEDULE[1],
    COMPASS_CONVERGING,
    COMPASS_SCHEDULE[2],
  ]);
  expect(lateStates).toEqual(keys.map((key) => state(first, key)));
});

import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, beforeEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A WITHDRAWN RESERVATION TAKES BACK THE EXIT IT RELAYED (census run 18 MONOTONIC_DECISION, FIRST_MATCH_LOSER_CONSOLATION
 * 32/32 under `allowChangePropagation`, seed 20627402).
 *
 * `Main|1|1` and `Main|1|2` are both won by a played result, so whoever loses `Main|2|1` will hold a win and cannot be
 * fed: `Consolation|2|1`'s fed seat is reserved with a BYE. `Consolation|1|1`'s double default then produces a DEFAULTED
 * into `2|1`, where it meets that BYE and is relayed on into `Consolation|3|1`. Re-scoring `Main|1|2` as a walkover the
 * other way round takes the scored win back, and the reservation goes (`reconcileConsolationReservations`), so the
 * exit comes to rest in `2|1`, pending. But the reservation was withdrawn after the relays had been reconciled, and the
 * copy in `3|1` stood beyond the seat it had passed. The first participant to arrive in `3|1` then cleared it: a
 * decided matchUp un-decided by a result two rounds away.
 *
 * The rule: a relayed exit stands only while every matchUp it passed still holds a BYE, and that is asked again when
 * the settle withdraws a reservation. Entering the walkover first reaches the same draw.
 */

const CONFIG = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: false,
  participantsCount: 32,
  drawSize: 32,
  seed: 20627402,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|1', { winningSide: 2 }),
  at('Main|1|2', { winningSide: 1 }),
  at('Consolation|1|1', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
];
const PROBE = at('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER });

let previous: string | undefined;
beforeEach(() => {
  previous = process.env.ALLOW_CHANGE_PROPAGATION;
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
});
afterEach(() => {
  if (previous === undefined) delete process.env.ALLOW_CHANGE_PROPAGATION;
  else process.env.ALLOW_CHANGE_PROPAGATION = previous;
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

const state = (matchUp: any) => ({
  matchUpStatus: matchUp.matchUpStatus,
  winningSide: matchUp.winningSide,
  provenanceSides: Object.keys(matchUp.sideExitProvenance ?? {}),
  participants: (matchUp.sides ?? []).map((side: any) => side?.participantId),
});

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'reservation-relay')).toBeNull();
});

it('the exit rests where the reservation was, and its copy beyond is withdrawn', () => {
  const find = play('reservation-relay-late', SCHEDULE);

  const fed = find('Consolation|2|1');
  expect(fed.matchUpStatus).toEqual(DEFAULTED);
  expect(fed.winningSide).toBeUndefined();
  expect(fed.sides.some((side: any) => side?.bye)).toEqual(false);

  const onward = find('Consolation|3|1');
  expect(onward.matchUpStatus).not.toEqual(DEFAULTED);
  expect(onward.sideExitProvenance).toBeUndefined();
});

it('the walkover entered first reaches the same result, before and after the next arrival', () => {
  const keys = ['Consolation|1|1', 'Consolation|2|1', 'Consolation|3|1', 'Consolation|1|2', 'Consolation|2|2'];
  const late = play('reservation-relay-last', [...SCHEDULE, PROBE]);
  const lateStates = keys.map((key) => state(late(key)));
  const first = play('reservation-relay-first', [SCHEDULE[0], SCHEDULE[1], SCHEDULE[4], SCHEDULE[3], PROBE]);
  expect(lateStates).toEqual(keys.map((key) => state(first(key))));
});

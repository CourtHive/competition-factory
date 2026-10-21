import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIER IS NOT CARRIED PAST A HOLDER'S BYE (census run 19 ERROR_IMPLIES_NO_MUTATION, FEED_IN_CHAMPIONSHIP 16/14,
 * seed 20833621, both default arms; shrunk from 30 steps to 12).
 *
 * `Consolation|1|3`'s double walkover produces a walkover into `Consolation|2|3`, pending, and its empty seat (dp 6) is
 * advanced into `3|2` as the reservation for whoever arrives. There it stands opposite d5222c, who defaulted `Main|2|1`
 * and carried the default in. `Main|2|2`'s double default then leaves dp 6 a seat nobody can fill: a BYE, in `2|3` and in
 * `3|2` alike. `2|3` is now a holder (its BYE and the walkover beside it), and the BYE in `3|2` is the holder's own.
 *
 * When the draw settled, `reconcileCarriesPastByes` read `3|2` as a BYE matchUp and carried d5222c past it into `4|2`,
 * where their default met Main|3|2's loser's and converged; `settleHeldExits` then sent the held walkover to `3|2` and
 * converged it there as well, so both stood. The next result, `Consolation|2|2`, was refused placing its winner one round
 * on after it had already written (ERR_EXISTING_POSITION_ASSIGNMENT).
 *
 * The rule (exit-propagation.md, P54): a BYE the other holder left is not one an exit passes; the exit behind it is coming
 * to the same seat. So d5222c's default waits in `3|2` and meets the held walkover there, the double walkover produces
 * into `4|2`, where it meets the carried default and converges again, and `5|1` waits pending.
 */

const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 14,
  drawSize: 16,
  seed: 20833621,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|1|7', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|3', { winningSide: 1 }),
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|1|6', { winningSide: 1 }),
  at('Main|1|5', { winningSide: 1 }),
  at('Main|2|3', { winningSide: 2 }),
  at('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|3|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Consolation|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Consolation|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];

function play(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  for (const step of steps) {
    const observed: any = observeMutation({
      propagateExitStatus: CONFIG.propagateExitStatus,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(observed.error, coordinate(step)).toBeUndefined();
    expect(observed.thrown).toBeUndefined();
  }
  return find;
}

const draw = (find: (key: string) => any) =>
  ['Consolation|2|3', 'Consolation|3|2', 'Consolation|4|2', 'Consolation|5|1', 'Consolation|6|1'].map((key) => {
    const matchUp = find(key);
    return {
      key,
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
      occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
    };
  });

it('the census schedule refuses nothing after a write', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'holders-bye')).toBeNull();
});

it("the carrier's default meets the held walkover in the matchUp the holder's BYE stands in", () => {
  const find = play('holders-bye-settled', SCHEDULE.slice(0, -1));
  expect(find('Consolation|3|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  // nobody was carried past the holder's BYE: the matchUp beyond holds only the participant fed there
  const beyond = find('Consolation|4|2');
  expect(beyond.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(beyond.sides.filter((side: any) => side?.participantId)).toHaveLength(1);
  expect(find('Consolation|5|1').matchUpStatus).toEqual(WALKOVER);
  expect(find('Consolation|5|1').winningSide).toBeUndefined();
});

it('the double default entered before the double walkover reaches the same draw', () => {
  const late = draw(play('holders-bye-late', SCHEDULE));
  const early = draw(play('holders-bye-early', [...SCHEDULE.slice(0, 9), SCHEDULE[10], SCHEDULE[9], SCHEDULE[11]]));
  expect(late).toEqual(early);
});

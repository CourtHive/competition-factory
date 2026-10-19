import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * A CARRIER UNDER A STALE DOUBLE EXIT IS NOT AWARDED (census S8 on arm, OLYMPIC 32/30, 20625776,
 * DRAW_INCONSISTENCY EXIT_CODE_ON_WINNER_SIDE).
 *
 * `West|3|1` is a double walkover: its occupant carries `East|1|2`'s walkover, and `West|2|2`'s convergence produced
 * the other side. `East|1|8` re-entered from a double default to a walkover takes the BYE out of `West|1|4`, so
 * `West|2|2` loses the participant it had converged with and settles as a single default; the loser who takes the
 * BYE's seat brings a walkover of their own, `West|1|4` converges, and `West|2|2` converges again and produces onto
 * `West|3|1` once more. `West|3|1` still read DOUBLE_WALKOVER from before. The check that the occupant carries an exit
 * asked only of a SINGLE exit (`isExit`), so the occupant was awarded the produced walkover, the matchUp read a
 * WALKOVER won by the side carrying the exit, and they went on into `West|4|1`.
 *
 * The occupant carries an exit whatever kind of exit the target holds, so the two converge (RULE 4) and the draw
 * equals the one the same results entered directly reach. #5455 (a relabel into an exit takes back an award over a
 * carried exit) is what brings `West|1|4` to a convergence on this path.
 */

type Step = [string, any];
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const config = { drawType: OLYMPIC, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20625776 };
const schedule: Step[] = [
  ['East|1|7', { winningSide: 1 }],
  ['East|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|6', { matchUpStatus: DOUBLE_DEFAULT }],
  ['East|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['East|1|8', { matchUpStatus: DOUBLE_DEFAULT }],
  ['East|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }],
];
// each matchUp entered once, as it finally stands, in the order it was first entered
const direct: Step[] = [
  ['East|1|7', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['East|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|6', { matchUpStatus: DOUBLE_DEFAULT }],
  ['East|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['East|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['East|1|5', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
];

afterEach(() => {
  delete process.env.ALLOW_CHANGE_PROPAGATION;
});

function play(steps: Step[], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId)).toEqual(true);
  for (const [key, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
    const result: any = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.thrown).toBeUndefined();
  }
  const issueTypes = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
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
  return { draw, issueTypes };
}

it.each([false, true])('allowChangePropagation %s: the carrier in West|3|1 converges', (allow) => {
  if (allow) process.env.ALLOW_CHANGE_PROPAGATION = '1';
  const corrected = play(schedule, 'stale-double-exit-corrected');
  expect(corrected.issueTypes).toEqual([]);
  expect(corrected.draw['West|3|1'].matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(corrected.draw['West|3|1'].winningSide).toBeUndefined();
  expect(corrected.draw['West|4|1'].occupants.filter(Boolean)).toEqual([]);

  expect(corrected.draw).toEqual(play(direct, 'stale-double-exit-direct').draw);
});

it('the schedule replays clean on the arm that reported it', () => {
  process.env.ALLOW_CHANGE_PROPAGATION = '1';
  setSubscriptions({});
  const steps = schedule.map(([key, outcome]) => {
    const [structureName, roundNumber, roundPosition] = key.split('|');
    return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
  });
  expect(replay(config, steps, 'stale-double-exit-replay')).toBeNull();
});

import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A WITHDRAWN ARRIVAL LEAVES THE AWARD ITS EXIT MADE (census S8 policy-off, ERROR_IMPLIES_NO_MUTATION
 * ERR_EXISTING_POSITION_ASSIGNMENT, CURTIS_CONSOLATION 16/13: 20669990).
 *
 * `Main|1|2`'s double walkover converges in `Consolation 1|2|1` and produces a walkover into `Consolation 1|3|1`, which
 * awards it to the participant opposite, who goes on into `Consolation 1|4|1` and wins that on `Consolation 1|3|2`'s
 * produced walkover. Re-scoring `Main|1|2` as a played win sends its loser past a BYE into `Consolation 1|2|1`, which
 * now awards them its walkover, and on into `Consolation 1|3|1`, which still reads the stale award, and so into
 * `Consolation 1|4|1` beside the participant already there. When the settle then withdraws what `Consolation 1|3|1`
 * sent on, `Consolation 1|4|1` loses only an ARRIVAL record: its exit is untouched. Re-reading its winner as if an exit
 * had gone (#5419's "a withdrawn exit that moves an award releases the old one") kept the stale arrival as the winner,
 * and the next result in `Consolation 1|3|1` was refused after a write. A winner is re-read only when an exit is
 * withdrawn. Passed before 223fe37b72.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const RETIREMENT = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

const config = {
  drawType: CURTIS_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 13,
  drawSize: 16,
  seed: 20669990,
};
const CORRECTED = 6;
const CORRECTION = 11;
const schedule = [
  at('Main|1|5', { winningSide: 1 }),
  at('Main|1|6', RETIREMENT),
  at('Main|1|4', { winningSide: 2 }),
  at('Main|2|3', RETIREMENT),
  at('Main|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|2', { winningSide: 2 }),
  at('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Consolation 1|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|1|7', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Consolation 1|2|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|2', { winningSide: 2 }),
  at('Main|2|1', { winningSide: 1 }),
  at('Consolation 1|3|1', { winningSide: 1 }),
];

function drawAfter(steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId, POLICY_OFF);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const result: any = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.thrown).toBeUndefined();
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

it('20669990: the corrected schedule leaves a consistent draw', () => {
  setSubscriptions({});
  expect(replay(config, schedule, 'withdrawn-arrival', POLICY_OFF)).toBeNull();
});

it('20669990: the correction reaches the draw the played win entered directly reaches', () => {
  const viaCorrection = drawAfter(schedule.slice(0, CORRECTION + 1), 'withdrawn-arrival-corrected');
  // the played win entered where the double walkover was, and everything after it in the same order
  const direct = drawAfter(
    [...schedule.slice(0, CORRECTED), schedule[CORRECTION], ...schedule.slice(CORRECTED + 1, CORRECTION)],
    'withdrawn-arrival-direct',
  );
  expect(viaCorrection).toEqual(direct);
  // nobody has won `Consolation 1|3|1`, so nobody from it stands one round on
  expect(viaCorrection['Consolation 1|3|1'].winningSide).toBeUndefined();
  expect(viaCorrection['Consolation 1|4|1'].occupants.filter(Boolean)).toEqual([]);
});

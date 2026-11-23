import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A SEAT THAT BECOMES A BYE KEEPS NOTHING IT WAS AWARDED (census run 18 MONOTONIC_DECISION, MODIFIED_FEED_IN_CHAMPIONSHIP
 * 32/29 under `doubleExitPropagateBye: false`, seed 20655968).
 *
 * `Main|2|1`'s loser is fed into `Consolation|2|8` (dp 8). `Main|1|15`'s double default produces a DEFAULTED there, which
 * RULE 2 awards to the loser's seat, and dp 8 goes on into `Consolation|3|4`. `Main|2|1` is then re-scored as a double
 * default: the loser leaves and the seat becomes the BYE nobody can fill. The release kept dp 8 in `3|4`, because a
 * seat a produced exit advanced is kept for whoever arrives next, and the BYE was then placed at that furthest
 * advancement: `3|4` read BYE, the opponent's seat dp 23 was never advanced, and once `Main|1|15` was cleared and
 * re-entered the arriving loser took `3|4` back from the BYE, un-deciding it.
 *
 * The rule: a BYE is never won (CA, 2026-09-27), so a seat that becomes a BYE keeps no advancement an award gave it.
 * Before the BYE is placed, its position is taken back out of the rounds after the fed matchUp; the BYE lands in the fed
 * matchUp beside the exit it holds. Clearing `Main|1|15` then leaves the draw the two remaining results leave on their
 * own.
 */

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = {
  drawType: MODIFIED_FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: false,
  participantsCount: 29,
  drawSize: 32,
  seed: 20655968,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CLEAR = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED };
const CENSUS_SCHEDULE = [
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|1|9', { winningSide: 1 }),
  at('Main|2|1', { winningSide: 2 }),
  at('Main|1|15', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|7', { winningSide: 2 }),
  at('Main|1|14', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|1|8', { winningSide: 2 }),
  at('Main|1|10', { winningSide: 1 }),
  at('Main|1|15', CLEAR),
  at('Main|1|5', { winningSide: 1 }),
  at('Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
];
const WALKED_OVER = at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 });
const PLAYED = at('Main|2|1', { winningSide: 2 });
const CONVERGING = at('Main|1|15', { matchUpStatus: DOUBLE_DEFAULT });
const REDERIVED = at('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT });
const DEFAULTS = at('Main|1|15', { matchUpStatus: DEFAULTED, winningSide: 1 });

function play(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
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
  drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
  participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
});
const KEYS = ['Consolation|1|8', 'Consolation|2|8', 'Consolation|3|4'];

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, CENSUS_SCHEDULE, 'seat-becomes-bye', POLICY_OFF)).toBeNull();
});

it('the BYE lands in the fed matchUp, and its award does not go on', () => {
  const find = play('seat-becomes-bye-steps', [WALKED_OVER, PLAYED, CONVERGING, REDERIVED]);
  const fed = find('Consolation|2|8');
  expect(fed.matchUpStatus).toEqual('BYE');
  expect(fed.winningSide).toBeUndefined();
  const onward = find('Consolation|3|4');
  expect(onward.drawPositions ?? []).not.toContain(8);
  expect(onward.matchUpStatus).not.toEqual('BYE');
});

it('clearing the double default leaves the draw the remaining results leave, and the loser arrives the same', () => {
  const cleared = play('seat-becomes-bye-cleared', [
    WALKED_OVER,
    PLAYED,
    CONVERGING,
    REDERIVED,
    at('Main|1|15', CLEAR),
  ]);
  const clearedStates = KEYS.map((key) => state(cleared(key)));
  const direct = play('seat-becomes-bye-direct', [WALKED_OVER, REDERIVED]);
  expect(clearedStates).toEqual(KEYS.map((key) => state(direct(key))));

  const late = play('seat-becomes-bye-late', [
    WALKED_OVER,
    PLAYED,
    CONVERGING,
    REDERIVED,
    at('Main|1|15', CLEAR),
    DEFAULTS,
  ]);
  const lateStates = KEYS.map((key) => state(late(key)));
  const first = play('seat-becomes-bye-first', [WALKED_OVER, REDERIVED, DEFAULTS]);
  expect(lateStates).toEqual(KEYS.map((key) => state(first(key))));
});

import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * AN EXIT CARRIED PAST A BYE CONVERGES WITH THE EXIT STANDING THERE.
 *
 * The eleventh at-scale run's one stall, under `doubleExitPropagateBye: false`, pre-existing (identical on v7.9.0).
 * `Main|1|4` is played, its loser advances through the consolation to `Consolation|3|1` (past `Consolation|2|2`'s BYE,
 * beating the WALKOVER `Main|1|2`'s double exit left there), and `Main|1|4` is then re-scored as a WALKOVER with the
 * same winner. The loser now carries the walkover, `Consolation|1|2` becomes a DOUBLE_WALKOVER, and its produced exit
 * passes the BYE again and reaches `Consolation|3|1` — beside the WALKOVER still standing there.
 * `advanceByeAdvancedDrawPosition` wrote it as one more PENDING walkover, waiting for an opponent the other side's exit
 * means can never come: nothing went on to the consolation final, and its occupant waited forever.
 *
 * Recorded directly (the forward order), the same walkover reaches an empty `Consolation|3|1` first and the standing
 * exit converges with it there. The correction now converges too, so both orders leave the same draw.
 * Falsified before the change: the corrected order stalled at `Consolation|4|1`.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const config = {
  drawType: FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 7,
  seed: 20380227,
  drawSize: 8,
};

const MAIN_1_2_DOUBLE_WALKOVER: [string, any] = ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }];
const MAIN_1_4_PLAYED: [string, any] = ['Main|1|4', { winningSide: 2 }];
const MAIN_1_3_DOUBLE_DEFAULT: [string, any] = ['Main|1|3', { matchUpStatus: DOUBLE_DEFAULT }];
const MAIN_1_4_WALKOVER: [string, any] = ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }];
const MAIN_FINAL_PLAYED: [string, any] = ['Main|3|1', { winningSide: 1 }];

const CORRECTED = [
  MAIN_1_2_DOUBLE_WALKOVER,
  MAIN_1_4_PLAYED,
  MAIN_1_3_DOUBLE_DEFAULT,
  MAIN_1_4_WALKOVER,
  MAIN_FINAL_PLAYED,
];
const FORWARD = [MAIN_1_2_DOUBLE_WALKOVER, MAIN_1_4_WALKOVER, MAIN_1_3_DOUBLE_DEFAULT, MAIN_FINAL_PLAYED];

function play(steps: [string, any][], drawId: string) {
  setSubscriptions({});
  expect(prepareDraw(config, drawId, policyDefinitions)).toEqual(true);
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const result = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success, coordinates).toEqual(true);
  }

  const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  const stalls = (integrity.inconsistencies ?? []).filter((issue: any) => issue.issueType === STALLED_POSITION);
  const projection = getDrawMatchUps(drawId)
    .map((matchUp: any) => ({
      seat: key(matchUp),
      matchUpStatus: matchUp.matchUpStatus,
      winningSide: matchUp.winningSide,
      participants: (matchUp.sides ?? []).map((side: any) => side.participant?.participantName ?? null),
    }))
    .sort((a, b) => a.seat.localeCompare(b.seat));
  return { stalls, projection };
}

it('a correction converges the exit it carries past a BYE with the exit standing in Consolation|3|1', () => {
  const corrected = play(CORRECTED, 'corrected');
  expect(corrected.stalls).toEqual([]);

  const seat = (seat: string) => corrected.projection.find((matchUp) => matchUp.seat === seat);
  expect(seat('Consolation|3|1')?.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(seat('Consolation|4|1')?.matchUpStatus).toEqual(WALKOVER);
  expect(seat('Consolation|4|1')?.winningSide).toEqual(1);
  expect(seat('Consolation|4|1')?.participants[0]).toEqual('Cordelia Ellul');
});

it('the corrected order leaves the draw the forward order leaves', () => {
  const corrected = play(CORRECTED, 'corrected');
  const forward = play(FORWARD, 'forward');
  expect(forward.stalls).toEqual([]);
  expect(corrected.projection).toEqual(forward.projection);
});

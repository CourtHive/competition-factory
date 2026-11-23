import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A REMOVAL CLEARS THE SIDE THE REMOVED POSITION HELD, IN THE FRAME THE RECORD IS IN (census run 18
 * ADVANCED_FROM_UNDECIDED, FIRST_MATCH_LOSER_CONSOLATION 16/11 under `doubleExitPropagateBye: false`, seed 20704784).
 *
 * `Main|1|5`'s double walkover relays a produced walkover through the Consolation BYEs into `Consolation|3|2` at dp 9,
 * opposite dp 4, and the walkover is awarded to dp 4's seat, which goes on into `4|1`. Re-scoring `Main|1|5` to a
 * result takes dp 9 out of `3|2`, and with it the produced exit. With dp 4 alone it moves to its bracket side, 2, and
 * the record was re-keyed with it, so the exit entry dp 9 held on side 2 moved to side 1; the cleared side was then
 * read in the frame BEFORE the removal (side 2) and the exit was kept. `3|2` stayed a pending walkover, which is not
 * the undecided matchUp whose advances are released, so dp 4 stayed in `4|1`, and `Main|2|4`'s loser, reaching dp 4,
 * stood in both.
 *
 * The rule: a side read in one frame and applied to a record re-keyed into another is translated across the swap.
 */

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: false,
  participantsCount: 11,
  drawSize: 16,
  seed: 20704784,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|2|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|4', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: TO_BE_PLAYED }),
  at('Main|1|5', { winningSide: 2 }),
  at('Main|2|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
];
// the same results, each entered once
const FORWARD = [SCHEDULE[3], SCHEDULE[4]];

function play(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  const states: Record<string, any>[] = [];
  for (const step of steps) {
    observeMutation({
      propagateExitStatus: CONFIG.propagateExitStatus,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });
    states.push(snapshot(drawId));
  }
  return states;
}

function snapshot(drawId: string) {
  const matchUps = getDrawMatchUps(drawId);
  const keyOf = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  return Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
        participants: (matchUp.sides ?? []).map((side: any) => side.participantId),
        provenance: Object.fromEntries(
          Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
            side,
            [entry?.matchUpStatus, keyOf.get(entry?.sourceMatchUpId)],
          ]),
        ),
      },
    ]),
  );
}

it('no draw inconsistency once the double walkover is re-scored', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'cleared-side-frame', POLICY_OFF)).toBeNull();
});

it('the produced exit leaves with dp 9, and the award it made takes dp 4 back out of the next round', () => {
  const states = play('cleared-side-frame-steps', SCHEDULE);
  expect(states[2]['Consolation|3|2'].drawPositions).toEqual([4, 9]);
  expect(states[2]['Consolation|3|2'].matchUpStatus).toEqual(WALKOVER);
  // dp 4's occupant has left, so the advance their award made left with them: `Main|1|5`'s double walkover entered
  // alone leaves dp 4 out of `4|1` (census A1 int2 dpws, `aWithdrawnAwardTakesBackTheAdvanceItMade`; this read
  // `toContain(4)`, the residue of the release keeping an occupant's advance as the produced exit's own)
  expect(states[2]['Consolation|4|1'].drawPositions).not.toContain(4);

  const rescored = states[3];
  expect(rescored['Consolation|3|2'].drawPositions).toEqual([4]);
  expect(rescored['Consolation|3|2'].matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(rescored['Consolation|3|2'].winningSide).toBeUndefined();
  expect(rescored['Consolation|3|2'].provenance).toEqual({});
  expect(rescored['Consolation|4|1'].drawPositions).not.toContain(4);

  expect(states[4]['Consolation|4|1'].drawPositions).not.toContain(4);
});

it('the whole draw matches the same results entered once each', () => {
  const late = play('cleared-side-frame-late', SCHEDULE);
  const forward = play('cleared-side-frame-forward', FORWARD);
  expect(late.at(-1)).toEqual(forward.at(-1));
});

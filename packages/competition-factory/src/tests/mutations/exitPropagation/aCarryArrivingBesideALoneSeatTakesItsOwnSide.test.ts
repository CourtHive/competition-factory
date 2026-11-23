import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A CARRY ARRIVING BESIDE A LONE SEAT TAKES ITS OWN SIDE (census run 18 WINNING_SIDE_ADVANCEMENT_MISMATCH,
 * FEED_IN_CHAMPIONSHIP 8/5 under `doubleExitPropagateBye: false`, seed 20753100).
 *
 * `Main|1|2`'s walkover carries its loser (dp 5) into `Consolation|2|1`, awarded to the empty fed seat. `Main|2|1`'s
 * double walkover relays its produced exit past `Consolation|2|2`'s BYE into `Consolation|3|1`, where dp 3 stands alone
 * on its bracket side, 2. `Main|2|2`'s double walkover then puts a BYE in `Consolation|2|1`, and the walkover carrier
 * goes past it into `3|1` at dp 5. With two positions present the sides sort by drawPosition: dp 3 to side 1, dp 5 to
 * side 2. The carry was stamped at side 2 BEFORE the record was re-keyed for the arrival, so it overwrote dp 3's produced
 * exit, and the re-keying then moved it onto dp 3's side: `3|1` read as a walkover by dp 3 and was won by the carrier,
 * who went on into `4|1`. Two exits meet there, and forward play converges them (DOUBLE_WALKOVER). When `Main|2|1` is
 * re-scored its loser reaches dp 3 and wins `3|1` on the carrier's walkover; the carrier stayed in `4|1`.
 *
 * The rule: a side fact written before the positions are written is keyed in the frame the record is still in, so the
 * re-keying that follows carries it to the seat it names.
 */

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 5,
  drawSize: 8,
  seed: 20753100,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|1', { winningSide: 2 }),
];
// the same results, `Main|2|2`'s double walkover entered before `Main|2|1`'s
const FORWARD = [SCHEDULE[0], SCHEDULE[2], SCHEDULE[1], SCHEDULE[3]];

function play(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  const states: Record<string, any>[] = [];
  for (const step of steps) {
    observeMutation({
      propagateExitStatus: true,
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
  expect(replay(CONFIG, SCHEDULE, 'carry-lone-seat', POLICY_OFF)).toBeNull();
});

it('the carry and the relayed exit each keep their own seat, and the two converge', () => {
  const states = play('carry-lone-seat-steps', SCHEDULE);
  const converged = states[2]['Consolation|3|1'];
  expect(converged.drawPositions).toEqual([3, 5]);
  expect(converged.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(converged.winningSide).toBeUndefined();
  // dp 3 on side 1 holds `Main|2|1`'s produced exit; the carrier on side 2 holds its own walkover from `Main|1|2`
  expect(converged.provenance).toEqual({ 1: [WALKOVER, 'Main|2|1'], 2: [WALKOVER, 'Main|1|2'] });
  expect(states[2]['Consolation|4|1'].drawPositions).not.toContain(5);

  const final = states[3];
  expect(final['Consolation|3|1'].winningSide).toEqual(1);
  expect(final['Consolation|4|1'].drawPositions).toContain(3);
  expect(final['Consolation|4|1'].drawPositions).not.toContain(5);
});

it('the whole draw matches the order that enters the double walkovers the other way round', () => {
  const late = play('carry-lone-seat-late', SCHEDULE);
  const forward = play('carry-lone-seat-forward', FORWARD);
  expect(late[2]).toEqual(forward[2]);
  expect(late[3]).toEqual(forward[3]);
});

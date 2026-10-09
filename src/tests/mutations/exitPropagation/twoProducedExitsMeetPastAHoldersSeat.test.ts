import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * TWO PRODUCED EXITS MEET PAST A HOLDER'S SEAT — census policy-off 20147820 (DOUBLE_ELIMINATION 16/11,
 * `doubleExitPropagateBye: false`), fourth at-scale run, forward play.
 *
 * `Main|1|7`'s double default produces a DEFAULTED into the Backdraw; relayed past `1|1`'s BYE it rests in `2|1` on a
 * seat nobody will fill, and the BYE that `Main|2|1`'s double walkover then puts in `2|1`'s other seat makes `2|1` a
 * holder whose exit is owed to `3|1`. There a second produced exit already stands, from the convergence in `2|2`. The
 * two should meet and converge. But `3|1`'s arrival side recorded the holder's empty seat moving in while the holder
 * still read DEFAULTED, and `getHeldExit` recognised a seat-move from the holder only when it was recorded as a BYE: the
 * entry read as a delivery in the way, the exit stayed held, and `Main|2|2`'s loser waited in `4|1` for `3|1`'s winner
 * (STALLED_POSITION there, in the Backdraw final and in the Main final).
 *
 * An exit-free arrival entry from the holder itself is the seat the exit travels to, whatever status the holder read
 * when the seat moved. Sent on, the two produced exits converge; the double default produces into `4|1`, its occupant
 * wins by default, takes the carried default waiting in `5|1`, and the Backdraw final is playable.
 */

const DRAW_ID = 'two-produced-exits-meet-past-a-holders-seat';
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 11,
  seed: 20147820,
  drawSize: 16,
};
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

const at = (key: string): any =>
  getDrawMatchUps(DRAW_ID).find(
    (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}` === key,
  );

function enter(key: string, outcome: any) {
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: at(key).matchUpId,
    propagateExitStatus: true,
    drawId: DRAW_ID,
    outcome,
  });
  expect(result.error).toBeUndefined();
}

const participants = (key: string) => (at(key).sides ?? []).map((side: any) => side?.participantId).filter(Boolean);

it('the held exit is sent on to meet the produced exit waiting there, and the backdraw plays through', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY)).toEqual(true);
  enter('Main|1|5', { matchUpStatus: DOUBLE_DEFAULT });
  enter('Main|1|7', { matchUpStatus: DOUBLE_DEFAULT });
  enter('Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter('Main|3|2', { winningSide: 1 });
  enter('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });
  // Main|2|2's loser has come through the Backdraw's BYEs to 4|1, and waits there for 3|1's winner
  const [waiting] = participants('Backdraw|4|1');
  expect(waiting).toBeDefined();
  enter('Main|4|1', { winningSide: 1 });

  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).toEqual([]);
  expect(at('Backdraw|3|1').matchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(at('Backdraw|4|1')).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 1 });
  // the occupant of 4|1 went on through the carried default in 5|1 to a playable Backdraw final
  expect(participants('Backdraw|5|1')).toContain(waiting);
  expect(at('Backdraw|6|1').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(participants('Backdraw|6|1')).toHaveLength(2);
  expect(participants('Backdraw|6|1')).toContain(waiting);
});

/**
 * The same meeting one correction later: `Main|2|1` first DEFAULTED (its loser converges with the held exit in `2|1`, and
 * that double default meets `2|2`'s in `3|1`), then re-scored as a double walkover. The loser leaves, `2|1` is a holder
 * again, and `3|1` re-derives to `2|2`'s produced exit alone — DECIDED, awarding the held exit's arrival seat with nobody
 * behind it. The held exit is still owed there: the two produced exits converge as they do entered forward.
 */
it('re-scored from a defaulted loser to a double walkover, the held exit still meets the produced exit waiting', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY)).toEqual(true);
  enter('Main|1|5', { matchUpStatus: DOUBLE_DEFAULT });
  enter('Main|1|7', { matchUpStatus: DOUBLE_DEFAULT });
  enter('Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter('Main|3|2', { winningSide: 1 });
  enter('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });
  const [waiting] = participants('Backdraw|4|1');
  expect(waiting).toBeDefined();
  enter('Main|4|1', { winningSide: 1 });

  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).toEqual([]);
  expect(at('Backdraw|3|1').matchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(at('Backdraw|4|1')).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 1 });
  expect(participants('Backdraw|6|1')).toHaveLength(2);
  expect(participants('Backdraw|6|1')).toContain(waiting);
});

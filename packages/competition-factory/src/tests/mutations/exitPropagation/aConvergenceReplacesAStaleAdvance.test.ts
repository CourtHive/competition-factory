import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A LEAVER'S PRODUCED-EXIT ADVANCE GOES WITH THEM — census policy-off 20177818 (CURTIS_CONSOLATION 16/11,
 * `doubleExitPropagateBye: false`), fourth at-scale run.
 *
 * `Main|2|2`'s loser enters `Consolation 1` and wins two produced walkovers in a row — the one relayed from `Main|1|5`'s
 * double walkover at `2|3`, the one from `Main|2|1`'s at `3|2` — and stands in the final. Re-scoring `Main|2|2` as a
 * double walkover removes them. Their seat was held open in `3|2` (`occupantLeaving`), but `releaseAdvancedDrawPosition`
 * kept it in the final: a seat a produced exit advanced "belongs to the exit, not to whoever later occupies it" — the
 * rule for a seat nobody sat in. Here somebody sat in it, took the award and went on; leaving, that advance is theirs.
 * Kept, the produced exit that now arrives for the vacated seat met it in the final (ERR_EXISTING_POSITION_ASSIGNMENT
 * after the draw had changed), and re-scoring `Main|2|2` as a played loss left its loser unadvanced (WINNER_NOT_ADVANCED)
 * and the final stalled.
 */

const DRAW_ID = 'convergence-replaces-a-stale-advance';
const CONFIG = {
  drawType: CURTIS_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 11,
  seed: 20177818,
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
  expect(result.error, `${key} ${JSON.stringify(outcome)}`).toBeUndefined();
}

const participants = (key: string) => (at(key).sides ?? []).map((side: any) => side?.participantId).filter(Boolean);

it('removed after taking two produced walkovers, the leaver is out of the final, and the next loser plays it', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY)).toEqual(true);
  enter('Main|1|5', { matchUpStatus: DOUBLE_WALKOVER });
  enter('Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 });
  enter('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 });
  enter('Main|2|4', { winningSide: 1 });
  enter('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER });
  enter('Main|2|2', { winningSide: 1 });
  enter('Consolation 1|2|1', { matchUpStatus: WALKOVER, winningSide: 1 });
  enter('Main|3|2', { winningSide: 1 });
  // Main|2|2's loser has taken two produced walkovers and stands in the final
  const [finalist, leaver] = participants('Consolation 1|4|1');
  expect(leaver).toBeDefined();
  expect(participants('Consolation 1|3|2')).toEqual([leaver]);

  enter('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER });
  expect(participants('Consolation 1|4|1')).toEqual([finalist]);
  expect(participants('Consolation 1|3|2')).toEqual([]);

  enter('Main|2|2', { winningSide: 2 });
  enter('Main|4|1', { matchUpStatus: WALKOVER, winningSide: 1 });
  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).toEqual([]);
  // the new loser of Main|2|2 takes the same two walkovers and plays the final
  const final = at('Consolation 1|4|1');
  expect(final.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(participants('Consolation 1|4|1')).toHaveLength(2);
  expect(participants('Consolation 1|4|1')).toContain(finalist);
  expect(participants('Consolation 1|4|1')).not.toContain(leaver);
});

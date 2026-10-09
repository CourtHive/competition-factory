import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A HELD EXIT MEETS A SEAT A CARRIER'S OWN EXIT HAS AWARDED — census policy-off 20161035 and 20117658
 * (FIRST_MATCH_LOSER_CONSOLATION 16/11, `doubleExitPropagateBye: false`), fourth and third at-scale runs, forward play.
 *
 * With the policy off, `Main|1|7`'s double walkover produces a WALKOVER into the consolation instead of a BYE. It is
 * relayed past the structural BYE in `Consolation|1|4` into `2|4`, where it rests on a seat nobody will ever fill; the
 * BYE that P39 then puts in `2|4`'s other seat makes `2|4` a holder, and its exit is owed to `3|2`. Before the settle
 * sends it on, `Main|2|3`'s walkover loser comes through `2|3`'s BYE into `3|2` carrying their own walkover, which
 * awards the empty seat opposite: `3|2` reads WALKOVER, won by nobody. `getHeldExit` declined a target with a
 * `winningSide`, so the held exit stayed in `2|4`, and the final waited on the empty seat's "winner" (STALLED_POSITION).
 *
 * A target decided only by awarding the seat the held exit travels to is the one case a decided target is still the
 * exit's: arriving there, it meets the carrier's exit and the two converge (RULE 4). The double walkover produces
 * onward, and the finalist who was waiting wins the final by walkover.
 */

const DRAW_ID = 'held-exit-meets-an-awarded-seat';
const CONFIG = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 11,
  seed: 20161035,
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

it('the carrier arrives first and wins nobody; the held exit sent on converges with theirs, and the final is decided', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY)).toEqual(true);
  enter('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER });
  enter('Main|1|2', { winningSide: 2 });
  enter('Main|2|3', { matchUpStatus: WALKOVER, winningSide: 2 });
  // the carrier stands in `3|2` opposite the seat the held exit is owed, and the matchUp is theirs to lose
  const [carrier] = at('Consolation|3|2')
    .sides.map((side: any) => side.participantId)
    .filter(Boolean);
  expect(carrier).toBeDefined();
  enter('Main|2|1', { winningSide: 2 });
  enter('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT });
  enter('Main|3|2', { winningSide: 1 });
  enter('Main|3|1', { winningSide: 1 });
  enter('Main|4|1', { winningSide: 1 });
  enter('Consolation|2|1', { winningSide: 2 });

  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).toEqual([]);
  // two exits met at `3|2`
  expect(at('Consolation|3|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(
    at('Consolation|3|2')
      .sides.map((side: any) => side.participantId)
      .filter(Boolean),
  ).toEqual([carrier]);
  // and the finalist who was waiting wins the final by the walkover it produced
  const final = at('Consolation|4|1');
  expect(final.matchUpStatus).toEqual(WALKOVER);
  const winner = final.sides.find((side: any) => side.sideNumber === final.winningSide)?.participantId;
  expect(winner).toBeDefined();
  expect(winner).not.toEqual(carrier);
});

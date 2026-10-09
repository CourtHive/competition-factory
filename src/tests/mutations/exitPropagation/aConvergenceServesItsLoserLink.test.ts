import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A CONVERGENCE SERVES ITS LOSER LINK — census policy-off 20168928 (COMPASS 16/13, `doubleExitPropagateBye: false`),
 * fourth at-scale run, forward play.
 *
 * `East|1|2`'s double default and `East|1|4`'s double walkover each produce an exit into West (no BYE, with the policy
 * off); relayed past West's first-round BYEs they meet in `West|2|1` and converge: a double walkover with nobody in it.
 * A double exit serves both its links — `doubleExitAdvancement` gives a director's double exit's loser target a BYE or
 * a produced exit — but a convergence written at the settle served only its winner target (`West|3|1`). The seat its
 * loser link feeds, `Southwest|1|1`, waited for the loser of a matchUp that has none: STALLED_POSITION beside the
 * participant who had already arrived there.
 *
 * Served as a double exit's loser target is, the seat holds the produced walkover and its opponent wins it.
 */

const DRAW_ID = 'convergence-serves-its-loser-link';
const CONFIG = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 13, seed: 20168928, drawSize: 16 };
const POLICY = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const RETIREMENT = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

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

it('two produced exits converge, and the seat their loser link feeds is given the produced walkover', () => {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, DRAW_ID, POLICY)).toEqual(true);
  enter('East|1|4', { matchUpStatus: DOUBLE_WALKOVER });
  enter('East|1|5', { winningSide: 2 });
  enter('East|1|7', { winningSide: 2 });
  enter('East|1|2', { matchUpStatus: DOUBLE_DEFAULT });
  enter('East|3|1', { winningSide: 1 });
  enter('East|1|6', { winningSide: 1 });
  enter('West|1|3', { winningSide: 1 });
  enter('East|2|3', RETIREMENT);
  enter('East|2|4', { winningSide: 1 });
  enter('North|1|2', { matchUpStatus: WALKOVER, winningSide: 2 });
  enter('West|2|2', { winningSide: 2 });
  enter('East|3|2', { matchUpStatus: DOUBLE_DEFAULT });

  const issues = (getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? []).map(
    (inconsistency: any) => inconsistency.issueType,
  );
  expect(issues).toEqual([]);
  // the convergence, with nobody in it
  const converged = at('West|2|1');
  expect(converged.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(converged.sides.map((side: any) => side.participantId).filter(Boolean)).toEqual([]);
  // its loser target holds the produced walkover, won by the participant waiting there
  const fed = at('Southwest|1|1');
  expect(fed.matchUpStatus).toEqual(WALKOVER);
  const winner = fed.sides.find((side: any) => side.sideNumber === fed.winningSide)?.participantId;
  expect(winner).toBeDefined();
  expect(fed.sides.map((side: any) => side.participantId).filter(Boolean)).toEqual([winner]);
});

import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A DISSOLVED CONVERGENCE LEAVES ITS BYES AS BYES — census w2 9100211 (FIRST_MATCH_LOSER_CONSOLATION 32/32,
 * `doubleExitPropagateBye: false`), frozen window.
 *
 * `Main|1|8`'s walkover loser enters `Consolation|1|4` carrying it, opposite `Main|1|7`'s produced DEFAULTED: the two
 * converge (RULE 4). The convergence produces a WALKOVER into `Consolation|2|4`, beside its BYE, and that BYE is advanced
 * into `Consolation|3|2`, carrying its occupant on into `Consolation|4|1`. Re-scoring `Main|1|8` as a played win by the
 * same winner dissolves the convergence, and two things were left behind:
 *
 * - the withdrawn WALKOVER's label at `Consolation|2|4` (`WALKOVER ws=2` over an empty seat): a BYE-held matchUp whose
 *   last exit is withdrawn is the BYE again, and a BYE is never won;
 * - the occupant in `Consolation|4|1`: the loser who now comes through takes the BYE's seat in `Consolation|3|2`, which
 *   is then a match to be played, and what the BYE advanced its occupant into is released.
 *
 * Entered played from the start, neither is there.
 */

const DRAW_ID = 'dissolved-convergence-leaves-its-byes-as-byes';

const at = (key: string): any => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === Number(roundNumber) &&
        matchUp.roundPosition === Number(roundPosition),
    );
};

function play(steps: [string, any][]) {
  setSubscriptions({});
  const config = {
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    propagateExitStatus: true,
    participantsCount: 32,
    seed: 9100211,
    drawSize: 32,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const view = (key: string) => {
    const { matchUpStatus, winningSide, drawPositions } = at(key);
    return { matchUpStatus, winningSide, drawPositions };
  };
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    consolation: ['Consolation|2|4', 'Consolation|3|2', 'Consolation|4|1'].map(view),
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
  };
}

const BEFORE: [string, any][] = [['Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }]];
const AFTER: [string, any][] = [
  ['Main|1|7', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|1|5', { winningSide: 2 }],
];

it('re-scored from a walkover to a played win, the convergence dissolves to the draw forward play leaves', () => {
  const direct = play([...BEFORE, ['Main|1|8', { winningSide: 2 }], ...AFTER]);
  const corrected = play([
    ...BEFORE,
    ['Main|1|8', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ...AFTER,
    ['Main|1|8', { winningSide: 2 }],
  ]);
  expect(corrected).toEqual(direct);
  expect(corrected.issues).toEqual([]);
});

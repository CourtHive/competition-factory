import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A CARRIER OPPOSITE A PRODUCED EXIT CONVERGES WITH IT — census 20099689 (FIRST_ROUND_LOSER_CONSOLATION 8/7,
 * `doubleExitPropagateBye: false`).
 *
 * `Main|1|3` is a walkover, so its loser enters `Consolation|1|2` carrying it; `Main|1|4`'s played loser stands
 * opposite and is awarded the matchUp, and then the next one. Re-scoring `Main|1|4` as a DOUBLE_DEFAULT takes that loser
 * back and produces a DEFAULTED onto their seat: it meets the carried WALKOVER, and the two converge (RULE 4). The fed
 * seat stays listed once its participant is removed, so the target counted two positions and the carried exit was not
 * read as standing: the DEFAULTED was awarded to the carrier, who was advanced into `Consolation|2|1` — where the old
 * loser's position still stood — and the re-score was refused after mutating the draw (ERR_EXISTING_POSITION_ASSIGNMENT).
 * Entering the double default directly converges.
 */

const DRAW_ID = 'carrier-opposite-a-produced-exit-converges';

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
    drawType: FIRST_ROUND_LOSER_CONSOLATION,
    propagateExitStatus: true,
    participantsCount: 7,
    seed: 20099689,
    drawSize: 8,
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
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    consolation: ['Consolation|1|2', 'Consolation|2|1'].map((key) => at(key).matchUpStatus),
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
  };
}

const BEFORE: [string, any][] = [
  ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|2|1', { winningSide: 2 }],
];
const CARRIER: [string, any] = ['Main|1|3', { matchUpStatus: WALKOVER, winningSide: 2 }];
const DOUBLE: [string, any] = ['Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }];

it('re-scored to a double default, the produced DEFAULTED converges with the carried WALKOVER, as entered directly', () => {
  const direct = play([...BEFORE, CARRIER, DOUBLE]);
  const corrected = play([...BEFORE, ['Main|1|4', { winningSide: 2 }], CARRIER, DOUBLE]);
  expect(direct.consolation[0]).toEqual(DOUBLE_WALKOVER);
  expect(corrected).toEqual(direct);
  expect(corrected.issues).toEqual([]);
});

it('census 20099689: the later results leave nobody waiting', () => {
  const result = play([
    ...BEFORE,
    ['Main|1|4', { winningSide: 2 }],
    CARRIER,
    DOUBLE,
    ['Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['Main|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  expect(result.issues).toEqual([]);
  expect(result.stalls).toEqual(0);
});

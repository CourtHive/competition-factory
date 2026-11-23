import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * TWO HELD EXITS FEEDING ONE MATCHUP MEET THERE — census 20068753 (FEED_IN_CHAMPIONSHIP 8/6, `doubleExitPropagateBye:
 * false`), forward play only.
 *
 * With the policy off, `Main|1|3`'s and `Main|1|2`'s double walkovers each produce a WALKOVER into the consolation,
 * carried past a first-round BYE into `Consolation|2|2` and `Consolation|2|1`, both BYE-held. Each is a held exit
 * (`settleHeldExits`), sent on once its target is settled; the target, `Consolation|3|1`, is fed by the two of them and
 * nothing else, so each waited on the other and neither moved. They meet there (RULE 4), and the double walkover
 * produces onward: the Main semifinal's loser, fed into the consolation final, is awarded it. They waited on nobody.
 */

const DRAW_ID = 'two-held-exits-meet';

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
    drawType: FEED_IN_CHAMPIONSHIP,
    propagateExitStatus: false,
    participantsCount: 6,
    seed: 20068753,
    drawSize: 8,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: at(key).matchUpId, drawId: DRAW_ID, outcome });
    expect(result.error).toBeUndefined();
  }
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
    semifinal: at('Consolation|3|1').matchUpStatus,
    final: at('Consolation|4|1'),
  };
}

const TWO_DOUBLE_WALKOVERS: [string, any][] = [
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }],
];

it('the two produced walkovers meet in the consolation semifinal', () => {
  const result = play(TWO_DOUBLE_WALKOVERS);
  expect(result.semifinal).toEqual(DOUBLE_WALKOVER);
  expect(result.issues).toEqual([]);
});

it('census 20068753: the Main semifinal loser is awarded the consolation final, and nobody waits', () => {
  const result = play([...TWO_DOUBLE_WALKOVERS, ['Main|3|1', { matchUpStatus: WALKOVER, winningSide: 1 }]]);
  const winner = result.final.sides?.find((side: any) => side.sideNumber === result.final.winningSide);
  expect(result.final.matchUpStatus).toEqual(WALKOVER);
  expect(winner?.participantId).toBeDefined();
  expect(result.issues).toEqual([]);
  expect(result.stalls).toEqual(0);
});

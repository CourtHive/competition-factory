import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * A LONE LOSER IN A PRODUCED WALKOVER DOES NOT EXCUSE THE WINNER'S PLAYED MATCH — census 20072949 (DOUBLE_ELIMINATION
 * 8/6, `doubleExitPropagateBye: false`).
 *
 * `Main|2|1` is a DEFAULTED: its winner plays on and loses `Main|3|1` (COMPLETED), its loser goes to `Backdraw|2|1`,
 * where — with the policy off — `Main|1|3`'s double walkover produced a WALKOVER, so they stand there alone, awarded it.
 * Flipping `Main|2|1`'s winner would take back a semifinal two participants played, and must be refused before anything
 * is written. `isActiveDownstream` excused a source whose loser stood alone in a walkover from the WHOLE activity test,
 * the winner's side included, so the flip went through: it unwound the semifinal and was then refused placing the old
 * winner, already in the Backdraw final, as the new loser — after mutating. A double default in the semifinal then
 * left `Backdraw|3|1` stalled. With the policy on, the loser target is a BYE and the same flip is refused up front.
 */

const DRAW_ID = 'lone-loser-walkover-does-not-excuse-the-winner';

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

const set = (key: string, outcome: any): any =>
  tournamentEngine.setMatchUpStatus({ matchUpId: at(key).matchUpId, drawId: DRAW_ID, outcome });

function prepare(doubleExitPropagateBye: boolean) {
  setSubscriptions({});
  const config = {
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: false,
    participantsCount: 6,
    seed: 20072949,
    drawSize: 8,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye } };
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  for (const [key, outcome] of [
    ['Main|1|2', { winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|3|1', { winningSide: 2 }],
  ] as [string, any][]) {
    expect(set(key, outcome).error).toBeUndefined();
  }
}

const snapshot = () => JSON.stringify(getDrawDefinition(DRAW_ID));

it.each([false, true])(
  'doubleExitPropagateBye %s: flipping a winner who has played on is refused before anything is written',
  (doubleExitPropagateBye) => {
    prepare(doubleExitPropagateBye);
    const before = snapshot();
    const result = set('Main|2|1', { winningSide: 2 });
    expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);
    expect(snapshot()).toEqual(before);
  },
);

it('census 20072949: the semifinal stands, and a later double default leaves nobody waiting', () => {
  prepare(false);
  set('Main|2|1', { winningSide: 2 });
  expect(set('Main|3|1', { matchUpStatus: DOUBLE_DEFAULT }).error).toBeUndefined();
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  expect(inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION)).toEqual([]);
  expect(inconsistencies.map((inconsistency: any) => inconsistency.issueType)).toEqual([]);
});

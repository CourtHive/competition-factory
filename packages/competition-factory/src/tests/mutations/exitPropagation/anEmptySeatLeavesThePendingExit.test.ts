import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * AN EMPTY SEAT ADVANCED PAST A BYE LEAVES THE PENDING EXIT — census 20092939 (DOUBLE_ELIMINATION 8/7,
 * `doubleExitPropagateBye: false`), forward play only.
 *
 * With the policy off, a double exit produces an exit over its loser link. `Main|1|4`'s double walkover makes
 * `Main|2|2` a produced WALKOVER with nobody to lose it, so `Backdraw|2|2` takes a BYE. `Main|1|2`'s double default
 * then carries a DEFAULTED past that BYE into `Backdraw|3|1`, pending, and `Backdraw|2|1` takes a BYE too, which
 * advances its still-empty seat into `Backdraw|3|1` beside the DEFAULTED. That advance wrote TO_BE_PLAYED over the
 * pending exit while provenance still recorded it (PROPAGATED_EXIT_LOST, ORIGIN_ON_UNDECIDED_MATCHUP). Whoever later
 * came through was never awarded it, and a double walkover in the Main semifinal left `Backdraw|3|1` stalled.
 */

const DRAW_ID = 'empty-seat-leaves-the-pending-exit';

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
    drawType: DOUBLE_ELIMINATION,
    propagateExitStatus: false,
    participantsCount: 7,
    seed: 20092939,
    drawSize: 8,
  };
  const policyDefinitions = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
  expect(prepareDraw(config, DRAW_ID, policyDefinitions)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({ matchUpId: at(key).matchUpId, drawId: DRAW_ID, outcome });
    expect(result.error).toBeUndefined();
  }
  const { matchUpStatus, winningSide } = at('Backdraw|3|1');
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
    backdrawSemifinal: { matchUpStatus, winningSide },
  };
}

const TWO_DOUBLE_EXITS: [string, any][] = [
  ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { matchUpStatus: DOUBLE_DEFAULT }],
];

it('the carried DEFAULTED stays pending beside the empty seat advanced past the second BYE', () => {
  const result = play(TWO_DOUBLE_EXITS);
  expect(result.backdrawSemifinal).toEqual({ matchUpStatus: DEFAULTED, winningSide: undefined });
  expect(result.issues).toEqual([]);
});

it('census 20092939: whoever comes through is awarded it, and nobody is left waiting', () => {
  const result = play([
    ...TWO_DOUBLE_EXITS,
    ['Main|1|3', { winningSide: 1 }],
    ['Main|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  expect(result.backdrawSemifinal).toEqual({ matchUpStatus: DEFAULTED, winningSide: 1 });
  expect(result.issues).toEqual([]);
  expect(result.stalls).toEqual(0);
});

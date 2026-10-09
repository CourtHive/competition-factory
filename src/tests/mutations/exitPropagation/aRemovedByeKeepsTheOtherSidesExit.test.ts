import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A REMOVED BYE KEEPS THE OTHER SIDE'S EXIT — census 20090234 (CURTIS_CONSOLATION 16/13).
 *
 * While `Main|1|6` is a double walkover, `Consolation 1|3|2` holds a BYE on dp 9, advanced alone, beside the produced
 * DEFAULTED of `Consolation 1|2|4`'s double default. Re-scoring `Main|1|6` as a played win takes that BYE back. By the
 * time `Consolation 1|3|2` is asked, its feeder has already lost dp 9, so no side could be read for the removed
 * position, and with no side every origin was cleared — the produced DEFAULTED on the other side with it. The
 * participant then arriving through the BYE chain was moved on unawarded (ADVANCED_FROM_UNDECIDED), and a later double
 * default in `Main|3|2` left `Consolation 1|3|2` waiting on nobody. The BYE's own arrival record names its side.
 */

const DRAW_ID = 'removed-bye-keeps-the-other-sides-exit';

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
    drawType: CURTIS_CONSOLATION,
    propagateExitStatus: true,
    participantsCount: 13,
    seed: 20090234,
    drawSize: 16,
  };
  expect(prepareDraw(config, DRAW_ID)).toEqual(true);
  for (const [key, outcome] of steps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: at(key).matchUpId,
      propagateExitStatus: true,
      drawId: DRAW_ID,
      outcome,
    });
    expect(result.error).toBeUndefined();
  }
  const { matchUpStatus, winningSide, drawPositions, matchUpStatusCodes } = at('Consolation 1|3|2');
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    consolation: { matchUpStatus, winningSide, drawPositions, matchUpStatusCodes },
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
  };
}

const LATER: [string, any][] = [
  ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|2', { winningSide: 2 }],
  ['Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|5', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|2|4', { matchUpStatus: RETIRED, winningSide: 1 }],
];

const CORRECTED: [string, any][] = [
  ['Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }],
  ...LATER,
  ['Main|1|6', { winningSide: 2 }],
];

it('re-scored from a double walkover, the produced DEFAULTED beside the BYE stays and is awarded', () => {
  const direct = play([['Main|1|6', { winningSide: 2 }], ...LATER]);
  const corrected = play(CORRECTED);
  expect(direct.consolation).toMatchObject({ matchUpStatus: DEFAULTED, winningSide: 1 });
  expect(corrected.consolation).toEqual(direct.consolation);
  expect(corrected.issues).toEqual([]);
});

it('census 20090234: a double default in Main|3|2 leaves nobody waiting', () => {
  const corrected = play([
    ...CORRECTED,
    ['Consolation 1|2|1', { winningSide: 2 }],
    ['Consolation 1|4|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|3|2', { matchUpStatus: DOUBLE_DEFAULT }],
  ]);
  expect(corrected.stalls).toEqual(0);
});

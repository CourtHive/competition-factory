import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * A LONE BYE IS NEVER ON THE EXIT'S SIDE — census 20209866 (FIRST_MATCH_LOSER_CONSOLATION 8/7, sixth at-scale run).
 *
 * `Consolation|2|1`'s double walkover produces a walkover into the consolation final, pending on its side 1. While
 * `Main|1|3` and `Main|1|4` are both double exits, the final's other seat (dp 5) is a BYE advanced alone through
 * `Consolation|1|2` and `Consolation|2|2`: the final HOLDS the BYE beside the pending exit. Re-scoring `Main|1|4` as a
 * played win takes that BYE back. By the time the final is asked which side the removed dp 5 occupied, its feeder has
 * already lost the position, the compacted array `[5]` cannot be placed in a fed structure, and the BYE's own arrival
 * record had not survived an earlier re-write — so no side could be read, and with no side every origin was cleared,
 * the produced walkover with it. The loser who then arrived through the BYE chain met an empty, undecided final, and
 * once the Main final was played nothing could ever fill its other side (STALLED_POSITION).
 *
 * An exit owns no position: a produced or carried exit is an empty side. So when a BYE held one position beside
 * exactly one exit-carrying side, the BYE was on the OTHER side — the record says so without an arrival entry.
 */

const DRAW_ID = 'a-lone-bye-is-never-on-the-exits-side';

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
    participantsCount: 7,
    seed: 20209866,
    drawSize: 8,
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
  const { matchUpStatus, winningSide, drawPositions } = at('Consolation|3|1');
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    final: { matchUpStatus, winningSide, drawPositions },
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
  };
}

const OPENING: [string, any][] = [
  ['Main|1|2', { winningSide: 1 }],
  ['Main|2|1', { winningSide: 2 }],
];

// `Main|1|4` is a double default, then a double walkover, then a played win: the BYE its double exit advanced into
// the consolation final is taken back while the produced walkover from `Consolation|2|1` still waits there
const CORRECTED: [string, any][] = [
  ...OPENING,
  ['Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Consolation|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', { winningSide: 2 }],
];

const DIRECT: [string, any][] = [
  ...OPENING,
  ['Consolation|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
  ['Main|1|4', { winningSide: 2 }],
];

it('the BYE taken back from beside the pending walkover leaves it standing, and the arriving loser is awarded', () => {
  const direct = play(DIRECT);
  const corrected = play(CORRECTED);
  expect(direct.final).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 2 });
  expect(corrected.final).toEqual(direct.final);
  expect(corrected.issues).toEqual([]);
});

it('census 20209866: the Main final played, nobody in the consolation final is waiting', () => {
  const corrected = play([...CORRECTED, ['Main|3|1', { winningSide: 2 }]]);
  expect(corrected.stalls).toEqual(0);
});

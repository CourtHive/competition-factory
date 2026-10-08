import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A WITHDRAWN BYE LEAVES THE EXIT STANDING BEHIND IT — census 20067292 (DOUBLE_ELIMINATION 8/7).
 *
 * `Backdraw|2|2` is a double walkover, so `Backdraw|3|1` holds its produced WALKOVER, waiting for whoever arrives
 * opposite. While `Backdraw|1|1` is a double walkover too, nobody can arrive: `Backdraw|2|1`'s fed BYE is advanced
 * into `Backdraw|3|1`, which becomes a BYE. Re-scoring `Backdraw|1|1` as a played win takes that BYE back. The matchUp
 * fell to TO_BE_PLAYED although the produced exit still stood in its provenance, so the winner arriving through
 * `Backdraw|2|1` was moved on as opposite a double exit, never awarded `Backdraw|3|1`, and its stale `WO` codes stayed.
 * Entered with `Backdraw|1|1` played first, the arrival is awarded the WALKOVER.
 *
 * A later double walkover in the Main final then left `Backdraw|3|1` waiting on nobody.
 */

const DRAW_ID = 'withdrawn-bye-leaves-the-standing-exit';

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
    propagateExitStatus: true,
    participantsCount: 7,
    seed: 20067292,
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
  const { matchUpStatus, winningSide, drawPositions, matchUpStatusCodes } = at('Backdraw|3|1');
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    backdrawSemifinal: { matchUpStatus, winningSide, drawPositions, matchUpStatusCodes },
    stalls: inconsistencies.filter((inconsistency: any) => inconsistency.issueType === STALLED_POSITION).length,
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
  };
}

const FIRST_ROUNDS: [string, any][] = [
  ['Main|1|3', { winningSide: 2 }],
  ['Main|1|2', { winningSide: 1 }],
  ['Main|1|4', { winningSide: 2 }],
  ['Main|2|2', { winningSide: 2 }],
];

it('re-scored from a double walkover, the arrival is awarded the produced exit the BYE stood over', () => {
  const direct = play([
    ...FIRST_ROUNDS,
    ['Backdraw|1|1', { winningSide: 2 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Backdraw|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  const corrected = play([
    ...FIRST_ROUNDS,
    ['Backdraw|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Backdraw|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Backdraw|1|1', { winningSide: 2 }],
  ]);
  expect(direct.backdrawSemifinal).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1 });
  expect(corrected).toEqual(direct);
  expect(corrected.issues).toEqual([]);
});

it('census 20067292: a double walkover in the Main final leaves nobody waiting', () => {
  const corrected = play([
    ...FIRST_ROUNDS,
    ['Backdraw|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Backdraw|1|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Backdraw|1|1', { winningSide: 2 }],
    ['Main|4|1', { matchUpStatus: DOUBLE_WALKOVER }],
  ]);
  expect(corrected.stalls).toEqual(0);
});

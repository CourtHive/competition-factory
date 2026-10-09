import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A SEAT HELD OPEN FOR AN ARRIVAL IS READ BEFORE THE RELEASE TAKES ANYTHING — census de 9301596 (DOUBLE_ELIMINATION
 * 16/13), frozen window, `allowChangePropagation` off.
 *
 * `Main|1|4`'s DEFAULTED sends its loser into the Backdraw carrying the exit; they come through BYEs and are awarded
 * `Backdraw|5|1` by the exit a convergence at `Backdraw|3|1` produced. Re-scoring `Main|1|4` as a played win by the same
 * winner withdraws the carry, and the loser's position is released from each later round. Whether `Backdraw|5|1` is an
 * award to their seat — to be taken back, the exit left standing — was asked as the pass went, after `Backdraw|4|2`,
 * the feeder that tells a lone position's side, had already lost them: the side read nothing, the award was kept, and
 * the participant stood in `Backdraw|5|1` out of a feeder that no longer held them (ADVANCED_FROM_UNDECIDED). Entered
 * played from the start, `Backdraw|5|1` waits, pending, for whoever arrives.
 */

const DRAW_ID = 'held-open-seat-read-before-the-release';

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
    participantsCount: 13,
    seed: 9301596,
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
  const { matchUpStatus, winningSide, drawPositions } = at('Backdraw|5|1');
  const inconsistencies = getDrawInconsistencies({ drawDefinition: getDrawDefinition(DRAW_ID) }).inconsistencies ?? [];
  return {
    issues: inconsistencies.map((inconsistency: any) => inconsistency.issueType),
    backdraw: { matchUpStatus, winningSide, drawPositions },
  };
}

const LATER: [string, any][] = [
  ['Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['Main|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|2|3', { matchUpStatus: DOUBLE_DEFAULT }],
  ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }],
];
const FIRST: [string, any][] = [
  ['Main|1|3', { winningSide: 2 }],
  ['Main|1|7', { winningSide: 1 }],
  ['Main|2|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
];

it('re-scored from a DEFAULTED to a played win, the award its loser held is taken back, as entered played', () => {
  const direct = play([...FIRST, ['Main|1|4', { winningSide: 1 }], ...LATER]);
  const corrected = play([
    ...FIRST,
    ['Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ...LATER,
    ['Main|1|4', { winningSide: 1 }],
  ]);
  expect(corrected).toEqual(direct);
  expect(corrected.issues).toEqual([]);
});

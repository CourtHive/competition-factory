import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { MATRIX_CELLS } from '@Tests/testHarness/exitPropagation/matrixCells';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * AN EXIT THAT MEETS A BYE LEAVES A BYE BEHIND, NOT AN EXIT LABEL.
 *
 * CA, 2026-10-02, confirming 2026-09-20 (*"a propagated exit encountering a BYE should be advanced. In
 * both cases the BYE remains a BYE."*): the settled holder reads BYE. `advanceByeAdvancedDrawPosition`
 * wrote EXIT over a matchUp whose advancing position was itself a BYE with nobody present, so 26 draws
 * of the exit-propagation suite ended with a matchUp labelled WALKOVER or DEFAULTED, a BYE on one side
 * and nobody on the other, the exit already carried onward. Nothing was stranded (no STALLED_POSITION);
 * the label was wrong. Measured by the v2 outcome pipeline's differential mode.
 *
 * Every double-exit cell of the two draw types that showed it is played forward as the exit matrix
 * plays them, and no matchUp may end in that shape.
 */
const CELLS = MATRIX_CELLS.filter(
  (cell) =>
    [FIRST_MATCH_LOSER_CONSOLATION, DOUBLE_ELIMINATION].includes(cell.drawType) &&
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(cell.exitStatus),
);

const exitBesideBye = (drawId: string) =>
  (tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [])
    .filter(
      (m: any) =>
        [WALKOVER, DEFAULTED].includes(m.matchUpStatus) &&
        m.winnerMatchUpId &&
        !m.collectionId &&
        m.sides?.some((side: any) => side.bye) &&
        !m.sides?.some((side: any) => side.participantId),
    )
    .map((m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition} ${m.matchUpStatus}`);

it.each(
  CELLS.map((cell) => [
    `${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus} propagate=${cell.propagateExitStatus}`,
    cell,
  ]),
)('%s: no matchUp ends as an exit beside a BYE with nobody in it', (_label, cell: any) => {
  setSubscriptions({});
  const drawId = `bye-${cell.seed}`;
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  expect(drawIds).toContain(drawId);
  const outcome = { matchUpStatus: cell.exitStatus };
  const target = nextPlayable(drawId);
  step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });
  playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId });
  expect(exitBesideBye(drawId)).toEqual([]);
});

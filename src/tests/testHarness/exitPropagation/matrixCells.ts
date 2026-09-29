import { setSubscriptions } from '@Global/state/globalState';
import { nextPlayable, playForward, step } from './driver';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * THE 600 EXIT-PROPAGATION MATRIX CELLS, composed once.
 *
 * `exitPropagationMatrix.test.ts` composes this grid inline, and every instrument that wants to
 * measure something ELSE over the same cells at the same seeds has to compose it identically or the
 * seeds stop corresponding and the two sets of numbers are about different draws. Two such
 * instruments now exist, so the composition lives here rather than being copied a third time.
 *
 * The matrix test's own copy is deliberately NOT changed to import this: it is the baseline every
 * census number in `Mentat/fixtures/exit-propagation-census/README.md` was taken against, and
 * re-pointing its generation at shared code is a change to the measurement itself. If the two ever
 * disagree, THIS file is the copy to fix — a seed that names a different draw than the matrix names
 * is the failure mode to watch for, and `label()` is what makes it checkable by eye.
 */
export const MATRIX_DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];
export const MATRIX_DRAW_SIZES = [8, 16];
export const MATRIX_REDUCTIONS = [0, 1, 3];
export const MATRIX_EXIT_STATUSES = [WALKOVER, DEFAULTED, RETIRED, DOUBLE_WALKOVER, DOUBLE_DEFAULT];

export type MatrixCell = {
  participantsCount: number;
  propagateExitStatus: boolean;
  exitStatus: string;
  drawSize: number;
  drawType: string;
  seed: number;
};

export const MATRIX_CELLS: MatrixCell[] = MATRIX_DRAW_TYPES.flatMap((drawType) =>
  MATRIX_DRAW_SIZES.flatMap((drawSize) =>
    MATRIX_REDUCTIONS.flatMap((reduction) =>
      MATRIX_EXIT_STATUSES.flatMap((exitStatus) =>
        [true, false].map((propagateExitStatus) => ({
          participantsCount: drawSize - reduction,
          propagateExitStatus,
          exitStatus,
          drawSize,
          drawType,
        })),
      ),
    ),
  ),
).map((cell, index) => ({ ...cell, seed: index + 1 }));

/** the cell's name, in the same form `exitPropagationMatrix` names its tests */
export const cellLabel = (cell: MatrixCell): string =>
  `matrix ${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus} propagate=${cell.propagateExitStatus}`;

/** the outcome the matrix injects for a cell's exit status */
export const cellExitOutcome = (exitStatus: string): any => {
  if ([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(exitStatus)) return { matchUpStatus: exitStatus };
  if (exitStatus === RETIRED) {
    return { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
  }
  return { matchUpStatus: exitStatus, winningSide: 1 };
};

/**
 * Generate the cell's draw and drive it to exhaustion on the matrix's own schedule — the exit on the
 * first playable matchUp, then `playForward`'s periodic schedule. `false` when the draw did not
 * generate, which a caller must not count as a played cell.
 *
 * `arm: 'control'` plays ordinary results only, so no exit ever enters the draw. A draw played to
 * exhaustion with no exit cannot have stranded anybody, which is what makes it a falsification arm
 * rather than a second sample.
 */
export function playMatrixCell(
  cell: MatrixCell,
  drawId: string,
  arm: 'exits' | 'control' = 'exits',
  policyDefinitions?: any,
): boolean {
  setSubscriptions({});
  const { drawIds } = mocksEngine.generateTournamentRecord({
    ...(policyDefinitions ? { policyDefinitions } : {}),
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  if (!drawIds?.includes(drawId)) return false;

  const outcome = cellExitOutcome(cell.exitStatus);
  if (arm === 'control') {
    playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: undefined, drawId });
    return true;
  }

  const target = nextPlayable(drawId);
  if (target?.matchUpId) {
    step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });
  }
  playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId });
  return true;
}

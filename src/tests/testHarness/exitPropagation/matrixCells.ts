import { checkIntegrity, type PropertyFailure } from './transitions';
import { setSubscriptions } from '@Global/state/globalState';
import { nextPlayable, playForward, step } from './driver';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  ROUND_ROBIN_WITH_PLAYOFF,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  SINGLE_ELIMINATION,
  CURTIS_CONSOLATION,
  ROUND_ROBIN,
  LUCKY_DRAW,
  COMPASS,
  FEED_IN,
  OLYMPIC,
  PLAYOFF,
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
  /** TEAM cells: the event type and tieFormat the draw is generated with */
  tieFormatName?: string;
  eventType?: string;
  /** TEAM cells: attach lineups before play, so the driver scores LINES as well as duals */
  lineUps?: boolean;
};

const composeCells = (drawTypes: string[]): Omit<MatrixCell, 'seed'>[] =>
  drawTypes.flatMap((drawType) =>
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
  );

export const MATRIX_CELLS: MatrixCell[] = composeCells(MATRIX_DRAW_TYPES).map((cell, index) => ({
  ...cell,
  seed: index + 1,
}));

/**
 * THE EXTENSION: the draw types the 600 never exercised, measured 2026-10-01 (assessment G1, G12).
 *
 * Every one of these passed every matrix property and the integrity check on first contact, and the
 * deep-correction oracle read 640 identical / 0 severe over them. So this arm adds no known defect;
 * it exists so that the container branch of `doubleExitAdvancement` (round robin returns at once),
 * the playoff a round-robin group's exit decides, the two FIC variants, and the lucky-draw placement
 * branches are EXECUTED by the gate rather than assumed.
 *
 * A SEPARATE SEED RANGE, deliberately. The 600 are the baseline every census number was taken
 * against; appending types to that list would have kept their seeds, but the deep oracle's seeds run
 * policy-outermost and would have shifted. Starting at 100001 keeps every existing cell's draw.
 *
 * `LUCKY_DRAW` at reduction 3 is EXCLUDED, not quarantined: a lucky draw three seats short generates
 * with only its BYE placed and no participant at all (`mocksEngine`, measured 8/5 and 16/13 at seed
 * 1), so there is nothing to play. That is a mocks limitation to record, not a propagation cell.
 */
export const MATRIX_EXTENSION_DRAW_TYPES = [
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  FEED_IN_CHAMPIONSHIP_TO_QF,
  FEED_IN_CHAMPIONSHIP_TO_R16,
  LUCKY_DRAW,
  FEED_IN,
  PLAYOFF,
];
export const MATRIX_EXTENSION_SEED_BASE = 100000;

export const isUnpopulatedLuckyDraw = (cell: { drawType: string; drawSize: number; participantsCount: number }) =>
  cell.drawType === LUCKY_DRAW && cell.drawSize - cell.participantsCount === 3;

/**
 * THE TEAM ARM (assessment G2). Four draw types as TEAM events with a DOMINANT_DUO tieFormat, in
 * two arms from their own seed ranges:
 *
 *  - DUAL-level: no lineups, so the driver sees only the duals and every exit — single or double —
 *    is entered on a dual. Measured 2026-10-01: 72 of 72 probe cells clean before this arm existed.
 *  - LINE-level: lineups attached, so the driver scores the LINES and the duals auto-complete; the
 *    periodic exit lands on a line or a dual, whichever is next. This is the arm that exercises
 *    `updateTieMatchUpScore` and the dual's auto-calc under exits — the surface the matrix never
 *    executed, where scoring a line of a double-walkover dual used to leave the double exit's
 *    produced walkover standing (#5054).
 */
export const TEAM_MATRIX_DRAW_TYPES = [SINGLE_ELIMINATION, DOUBLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION, COMPASS];
export const TEAM_DUAL_SEED_BASE = 200000;
export const TEAM_LINE_SEED_BASE = 300000;

const teamCell = (cell: Omit<MatrixCell, 'seed'>, lineUps: boolean): Omit<MatrixCell, 'seed'> => ({
  ...cell,
  tieFormatName: DOMINANT_DUO,
  eventType: TEAM,
  lineUps,
});

export const TEAM_DUAL_CELLS: MatrixCell[] = composeCells(TEAM_MATRIX_DRAW_TYPES).map((cell, index) => ({
  ...teamCell(cell, false),
  seed: TEAM_DUAL_SEED_BASE + index + 1,
}));

export const TEAM_LINE_CELLS: MatrixCell[] = composeCells(TEAM_MATRIX_DRAW_TYPES).map((cell, index) => ({
  ...teamCell(cell, true),
  seed: TEAM_LINE_SEED_BASE + index + 1,
}));

export const MATRIX_EXTENSION_CELLS: MatrixCell[] = composeCells(MATRIX_EXTENSION_DRAW_TYPES)
  .map((cell, index) => ({ ...cell, seed: MATRIX_EXTENSION_SEED_BASE + index + 1 }))
  .filter((cell) => !isUnpopulatedLuckyDraw(cell));

/** the cell's name, in the same form `exitPropagationMatrix` names its tests */
export const cellLabel = (cell: MatrixCell): string => {
  const arm = cell.eventType ? [cell.eventType, cell.lineUps ? '+lines' : '', ' '].join('') : '';
  return `matrix ${arm}${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus} propagate=${cell.propagateExitStatus}`;
};

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
/**
 * The matrix test's per-cell body, returning the failures rather than asserting: the exit on the
 * first playable matchUp, `playForward`, then `checkIntegrity`. `undefined` when the draw did not
 * generate or nothing was playable — a caller must not count either as a played cell.
 */
/**
 * Generate a cell's draw into engine state. TEAM cells carry their event type and tieFormat, and
 * `lineUps` attaches generated lineups so every dual's lines hold participants — without them the
 * driver sees only the duals, which is the dual-level arm; with them it scores lines too.
 */
function generateCell(cell: MatrixCell, drawId: string, policyDefinitions?: any): boolean {
  setSubscriptions({});
  const { drawIds } = mocksEngine.generateTournamentRecord({
    ...(policyDefinitions ? { policyDefinitions } : {}),
    drawProfiles: [
      {
        ...(cell.tieFormatName ? { tieFormatName: cell.tieFormatName } : {}),
        ...(cell.eventType ? { eventType: cell.eventType } : {}),
        participantsCount: cell.participantsCount,
        drawType: cell.drawType,
        drawSize: cell.drawSize,
        drawId,
      },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  if (!drawIds?.includes(drawId)) return false;
  if (cell.lineUps) {
    const result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId });
    if (!result?.success) return false;
  }
  return true;
}

export function runMatrixCell(cell: MatrixCell, drawId: string): PropertyFailure[] | undefined {
  if (!generateCell(cell, drawId)) return undefined;

  const target = nextPlayable(drawId);
  if (!target?.matchUpId) return undefined;

  const outcome = cellExitOutcome(cell.exitStatus);
  const failures = [
    ...step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome }),
  ];
  if (!failures.length) {
    failures.push(
      ...playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId }).failures,
    );
  }
  if (!failures.length) failures.push(...checkIntegrity(drawId, target.matchUpId));
  return failures;
}

export function playMatrixCell(
  cell: MatrixCell,
  drawId: string,
  arm: 'exits' | 'control' = 'exits',
  policyDefinitions?: any,
): boolean {
  if (!generateCell(cell, drawId, policyDefinitions)) return false;

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

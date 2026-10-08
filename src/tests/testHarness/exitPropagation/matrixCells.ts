import { checkIntegrity, type PropertyFailure } from './transitions';
import { setSubscriptions } from '@Global/state/globalState';
import { nextPlayable, playForward, step } from './driver';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { DOUBLE_WALKOVER, DOUBLE_DEFAULT, DEFAULTED, WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { COLLEGE_DEFAULT, DOMINANT_DUO, LAVER_CUP } from '@Constants/tieFormatConstants';
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

/** which rubber of a dual its eventual loser wins: the first (before the dual is decided) or the third (a dead rubber) */
export type UnevenDuals = 'early' | 'late';

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
  /** TEAM line cells: the losing side of every dual takes one rubber (see `unevenDualWinningSide`) */
  unevenDuals?: UnevenDuals;
};

const composeCells = (drawTypes: string[], drawSizes: number[] = MATRIX_DRAW_SIZES): Omit<MatrixCell, 'seed'>[] =>
  drawTypes.flatMap((drawType) =>
    drawSizes.flatMap((drawSize) =>
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

const teamCell = (
  cell: Omit<MatrixCell, 'seed'>,
  lineUps: boolean,
  tieFormatName: string = DOMINANT_DUO,
): Omit<MatrixCell, 'seed'> => ({
  ...cell,
  tieFormatName,
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

/**
 * THE TEAM ARM, EXTENDED — 2026-10-05, the unowned-threads prompt § 4.
 *
 *  - **The seven extension draw types** as TEAM events (DOMINANT_DUO), dual and line level, from
 *    seed bases of their own so no existing cell moves. Measured on first contact: 800 of 800 clean,
 *    and a control over 130 of them confirmed every cell entered its exit (on the dual in the dual
 *    arm, on a line in the line arm), so the zero is not an exit that never landed.
 *  - **Two more tieFormats** on the four TEAM draw types, drawSize 8 only (a LAVER_CUP 16-draw takes
 *    ~10 s a cell). COLLEGE_DEFAULT is the one whose doubles rubbers share a single point
 *    (`collectionValue`), so a decided rubber can leave the dual at 0-0: its line arm found the
 *    walkover rubber that did not start its dual (`aWalkoverRubberStartsTheDual.test.ts`). LAVER_CUP
 *    scores by set value across many rubbers.
 */
export const TEAM_EXTENSION_DUAL_SEED_BASE = 400000;
export const TEAM_EXTENSION_LINE_SEED_BASE = 450000;
export const TEAM_FORMAT_SEED_BASE = 500000;
export const TEAM_FORMATS = [COLLEGE_DEFAULT, LAVER_CUP];

const teamExtension = (lineUps: boolean, seedBase: number): MatrixCell[] =>
  composeCells(MATRIX_EXTENSION_DRAW_TYPES)
    .map((cell, index) => ({ ...teamCell(cell, lineUps), seed: seedBase + index + 1 }))
    .filter((cell) => !isUnpopulatedLuckyDraw(cell));

export const TEAM_EXTENSION_DUAL_CELLS: MatrixCell[] = teamExtension(false, TEAM_EXTENSION_DUAL_SEED_BASE);
export const TEAM_EXTENSION_LINE_CELLS: MatrixCell[] = teamExtension(true, TEAM_EXTENSION_LINE_SEED_BASE);

export const TEAM_FORMAT_CELLS: MatrixCell[] = TEAM_FORMATS.flatMap((tieFormatName) =>
  [false, true].flatMap((lineUps) =>
    composeCells(TEAM_MATRIX_DRAW_TYPES, [8]).map((cell) => teamCell(cell, lineUps, tieFormatName)),
  ),
).map((cell, index) => ({ ...cell, seed: TEAM_FORMAT_SEED_BASE + index + 1 }));

/**
 * THE TEAM ARM, UNEVEN DUALS — 2026-10-08.
 *
 * Every other TEAM cell scores side 1 on every line, so a dual's loser never wins a rubber. That hid a
 * defect class: a TEAM matchUp's tieMatchUps carry its drawPositions in context, so a rubber the loser won
 * read as a prior win and withheld a FIRST_MATCH_LOSER_CONSOLATION feed — or, won after the dual was
 * decided, made `getDrawInconsistencies` report a correct feed as INELIGIBLE_PROGRESSION (#5291(factory)).
 *
 * The four TEAM draw types, line level, DOMINANT_DUO (three rubbers, two win), drawSize 8, in two modes: the
 * loser takes the dual's FIRST rubber (2-1, won before the dual is decided) or its THIRD (2-0 then a dead
 * rubber). From a seed base of its own, so no existing cell moves.
 */
export const TEAM_UNEVEN_SEED_BASE = 550000;
export const UNEVEN_DUAL_MODES: UnevenDuals[] = ['early', 'late'];

/**
 * The exit schedule of an uneven-dual cell. The matrix's default places an exit on every third step, and a
 * DOMINANT_DUO dual is three rubbers scored back to back, so the third rubber of every dual was ALWAYS the exit
 * and the late mode never scored it (measured: every dual 3-0). Four is coprime with three, so the exit
 * drifts across rubber positions and both modes are played.
 */
export const UNEVEN_DUAL_EXIT_PERIOD = 4;

export const TEAM_UNEVEN_CELLS: MatrixCell[] = UNEVEN_DUAL_MODES.flatMap((unevenDuals) =>
  composeCells(TEAM_MATRIX_DRAW_TYPES, [8]).map((cell) => ({ ...teamCell(cell, true), unevenDuals })),
).map((cell, index) => ({ ...cell, seed: TEAM_UNEVEN_SEED_BASE + index + 1 }));

/**
 * The winner of each scored step for an uneven-dual cell: side 2 takes the rubber at the mode's index within
 * its dual, side 1 everything else, so side 1 still wins every dual. A dual itself, or a non-TEAM matchUp,
 * goes to side 1 as before. Rubbers are counted in the order the driver scores them.
 */
export function unevenDualWinningSide(mode: UnevenDuals): (matchUp: any) => number {
  const losersRubber = mode === 'early' ? 0 : 2;
  const scored: Record<string, number> = {};
  return (matchUp) => {
    if (!matchUp.matchUpTieId) return 1;
    const index = scored[matchUp.matchUpTieId] ?? 0;
    scored[matchUp.matchUpTieId] = index + 1;
    return index === losersRubber ? 2 : 1;
  };
}

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

/**
 * The driver's runaway guard, sized to the draw. A flat 200 sat above every singles draw in the
 * matrix, but a nine-rubber TEAM draw holds more playable matchUps than that (DOUBLE_ELIMINATION 16
 * in COLLEGE_DEFAULT: 30 duals and 270 rubbers), so the guard reported DRIVER_DID_NOT_CONVERGE on a
 * draw that was still making progress. Measured 2026-10-05: 119 of 960 exploratory TEAM cells.
 */
const stepGuard = (drawId: string): number =>
  Math.max(200, 2 * (tournamentEngine.allDrawMatchUps({ drawId }).matchUps?.length ?? 0));

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
      ...playForward({
        propagateExitStatus: cell.propagateExitStatus,
        winningSideFor: cell.unevenDuals ? unevenDualWinningSide(cell.unevenDuals) : undefined,
        exitPeriod: cell.unevenDuals ? UNEVEN_DUAL_EXIT_PERIOD : undefined,
        maxSteps: stepGuard(drawId),
        exitOutcome: outcome,
        drawId,
      }).failures,
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

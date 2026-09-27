import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { nextPlayable, playForward, step } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';
import fs from 'fs';

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
 * ADJUDICATION INSTRUMENT for `STALLED_POSITION`. INERT unless `STALLED_ADJUDICATION=1`.
 *
 *   STALLED_ADJUDICATION=1 ARM=control TZ=UTC OUT=/tmp/stalled-control.jsonl \
 *     npx vitest run src/tests/query/stalledPositionAdjudication.test.ts
 *
 * `ARM=control` replays every matrix cell with **no exit outcome at all** — ordinary
 * `winningSide: 1` results only, same draw, same seed. `ARM=exits` replays the matrix as the matrix
 * itself drives it.
 *
 * ## The question it answers, and why this A/B is the right one
 *
 * The open question is whether the 89 `exitPropagationMatrix` findings are genuine stalls or a
 * false-positive class. The decisive discriminator is cheap: **a draw played to completion with no
 * exits cannot have stranded anybody.** Every seat is filled by a winner, every matchUp is decided.
 * So a cell that reports `STALLED_POSITION` in the `control` arm is a false positive BY
 * CONSTRUCTION — there is no defect available for it to have detected.
 *
 * Cells that fire only in the `exits` arm are the ones that need reading by hand.
 *
 * Controls, so a zero here is worth something: `cellsPlayed` and `terminalCells` are both written to
 * the summary. A run that generates nothing, or that never reaches a terminal state, also reports
 * zero findings and must not be mistaken for a clean result.
 */

const enabled = process.env.STALLED_ADJUDICATION === '1';
const arm = process.env.ARM ?? 'control';
const outPath = process.env.OUT ?? '/tmp/stalledPositionAdjudication.jsonl';
const STALLED_POSITION = 'STALLED_POSITION';

const DRAW_TYPES = [
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
const DRAW_SIZES = [8, 16];
const REDUCTIONS = [0, 1, 3];
const EXIT_STATUSES = [WALKOVER, DEFAULTED, RETIRED, DOUBLE_WALKOVER, DOUBLE_DEFAULT];

const exitOutcome = (exitStatus: string) => {
  if ([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(exitStatus)) return { matchUpStatus: exitStatus };
  if (exitStatus === RETIRED) {
    return { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };
  }
  return { matchUpStatus: exitStatus, winningSide: 1 };
};

// composed exactly as exitPropagationMatrix.test.ts composes it, so seeds and labels correspond
const MATRIX = DRAW_TYPES.flatMap((drawType) =>
  DRAW_SIZES.flatMap((drawSize) =>
    REDUCTIONS.flatMap((reduction) =>
      EXIT_STATUSES.flatMap((exitStatus) =>
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

const label = (cell: (typeof MATRIX)[number]) =>
  `matrix ${cell.drawType} ${cell.drawSize}/${cell.participantsCount} ${cell.exitStatus} propagate=${cell.propagateExitStatus}`;

test.skipIf(!enabled)(
  'stalled-position adjudication scan',
  () => {
    fs.writeFileSync(outPath, '');
    let cellsPlayed = 0;
    let terminalCells = 0;
    let findings = 0;
    const byDrawType: Record<string, number> = {};

    for (const cell of MATRIX) {
      setSubscriptions({});
      const key = label(cell);
      const drawId = `adjudicate-${arm}-${key.replace(/[^\w]+/g, '-')}`;
      const { drawIds } = mocksEngine.generateTournamentRecord({
        drawProfiles: [
          { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
        ],
        nonRandom: cell.seed,
        setState: true,
      });
      if (!drawIds?.includes(drawId)) continue;
      cellsPlayed += 1;

      const outcome = exitOutcome(cell.exitStatus);
      if (arm === 'exits') {
        const target = nextPlayable(drawId);
        if (target?.matchUpId) {
          step({ propagateExitStatus: cell.propagateExitStatus, matchUpId: target.matchUpId, drawId, outcome });
        }
        playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: outcome, drawId });
      } else {
        // CONTROL — ordinary results only. `exitOutcome: undefined` makes the driver score every
        // step `{ winningSide: 1 }`, so no exit ever enters the draw.
        playForward({ propagateExitStatus: cell.propagateExitStatus, exitOutcome: undefined, drawId });
      }

      const drawDefinition = getDrawDefinition(drawId);
      const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
      const stalled = (integrity?.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);

      // CONTROL on the terminal condition itself: the detector only speaks when nothing is
      // playable, so a cell that is not terminal is a cell the detector was silent about for a
      // reason unrelated to the draw being sound.
      const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
      const playable = matchUps.filter(
        (m: any) =>
          !m.winningSide &&
          (!m.matchUpStatus || m.matchUpStatus === 'TO_BE_PLAYED') &&
          (m.sides ?? []).filter((s: any) => s?.participantId && !s?.bye).length === 2,
      );
      if (!playable.length) terminalCells += 1;

      if (!stalled.length) continue;
      findings += stalled.length;
      byDrawType[cell.drawType] = (byDrawType[cell.drawType] ?? 0) + stalled.length;

      for (const inconsistency of stalled) {
        const matchUp: any = matchUps.find((m: any) => m.matchUpId === inconsistency.matchUpId);
        const structure = drawDefinition.structures?.find((s: any) => s.structureId === matchUp?.structureId);
        const occupied = (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);
        const vacant = (matchUp?.drawPositions ?? []).filter(
          (dp: number) => !occupied.some((s: any) => s.drawPosition === dp),
        );
        fs.appendFileSync(
          outPath,
          JSON.stringify({
            arm,
            key,
            seed: cell.seed,
            drawType: cell.drawType,
            drawSize: cell.drawSize,
            participantsCount: cell.participantsCount,
            exitStatus: cell.exitStatus,
            propagateExitStatus: cell.propagateExitStatus,
            structureName: structure?.structureName,
            stage: matchUp?.stage,
            stageSequence: matchUp?.stageSequence,
            roundNumber: matchUp?.roundNumber,
            roundPosition: matchUp?.roundPosition,
            matchUpStatus: matchUp?.matchUpStatus,
            drawPositions: matchUp?.drawPositions,
            occupiedDrawPositions: occupied.map((s: any) => s.drawPosition),
            vacantDrawPositions: vacant,
            playableRemaining: playable.length,
          }) + '\n',
        );
      }
    }

    process.stdout.write(
      `\nARM=${arm} cellsPlayed=${cellsPlayed} terminalCells=${terminalCells} findings=${findings}\n` +
        `byDrawType=${JSON.stringify(byDrawType)}\n`,
    );

    // controls, asserted rather than printed — a scan over nothing also reports zero findings
    expect(cellsPlayed).toBeGreaterThan(0);
    expect(terminalCells).toBeGreaterThan(0);
  },
  600_000,
);

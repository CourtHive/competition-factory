import { TEAM_UNEVEN_CELLS, runMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { isUnscoredOutcome } from '@Query/matchUp/getDrawPositionWinCount';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and types
import type { UnevenDuals } from '@Tests/testHarness/exitPropagation/matrixCells';
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  SINGLE_ELIMINATION,
  CONSOLATION,
  MAIN,
} from '@Constants/drawDefinitionConstants';

/**
 * THE TEAM ARM, UNEVEN DUALS: the four TEAM draw types at drawSize 8, line level, where every dual's loser
 * takes one rubber — its first (before the dual is decided) or its third (a dead rubber).
 *
 * Composed in `matrixCells.ts` (§ THE TEAM ARM, UNEVEN DUALS), from a seed base of its own. Same per-cell body
 * as `teamMatrix.test.ts` (`runMatrixCell`): the exit on the first playable matchUp, the matrix's periodic
 * schedule, every property per step, then the integrity check.
 *
 * INERT unless `TEAM_ARMS=1`: `pnpm verify:team-arms`, a `slow-gates` job in CI. The composition control and
 * the mode control below run on every `pnpm test`.
 */

const enabled = process.env.TEAM_ARMS === '1';

/**
 * A FIRST_MATCH_LOSER_CONSOLATION feed oracle of this arm's own. `checkIntegrity` cannot see a withheld feed: it shares
 * `getDrawPositionWinCount` with the engine, so it agrees with whatever that predicate decides. Measured with
 * #5291(factory) reverted: every late-mode cell failed integrity (a correct feed reported as ineligible), and every
 * early-mode cell passed, although the feed it withheld was the defect. This counts prior wins from TEAM-level duals
 * only, so a regression in the predicate's tieMatchUp scoping shows here even where integrity agrees with it.
 *
 * For every round 2 dual decided by a score, its loser is in the consolation exactly when it holds no prior win.
 */
function firstMatchFeedFailures(drawId: string): string[] {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  if (drawDefinition.drawType !== FIRST_MATCH_LOSER_CONSOLATION) return [];

  const consolation = drawDefinition.structures.find(({ stage }) => stage === CONSOLATION);
  const consolationParticipantIds = new Set(
    (consolation?.positionAssignments ?? []).map(({ participantId }) => participantId).filter(Boolean),
  );
  const duals = tournamentEngine
    .allDrawMatchUps({ drawId, inContext: true })
    .matchUps.filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP && matchUp.stage === MAIN);
  const priorWins = (drawPosition: number, roundNumber: number) =>
    duals.filter(
      (dual) =>
        (dual.roundNumber ?? 0) < roundNumber &&
        !!dual.winningSide &&
        !isUnscoredOutcome({ matchUpStatus: dual.matchUpStatus, score: dual.score }) &&
        dual.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber === dual.winningSide,
    ).length;

  return duals
    .filter((dual) => dual.roundNumber === 2 && dual.matchUpStatus === COMPLETED)
    .flatMap((dual) => {
      const loser = dual.sides?.find((side) => side.sideNumber !== dual.winningSide);
      if (!loser?.participantId || !loser.drawPosition) return [];
      const wins = priorWins(loser.drawPosition, 2);
      const fed = consolationParticipantIds.has(loser.participantId);
      return fed === (wins === 0)
        ? []
        : [`${dual.matchUpId.slice(0, 8)}: loser ${fed ? 'fed' : 'withheld'} with ${wins} prior dual wins`];
    });
}

// CONTROL: the composition covers what it says
test('composes 240 cells, each with its own seed', () => {
  expect(TEAM_UNEVEN_CELLS).toHaveLength(240);
  expect(new Set(TEAM_UNEVEN_CELLS.map((cell) => cell.seed)).size).toEqual(240);
  expect(TEAM_UNEVEN_CELLS.filter((cell) => cell.unevenDuals === 'early')).toHaveLength(120);
  expect(TEAM_UNEVEN_CELLS.every((cell) => cell.lineUps && cell.drawSize === 8)).toEqual(true);
});

// CONTROL: the mode is played, not merely declared — a dual's loser holds a rubber win
test.for(['early', 'late'] as UnevenDuals[])('in %s mode a decided dual is won 2-1', (mode) => {
  const cell = TEAM_UNEVEN_CELLS.find(
    (candidate) =>
      candidate.unevenDuals === mode &&
      candidate.drawType === SINGLE_ELIMINATION &&
      candidate.participantsCount === 8 &&
      candidate.exitStatus === WALKOVER &&
      candidate.propagateExitStatus,
  );
  expect(cell).toBeDefined();
  if (!cell) return;

  const failures = runMatrixCell(cell, `team-${cell.seed}`);
  expect(failures).toEqual([]);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const scores = matchUps
    .filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP && matchUp.matchUpStatus === COMPLETED)
    .map((matchUp) => matchUp.score?.scoreStringSide1);
  expect(scores).toContain('2-1');
});

test.skipIf(!enabled).for(TEAM_UNEVEN_CELLS)(
  'team uneven=$unevenDuals $drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus',
  { timeout: 180_000 },
  (cell) => {
    const failures = runMatrixCell(cell, `team-${cell.seed}`);
    expect(failures, 'nothing playable').toBeDefined();
    const report = (failures ?? []).map((f) => `${f.property} @ ${f.matchUpId.slice(0, 8)}\n  ${f.detail}`).join('\n');
    expect(report).toEqual('');
    expect(firstMatchFeedFailures(`team-${cell.seed}`)).toEqual([]);
  },
);

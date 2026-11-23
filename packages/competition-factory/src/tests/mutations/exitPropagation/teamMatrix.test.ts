import {
  TEAM_MATRIX_DRAW_TYPES,
  TEAM_DUAL_CELLS,
  TEAM_LINE_CELLS,
} from '@Tests/testHarness/exitPropagation/matrixCells';
import { unusedQuarantineKeys } from '@Tests/testHarness/exitPropagation/knownFailures';
import { teamLabel } from '@Tests/testHarness/exitPropagation/teamMatrixSlice';
import { expect, test } from 'vitest';

/**
 * THE TEAM ARM OF THE EXIT-PROPAGATION MATRIX — assessment gap G2, *"the largest untested surface
 * with real users behind it"*.
 *
 * Four draw types as TEAM events with a DOMINANT_DUO tieFormat, the matrix's sizes, reductions, exit
 * statuses and propagation flags, in two arms:
 *
 *  - **dual** — no lineups. The driver sees only the duals, so every exit is entered on a dual: a
 *    whole-dual walkover, default, retirement, or double exit.
 *  - **line** — lineups attached. The driver scores the LINES; the duals auto-complete through
 *    `updateTieMatchUpScore`; the periodic exit lands on a line or a dual, whichever is next.
 *
 * ## What the line arm found on first contact — 2026-10-01
 *
 * The dual arm was clean (240/240). The line arm was not, and every one of its findings was a defect
 * in code no oracle had executed:
 *
 *  1. `getProjectedDualWinningSide` read a bare `{ winningSide }` line as a CLEAR, so the dual
 *     completed with a winner that was never advanced — WINNER_NOT_ADVANCED on 240 of 240.
 *  2. `propagateLineUp` placed the advancing team's lineUp by roundPosition arithmetic; on a feed
 *     round that is the FED side, so the fed BYE arrived holding the team's lineUp and every line
 *     hydrated with one player on both sides — BYE_WON, FIRST_MATCH_LOSER_CONSOLATION, 56 of 60.
 *  3. `directLoser` propagated a withheld FMLC loser's lineUp onto the seat that had just received
 *     a BYE instead of them — the same shape from the loser link, 42 of 60.
 *
 * Each is pinned by name in `teamLineUpPlacement.test.ts`; the matrix is the gate that keeps the
 * surface executed.
 *
 * ## Split across eight files — 2026-10-05
 *
 * vitest shards by FILE, and as one file the matrix (~578s) pinned a CI coverage shard to 12-20 minutes
 * while the others took 6-9. The cells now run from `teamMatrix.<arm>.<drawType>.test.ts`, one per arm
 * and draw type, through `runTeamMatrixSlice`. This file keeps the composition control and the one
 * check no slice can make alone: that every `team matrix` quarantine key names a real cell. `#5054` (a line of a double-walkover dual) was found the same way by hand the
 * day before and is pinned in `tieScoreUnwindsDualDoubleExit.test.ts`.
 */

// CONTROL: the composition covers what it says
test('the TEAM arm composes 240 dual-level and 240 line-level cells over four draw types', () => {
  expect(TEAM_MATRIX_DRAW_TYPES).toHaveLength(4);
  expect(TEAM_DUAL_CELLS).toHaveLength(240);
  expect(TEAM_LINE_CELLS).toHaveLength(240);
  expect(TEAM_DUAL_CELLS.every((cell) => cell.eventType === 'TEAM' && !cell.lineUps)).toEqual(true);
  expect(TEAM_LINE_CELLS.every((cell) => cell.eventType === 'TEAM' && cell.lineUps)).toEqual(true);
  const seeds = new Set([...TEAM_DUAL_CELLS, ...TEAM_LINE_CELLS].map((cell) => cell.seed));
  expect(seeds.size).toEqual(480);
});

// No quarantine entry may name a cell that no slice runs: each slice checks only its own keys, so a
// stale key outside every slice would otherwise go unreported.
test('every team matrix quarantine key names a real cell', () => {
  const allKeys = new Set([...TEAM_DUAL_CELLS, ...TEAM_LINE_CELLS].map(teamLabel));
  expect(unusedQuarantineKeys(allKeys, 'team matrix ')).toEqual([]);
});

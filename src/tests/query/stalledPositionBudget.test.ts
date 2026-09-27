import { MATRIX_CELLS, cellLabel, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

/**
 * THE STALL BUDGET — a ratchet, not a pass/fail.
 *
 * `STALLED_POSITION` reports a participant facing a seat nobody can ever occupy. It ships as a
 * `warning` so `valid` stays true and the rule can be merged (see `hasErrorSeverity`), which removes
 * the pressure that kept it parked on a branch — and removes, with it, anything that would notice the
 * population growing. This is that guard.
 *
 * **The numbers below may only ever be LOWERED.** Raising one to make a run pass converts a
 * regression into a recorded fact, which is the failure this file exists to prevent. When the budget
 * reaches zero, promote the rule from `warning` to `error` and delete this file: at that point the
 * ordinary `valid` assertions in the suite are the guard, which is strictly better than a budget.
 *
 * ## Why it is INERT by default
 *
 * It replays all 600 matrix cells, which costs roughly as much as `exitPropagationMatrix` itself. On
 * every developer's `pnpm test` that is a tax paid to re-measure something that changes only when the
 * cascade changes. So it is gated on `STALL_BUDGET=1` and wired into `pnpm verify` and `verify.yml` in
 * the same change that adds it — a gate nobody runs is worse than no gate, and this repo has already
 * paid for that lesson twice (two repos' database specs that never executed while making the repo
 * look covered).
 *
 * ## Why all 600 cells and not just the double exits
 *
 * Because that shortcut was measured and it was wrong. Stalls were believed to be a double-exit-only
 * phenomenon — the 70 cells the NARROW rule reported are 35 `DOUBLE_WALKOVER` + 35 `DOUBLE_DEFAULT`,
 * with 0 of the 360 single-exit cells. Under the status-blind rule the population is 93 cells, and
 * **two of them are single-exit** (one `WALKOVER`, one `DEFAULTED`). Scoping the ratchet to double
 * exits would have left those two unguarded and the reasoning for it would have read as sound.
 */
const enabled = process.env.STALL_BUDGET === '1';

/**
 * MEASURED 2026-09-27 on `feat/stalled-position-severity`, which carries `dev` at `242050df5`
 * (i.e. including #4988). Both numbers are ceilings.
 *
 *   cells    93 of 600   a cell is one (drawType, size, participants, exitStatus, propagate) scenario
 *   findings 180         one stall per stranded participant; a cell can strand more than one
 *
 * History, so the direction is legible: the NARROW rule reported 70 cells / 143 findings on the same
 * tree, and the difference was never fewer stalls — it was 23 cells the `TO_BE_PLAYED` gate could not
 * see (`WALKOVER` 18, `DEFAULTED` 17, `DOUBLE_WALKOVER` 1, `DOUBLE_DEFAULT` 1).
 */
const BUDGET_CELLS = 93;
const BUDGET_FINDINGS = 180;

const occupantsOf = (matchUp: any) => (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);
const playableShape = (m: any) => !m.winningSide && (!m.matchUpStatus || m.matchUpStatus === 'TO_BE_PLAYED');

test.skipIf(!enabled)(
  'the stalled-position population is within budget, and the budget only ever falls',
  () => {
    let cellsPlayed = 0;
    let terminalCells = 0;
    let findings = 0;
    const cellsWithStall: string[] = [];

    for (const cell of MATRIX_CELLS) {
      const key = cellLabel(cell);
      const drawId = `budget-${cell.seed}`;
      if (!playMatrixCell(cell, drawId)) continue;
      cellsPlayed += 1;

      const drawDefinition = getDrawDefinition(drawId);
      const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
      const stalls = (integrity?.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);

      const { matchUps } = tournamentEngine.allDrawMatchUps({ inContext: true, drawId });
      const playable = (matchUps as any[]).filter(
        (m) => !m.collectionId && playableShape(m) && occupantsOf(m).length === 2,
      );
      if (!playable.length) terminalCells += 1;

      if (!stalls.length) continue;
      findings += stalls.length;
      cellsWithStall.push(key);

      // the rule is advisory by design — a stall must never assert the draw is invalid
      expect(
        stalls.every((i: any) => i.severity === 'warning'),
        key,
      ).toEqual(true);
    }

    process.stdout.write(
      `\nstall budget: cells=${cellsWithStall.length}/${BUDGET_CELLS} findings=${findings}/${BUDGET_FINDINGS} ` +
        `(cellsPlayed=${cellsPlayed} terminalCells=${terminalCells})\n`,
    );

    // CONTROLS first: a scan that generated nothing, or never reached a terminal state, also reports
    // zero stalls and would satisfy every ceiling below.
    expect(cellsPlayed).toEqual(MATRIX_CELLS.length);
    expect(terminalCells).toEqual(MATRIX_CELLS.length);

    // THE RATCHET. Lower these when the population shrinks; never raise them.
    expect(cellsWithStall.length, `cells with a stall (was ${BUDGET_CELLS})`).toBeLessThanOrEqual(BUDGET_CELLS);
    expect(findings, `total stalls (was ${BUDGET_FINDINGS})`).toBeLessThanOrEqual(BUDGET_FINDINGS);

    // AND IT MUST STILL BITE. A budget with no population left is a gate asserting nothing, so it
    // fails loudly and tells the next reader to promote the rule to `error` rather than sit at zero.
    expect(
      cellsWithStall.length,
      'the stall population reached ZERO — promote STALLED_POSITION to severity error and delete this budget',
    ).toBeGreaterThan(0);
  },
  1_800_000,
);

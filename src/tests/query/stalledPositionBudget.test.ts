import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';
import {
  MATRIX_EXTENSION_CELLS,
  MATRIX_CELLS,
  playMatrixCell,
  cellLabel,
} from '@Tests/testHarness/exitPropagation/matrixCells';

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
 *
 * **LOWERED 2026-09-27: 93 -> 89 cells, 180 -> 176 findings.** `propagateUnfillableLoserBye`
 * (punch-list **P39**) resolves a first-round seat as a BYE when the matchUp feeding it produced an
 * exit and can never produce a loser, so four cells no longer strand anybody. The same change closed
 * the last stranded participant in CA's original COMPASS report and moved eight `correctionDivergence`
 * cells from `severe` to `identical`, while all four census arms — both frozen windows, both
 * `allowChangePropagation` settings, 2,400 scenarios — reported IDENTICAL failing seeds and issue
 * breakdowns before and after.
 *
 * **LOWERED 2026-09-29: 89 -> 68 cells, 176 -> 141 findings.** None of the 35 was a stranded
 * participant. Each was somebody who had ADVANCED out of a pending exit without the exit being
 * awarded: resolving it was gated on a condition about notices that is never true of a fed seat
 * (`drawPositionPlacement`, *"THE AWARD IS NOT A NOTICE"*). They were every stall in the matrix
 * carrying a single exit status.
 *
 * **What is left is ONE family, and it needs a ruling rather than a fix.** All 141 are
 * `TO_BE_PLAYED` but two, and they trace to a BYE matchUp whose other seat will never be filled:
 *
 *   61  the vacant seat's feeder is a BYE holding no participant — it can produce nobody
 *   44  the feeder is itself one of these stalls, one round up
 *   12  no feeder inside the draw can be identified at all (DOUBLE_ELIMINATION `Main|4|1`)
 *   24  assorted: a decided exit with no occupant, a Decider whose final was a walkover
 *
 * The first group is CA's rule of 2026-09-27 — *"if two BYEs encounter each other then a BYE is
 * produced for the next matchUp"* — which is `doubleExitPropagateBye`, punch-list **P30**, measured
 * unshippable as a default on the same day for 13 `BYE_WON` violations.
 *
 * **LOWERED 2026-09-29: 68 -> 4 cells, 141 -> 4 findings.** `doubleExitPropagateBye` is ON by default
 * (CA: *"two BYEs meeting always produces a BYE"*). The family this file described above as needing
 * a ruling got one, and 137 of its 141 findings were seats that are now BYEs.
 *
 * The four that remain are one shape: DOUBLE_ELIMINATION 16/16, the Main final decided by a produced
 * exit, its winner alone in the Decider. CA ruled on that the same day — a decider that is not needed
 * is a `DEAD_RUBBER` — and `reconcileDecider` applies it when the final is SCORED. Here the final is
 * decided by an ARRIVAL, which does not pass through it. That is the whole of what stands between
 * this budget and zero.
 *
 * **LOWERED 2026-09-29: 4 -> 0 cells, 4 -> 0 findings.** The four were one shape: DOUBLE_ELIMINATION
 * 16/16, the Main final decided by an ARRIVAL and its winner alone in a `TO_BE_PLAYED` Decider. The
 * decider of such a final is a `DEAD_RUBBER` now (`reconcileDecider`), and a `DEAD_RUBBER` strands
 * nobody. Pinned by `deciderReachedByArrival.test.ts`.
 *
 * ## IT IS AT ZERO AND THE RULE IS STILL A WARNING — the promotion is CA's call, not this file's
 *
 * The header says to promote the rule to `error` and delete this file at zero. The zero is of the
 * DEFAULT policy. With `doubleExitPropagateBye: false` — which a consumer may set, and which 63
 * tests name — the same matrix still strands people, and an `error` would turn `valid` false on
 * every one of those draws. That is a change to what consumers see, so it is not taken here.
 *
 * Until it is ruled, this file is an EQUALITY at zero, and it carries its own proof that the
 * detector can still fire: one cell played under the produced-exit policy, where a stall remains. A
 * ceiling of zero over a detector that had been switched off would pass, and would say nothing.
 */
const BUDGET_CELLS = 0;
const BUDGET_FINDINGS = 0;

/** DOUBLE_ELIMINATION 16/13: under the produced-exit policy four participants wait in one chain */
const LIVENESS_SEED = 117;

const occupantsOf = (matchUp: any) => (matchUp?.sides ?? []).filter((s: any) => s?.participantId && !s?.bye);
const playableShape = (m: any) => !m.winningSide && (!m.matchUpStatus || m.matchUpStatus === 'TO_BE_PLAYED');

test.skipIf(!enabled)(
  'the stalled-position population is within budget, and the budget only ever falls',
  () => {
    let cellsPlayed = 0;
    let terminalCells = 0;
    let findings = 0;
    const cellsWithStall: string[] = [];

    // the 600, then the 400 of the draw-type extension (G1/G12, 2026-10-01) — one budget, one
    // walk, because a stall is a stall whichever list the cell came from
    for (const cell of [...MATRIX_CELLS, ...MATRIX_EXTENSION_CELLS]) {
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
    expect(cellsPlayed).toEqual(MATRIX_CELLS.length + MATRIX_EXTENSION_CELLS.length);
    expect(terminalCells).toEqual(MATRIX_CELLS.length + MATRIX_EXTENSION_CELLS.length);

    // THE RATCHET. Lower these when the population shrinks; never raise them.
    expect(cellsWithStall.length, `cells with a stall (was ${BUDGET_CELLS})`).toBeLessThanOrEqual(BUDGET_CELLS);
    expect(findings, `total stalls (was ${BUDGET_FINDINGS})`).toBeLessThanOrEqual(BUDGET_FINDINGS);

    // AND IT MUST STILL BITE. The population is zero, so the proof that the detector is awake is a
    // cell where a stall is known to remain: the same matrix, under the policy that produces exits.
    const livenessCell = MATRIX_CELLS.find(({ seed }) => seed === LIVENESS_SEED);
    expect(livenessCell).toBeDefined();
    expect(playMatrixCell(livenessCell as any, 'budget-liveness', 'exits', PRODUCED_EXIT_POLICY)).toEqual(true);
    const liveness: any = getDrawInconsistencies({
      drawDefinition: getDrawDefinition('budget-liveness'),
      drawId: 'budget-liveness',
    });
    expect(
      (liveness?.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION).length,
      'the detector reported nothing where a stall is known to remain',
    ).toBeGreaterThan(0);
  },
  1_800_000,
);

/**
 * THE SECOND BUDGET — the same 1,000 cells under `doubleExitPropagateBye: false`.
 *
 * The default policy is at zero and gated above. This one is not at zero, and until it is the rule
 * cannot be promoted from `warning` to `error`: TMX and the ranking-point consumers run with the
 * policy off, and an `error` would turn `valid` false on every one of these draws. It was measured by
 * hand (38 cells over the original 600 on 2026-09-29) and guarded by nothing, so it could only be
 * re-measured, never held. Same ratchet: **lower only**.
 *
 * MEASURED 2026-10-02 on `dev` `645cd41dcf`: **11 cells, 17 findings**, every one a 16/13 draw with
 * a double exit, in four shapes —
 *
 *   DOUBLE_ELIMINATION 16/13   2 cells, 8 findings   Backdraw|4|2, |5|1, |6|1 and Main|5|1
 *   FIRST_MATCH_LOSER_CONSOLATION 16/13   3 cells   Consolation|4|1
 *   COMPASS 16/13              3 cells               West|3|1
 *   PLAYOFF 16/13 (extension)  3 cells               9-16|3|1
 *
 * The known family is two held exits meeting at one target, a convergence `settleHeldExits` declines
 * (see `getHeldExit`); settling it was tried and taken out on 2026-09-29.
 */
const BUDGET_CELLS_POLICY_OFF = 11;
const BUDGET_FINDINGS_POLICY_OFF = 17;

test.skipIf(!enabled)(
  'with doubleExitPropagateBye off, the stalled-position population is within its own budget',
  () => {
    let cellsPlayed = 0;
    let findings = 0;
    const cellsWithStall: string[] = [];

    for (const cell of [...MATRIX_CELLS, ...MATRIX_EXTENSION_CELLS]) {
      const drawId = `budget-off-${cell.seed}`;
      if (!playMatrixCell(cell, drawId, 'exits', PRODUCED_EXIT_POLICY)) continue;
      cellsPlayed += 1;

      const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
      const stalls = (integrity?.inconsistencies ?? []).filter((i: any) => i.issueType === STALLED_POSITION);
      if (!stalls.length) continue;
      findings += stalls.length;
      cellsWithStall.push(cellLabel(cell));
      expect(
        stalls.every((i: any) => i.severity === 'warning'),
        cellLabel(cell),
      ).toEqual(true);
    }

    process.stdout.write(
      `\nstall budget (policy off): cells=${cellsWithStall.length}/${BUDGET_CELLS_POLICY_OFF} ` +
        `findings=${findings}/${BUDGET_FINDINGS_POLICY_OFF} (cellsPlayed=${cellsPlayed})\n`,
    );

    // a scan that generated nothing also reports zero stalls
    expect(cellsPlayed).toEqual(MATRIX_CELLS.length + MATRIX_EXTENSION_CELLS.length);

    // THE RATCHET. Lower these when the population shrinks; never raise them.
    expect(cellsWithStall.length, `cells with a stall (was ${BUDGET_CELLS_POLICY_OFF})`).toBeLessThanOrEqual(
      BUDGET_CELLS_POLICY_OFF,
    );
    expect(findings, `total stalls (was ${BUDGET_FINDINGS_POLICY_OFF})`).toBeLessThanOrEqual(
      BUDGET_FINDINGS_POLICY_OFF,
    );
  },
  1_800_000,
);

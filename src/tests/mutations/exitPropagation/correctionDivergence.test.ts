import {
  resolveFirstRoundStructure,
  compareCorrection,
  correctionScenario,
  type Step,
} from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_ROUND_LOSER_CONSOLATION,
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * A corrected result must leave no trace — swept, not sampled.
 *
 * Score a double exit, score a second, then CORRECT the first. The draw must be indistinguishable
 * from one that reached the same two final outcomes directly. This is CA's re-score invariant
 * generalised past a single matchUp: *how you got here must not change where you are*.
 *
 * ## Why this file exists at all
 *
 * The double-exit unwind defect was shrunk onto ONE seed, `nonRandom: 9000230`, and six fix attempts
 * were made against it. On 2026-09-21 that seed was found to reach identical states on both paths —
 * fixed by unrelated work — **while the class was still alive everywhere else**. A single seed
 * cannot tell you that. This sweep can, and it is the oracle the seventh attempt should work
 * against.
 *
 * ## The counts are asserted EXACTLY, in both directions
 *
 * A new divergence fails the run. So does a divergence that stops reproducing, with instructions to
 * lower the baseline — otherwise a fix silently banks progress nobody records, and the next session
 * cannot tell an improvement from a regression. Same discipline as `knownFailures.ts`.
 *
 * **Lower these numbers when you fix something. Never raise them.**
 *
 * ## Corrected 2026-09-21: 56 -> 48 severe, and it was the INSTRUMENT
 *
 * The signature rendered a TRAILING hole (`dp=4._` vs `dp=4`), which is a representation difference
 * and not information — `draw-positions.md` §5, pinned by
 * `drawPositionsRepresentationIndependence.test.ts`. Eight cells diverged on that alone, all
 * FIRST_MATCH_LOSER_CONSOLATION 8/8 `Consolation|3|1`, and they were counted as SEVERE.
 *
 * That number had already cost product code: the seventh double-exit unwind attempt scored itself
 * 56 -> 48 against it and broke five test files chasing the artifact. Leading and interior holes are
 * still rendered, because there a hole IS load-bearing and collapsing it would hide the very
 * side-derivation defects this sweep exists to catch.
 */
/**
 * ## `provenanceOnly` 120 -> 0 and `identical` 44 -> 164, 2026-09-28 — and it was the LAST ARRAY GATE
 *
 * `severe` is unchanged at 28. What moved is the whole `provenanceOnly` bucket: 120 cells where the
 * corrected path left a STALE `sideExitProvenance` entry the direct path did not have, with status, winner
 * and positions already agreeing.
 *
 * The cause was P37's last legacy-array decision read. `drawPositionPlacement` and
 * `removeSubsequentRoundsParticipant` gated the NATIVE provenance write on `matchUp.matchUpStatusCodes`
 * being truthy — and because every blanking site sets that field to `[]`, the gate admitted writes onto
 * matchUps that had merely been touched by an earlier pass. Asking the native question instead
 * (`participatesInExitCascade`: does it already hold provenance, or is it an exit or a BYE) admits only the
 * matchUps where a late-learned origin belongs.
 *
 * So this bucket existing at all was a symptom of the array, not of the correction. **`provenanceOnly` is
 * now zero and should stay there** — a cell landing in it again means a writer is stamping provenance
 * somewhere the cascade does not reach, which is P19's failure mode.
 */
/**
 * ## Lowered 2026-09-27: 36 -> 28 severe, and the eight went to IDENTICAL
 *
 * `propagateUnfillableLoserBye` (punch-list **P39**) resolves a first-round seat as a BYE when the
 * matchUp feeding it produced an exit and can never produce a loser. Eight cells that previously
 * diverged visibly between the direct and corrected paths now agree **exactly** — `identical` 36 -> 44,
 * `provenanceOnly` and `incomparable` unchanged — because the BYE is placed on both paths instead of
 * only on the one where the arrival happened to come last.
 *
 * That is also how the fix was found to be incomplete: hooked on the arrival path alone it made the
 * outcome depend on entry order, and this sweep plus `sideBlindExitCarry`'s order-independence test
 * both said so. The propagation is called from every path that resolves a produced exit.
 */
/**
 * ## Lowered 2026-09-28: 28 -> 8 severe, and the twenty went straight to IDENTICAL
 *
 * `reconcileStaleExitOrigins` (punch-list **P40**) withdraws a carried exit whose ORIGIN has stopped
 * being a double exit and now delivers a winner. Twenty cells diverged because the corrected path
 * left that entry standing: the origin had re-derived to a single exit with a real participant in the
 * winning seat, so what it sent downstream was an ADVANCEMENT, and the stale entry kept describing an
 * exit. `identical` 164 -> 184, `provenanceOnly` and `incomparable` unchanged at zero.
 *
 * The timing is the whole of it, and this sweep is what proves the placement rather than the rule.
 * Three earlier positions for the same decision were measured and each one traded one case for
 * another — inside `withdrawProducedExits` on the presence of a re-derived winningSide, then on that
 * winner's occupancy, then in a second pass after the link-directed removals. Only asking at the end
 * of the mutation satisfies both `byeAdvancesIntoPendingDoubleExit` (the seat is EMPTIED later) and
 * `crossStructureWinnerPositions` DE window 9301605 (the seat is FILLED later). The module's docblock
 * carries both measurements.
 */
const BASELINE = {
  cells: 192,
  /** both paths ran and the draws agree exactly — the only bucket that should ever grow */
  identical: 184,
  /** a stale `sideExitProvenance` entry only; status, winner and positions agree */
  provenanceOnly: 0,
  /** matchUpStatus, winningSide or drawPositions differ — user-visible */
  severe: 8,
  /** a step was refused in one path and not the other, so the cell was not an experiment */
  incomparable: 0,
};

const DRAW_TYPES = [
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
];
const FLAVOURS = [
  [DOUBLE_WALKOVER, WALKOVER],
  [DOUBLE_DEFAULT, DEFAULTED],
];
// full field, then reductions that force BYEs into different placements — the shapes that make the
// severe cases severe (a BYE destroyed, a drawPosition lost)
const REDUCTIONS = [0, 1, 3];

/** provenance stripped, so "the record is stale" and "the draw is wrong" are counted separately */
const withoutProvenance = (signature: string) => signature.replace(/ prov=[^ ]*/, '');

/**
 * The matrix as a FLAT list, for the same reason `exitPropagationMatrix` builds one: five nested
 * loops put the classifier over the cognitive-complexity threshold, and the nesting carried no
 * meaning.
 */
const MATRIX = DRAW_TYPES.flatMap((drawType) =>
  [8, 16].flatMap((drawSize) =>
    REDUCTIONS.flatMap((reduction) =>
      FLAVOURS.flatMap(([doubleExitStatus, singleExitStatus]) =>
        [true, false].map((propagateExitStatus) => ({
          participantsCount: drawSize - reduction,
          propagateExitStatus,
          singleExitStatus,
          doubleExitStatus,
          drawType,
          drawSize,
          seed: 9000230,
        })),
      ),
    ),
  ),
);

type Bucket = 'identical' | 'provenanceOnly' | 'severe' | 'incomparable';

const structureCache = new Map<string, string | undefined>();
function firstRoundStructure(config: Parameters<typeof resolveFirstRoundStructure>[0]): string | undefined {
  const key = `${config.drawType}|${config.drawSize}|${config.participantsCount}`;
  if (!structureCache.has(key)) structureCache.set(key, resolveFirstRoundStructure(config));
  return structureCache.get(key);
}

/**
 * THE TWO DIRECTIONS A RE-SCORE CAN GO, and only one of them was ever swept.
 *
 * `DOWNGRADE` is what `correctionScenario` builds and what this file has always measured: two double
 * exits, then the first CORRECTED DOWN to a single. `UPGRADE` is the reverse — a single exit, a double
 * beside it, then the single RE-SCORED UP to a double — and it was **unswept across all eight draw
 * types** until 2026-09-27. It is the direction the three `unwindRemovesDrawPosition` reproductions
 * use, and the only one that reaches punch-list **P42**.
 *
 * Both directions end at the same pair of outcomes, so both are valid tests of CA's invariant: *how you
 * got here must not change where you are.*
 */
type Direction = 'DOWNGRADE' | 'UPGRADE';

function scenarioFor(
  direction: Direction,
  {
    doubleExitStatus,
    singleExitStatus,
    structureName,
  }: { doubleExitStatus: string; singleExitStatus: string; structureName?: string },
): { direct: Step[]; corrected: Step[] } {
  if (direction === 'DOWNGRADE') return correctionScenario({ doubleExitStatus, singleExitStatus, structureName });

  const at = (roundPosition: number, outcome: any): Step => ({
    structureName: structureName as string,
    roundNumber: 1,
    roundPosition,
    outcome,
  });
  const asDouble = { matchUpStatus: doubleExitStatus };
  const asSingle = { matchUpStatus: singleExitStatus, winningSide: 1 };
  return {
    direct: [at(1, asDouble), at(2, asDouble)],
    corrected: [at(2, asSingle), at(1, asDouble), at(2, asDouble)],
  };
}

function classify(
  cell: (typeof MATRIX)[number],
  direction: Direction = 'DOWNGRADE',
): { bucket: Bucket; report?: string } {
  const { doubleExitStatus, singleExitStatus, ...config } = cell;
  const label = `${config.drawType} ${config.drawSize}/${config.participantsCount} ${doubleExitStatus} propagate=${config.propagateExitStatus}`;

  // COMPASS and OLYMPIC open in `East`, not `Main` — resolved per draw rather than assumed, and
  // CACHED: resolving builds a draw, and doing that per cell tripled the sweep's generation count
  const structureName = firstRoundStructure(config);
  const { direct, corrected } = scenarioFor(direction, { doubleExitStatus, singleExitStatus, structureName });
  const { divergences, refusalMismatch } = compareCorrection({ config, direct, corrected });

  // a cell where one path was refused is NOT a divergence — the two draws did not run the same
  // experiment, and comparing them would manufacture a verdict
  if (refusalMismatch) return { bucket: 'incomparable', report: `${label} INCOMPARABLE ${refusalMismatch}` };
  if (!divergences.length) return { bucket: 'identical' };

  const visible = divergences.filter(
    (divergence) => withoutProvenance(divergence.direct) !== withoutProvenance(divergence.corrected),
  );
  if (!visible.length) return { bucket: 'provenanceOnly' };

  const detail = visible
    .map(
      (d) =>
        `      ${d.coordinate}  direct[${withoutProvenance(d.direct)}]  corrected[${withoutProvenance(d.corrected)}]`,
    )
    .join('\n');
  return { bucket: 'severe', report: `${label}\n${detail}` };
}

it('a corrected double exit leaves the draw where the direct path leaves it', () => {
  setSubscriptions({});
  const counts: Record<Bucket, number> = { identical: 0, provenanceOnly: 0, severe: 0, incomparable: 0 };
  const reports: string[] = [];

  for (const cell of MATRIX) {
    const { bucket, report } = classify(cell);
    counts[bucket]++;
    if (report) reports.push(report);
  }

  // the control: a sweep that measured nothing would satisfy every assertion below vacuously
  expect(MATRIX.length).toEqual(BASELINE.cells);

  // reported as one comparison so a failure names the cells rather than just the number
  const report = counts.severe === BASELINE.severe ? '' : `\n${reports.join('\n')}\n`;
  expect(`severe=${counts.severe}${report}`).toEqual(`severe=${BASELINE.severe}`);

  expect({
    provenanceOnly: counts.provenanceOnly,
    incomparable: counts.incomparable,
    identical: counts.identical,
  }).toEqual({
    provenanceOnly: BASELINE.provenanceOnly,
    incomparable: BASELINE.incomparable,
    identical: BASELINE.identical,
  });
  // 192 cells, each generating two draws and playing them out. It runs in ~10s alone and the
  // default 30s cap is not enough under full-suite contention — measured, it timed out there while
  // passing in isolation, which is the worst way for a gate to fail.
}, 180_000);

/**
 * THE UNSWEPT DIRECTION — a single exit RE-SCORED UP to a double. **Punch-list P42.**
 *
 * Added 2026-09-27, and it found 52 severe divergences on its first run. Everything above sweeps the
 * DOWNGRADE — correct a double exit down to a single — and reports 28 severe. The reverse had never
 * been swept at all, and it is the direction that reaches the defect.
 *
 * **What diverges, and it is user-visible.** The provenance is IDENTICAL on both paths; only the status
 * differs:
 *
 * ```text
 * FIRST_MATCH_LOSER_CONSOLATION 8/8 DOUBLE_WALKOVER
 *   Consolation|1|1  direct  [DOUBLE_WALKOVER ws=-]   prov 1:DW->WO, 2:DW->WO
 *                   upgrade  [WALKOVER ws=1]          prov 1:DW->WO, 2:DW->WO
 *   Consolation|2|1  direct  [BYE dp=1.4 prov 2:DW->WO]   upgrade  [BYE dp=1.3 prov -]
 * ```
 *
 * So a matchUp nobody played showed a WINNER on the re-scored path, and the exit that should have
 * propagated onward from it did not. `deriveExitStateFromProvenance` on that record returns
 * `DOUBLE_WALKOVER` and no winner — the facts are present and correct on both paths, and only the status
 * derivation disagreed.
 *
 * ## HALF OF IT IS FIXED, and the count did not move
 *
 * The convergence reconciliation in `doubleExitAdvancement` closes the STATUS half: the re-scored matchUp
 * is a double exit with no winner, exactly as the direct path leaves it, and the
 * `UNCOLLAPSED_CONVERGENCE` population went from 52 to **zero** — measured on this matrix, on the
 * 600-cell census, and on all three named reproductions — so that rule is now `error` severity and the
 * ratchet that sized it is deleted.
 *
 * **These 52 cells still diverge**, now on the CONSEQUENCE rather than the status: `Consolation|2|1`
 * differs, because the corrected status does not re-run the propagation that should follow from it. That
 * is the missing half **P40** names as *"cross-structure re-advancement"*, and it is why this baseline is
 * unchanged at 52. Fixing the status without the consequence is progress, not a fix, and this arm is what
 * says so.
 *
 * **It is independent of `propagateExitStatus`** — both settings diverge — and systematic rather than
 * seed-luck: 8 cells in each of six draw types, 4 in CURTIS_CONSOLATION, 0 in SINGLE_ELIMINATION, which
 * has no second structure for two exits to converge in.
 *
 * **Do not attempt the fix from `doubleExitAdvancement`'s `existingExit` gate.** Measured the same day:
 * asking provenance there takes the suite from 4 failures to 21, because it re-routes convergences on
 * the DIRECT path too — which this sweep shows are already correct.
 *
 * **Lower these numbers when you fix it. Never raise them.**
 */
const UPGRADE_BASELINE = {
  cells: 192,
  identical: 140,
  provenanceOnly: 0,
  severe: 52,
  incomparable: 0,
};

it('a single exit re-scored UP to a double leaves the draw where the direct path leaves it', () => {
  setSubscriptions({});
  const counts: Record<Bucket, number> = { identical: 0, provenanceOnly: 0, severe: 0, incomparable: 0 };
  const reports: string[] = [];

  for (const cell of MATRIX) {
    const { bucket, report } = classify(cell, 'UPGRADE');
    counts[bucket]++;
    if (report) reports.push(report);
  }

  // the control: a sweep that measured nothing would satisfy every assertion below vacuously
  expect(MATRIX.length).toEqual(UPGRADE_BASELINE.cells);

  const report = counts.severe === UPGRADE_BASELINE.severe ? '' : `\n${reports.join('\n')}\n`;
  expect(`severe=${counts.severe}${report}`).toEqual(`severe=${UPGRADE_BASELINE.severe}`);

  expect({
    provenanceOnly: counts.provenanceOnly,
    incomparable: counts.incomparable,
    identical: counts.identical,
  }).toEqual({
    provenanceOnly: UPGRADE_BASELINE.provenanceOnly,
    incomparable: UPGRADE_BASELINE.incomparable,
    identical: UPGRADE_BASELINE.identical,
  });
}, 180_000);

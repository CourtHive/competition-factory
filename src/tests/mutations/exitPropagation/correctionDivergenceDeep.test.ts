import { deepCorrectionScenario, compareCorrection } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import type { DivergenceConfig } from '@Tests/testHarness/exitPropagation/correctionDivergence';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FEED_IN_CHAMPIONSHIP,
  SINGLE_ELIMINATION,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * A CORRECTION TAKEN DEEP IN A DRAW LEAVES THE SAME DRAW AS THE DIRECT ENTRY.
 *
 * `correctionDivergence` corrects one of two adjacent first-round matchUps before anything else is
 * played. Every divergence found in September 2026 came from a correction, and that oracle was the
 * only one comparing corrections at all — so a correction in round 3, in a consolation, or with a
 * dozen unrelated results entered in between was never compared against its direct path. Coverage
 * assessment gap G6, agreed by CA 2026-09-30.
 *
 * 960 cells: the ten matrix draw types × {8, 16} × three fills × four exit statuses × both
 * `propagateExitStatus` × both `doubleExitPropagateBye` policies. Each plays twelve steps forward on
 * the matrix's own schedule, takes the LAST exit entered as the mistake, and corrects it: a double
 * exit to its single, a WALKOVER to a DOUBLE_WALKOVER, a DEFAULTED to a played result. Measured on
 * the first run: mistakes land in `Main|2` 256 times, `Main|3` 139, the consolations 200, `Main|4` 46.
 *
 * ## Buckets
 *
 * - **identical** — every matchUp signature the same on both paths.
 * - **provenanceOnly** — only `sideExitProvenance` text differs.
 * - **incomparable** — the direct entry of the corrected outcome is itself refused, so there is
 *   nothing to compare a correction against. Measured: FIRST_MATCH_LOSER_CONSOLATION 8/8 refuses a
 *   `DOUBLE_WALKOVER` at `Main|2|2` as `ERR_INCOMPATIBLE_MATCHUP_STATUS`. Whether that refusal is
 *   right is a separate question, and it is recorded in the punch list rather than counted here.
 * - **refused** — the correction alone is refused (`CANNOT_CHANGE_*`): a load-bearing outcome, by
 *   CA's rule of 2026-09-21. None on the first run: nothing in the cone is played after the mistake.
 * - **severe** — status, winner or positions differ. THE RATCHET.
 *
 * ## The baseline, and what each of its cells is — measured 2026-09-30
 *
 * Nine severe cells in four shapes on the first run. Each is named here so a change that closes one
 * lowers the number and a change that opens one is caught.
 *
 *   1. DOUBLE_ELIMINATION 8/7, the FINAL corrected WALKOVER → DOUBLE_WALKOVER, 4 cells (both
 *      policies × both propagate): the Decider held a BYE (default policy) or a produced exit
 *      (policy off) on the direct path, and read `TO_BE_PLAYED` after the correction.
 *      `reconcileDecider` wrote `TO_BE_PLAYED` over what the double exit placed. **CLOSED in the
 *      same change**: it leaves a BYE or an exit alone. 9 → 5.
 *   2. DOUBLE_ELIMINATION 8/5, `Main|2|2` corrected double → single, 2 cells: `Main|4|1` holds a
 *      drawPosition after the correction that the direct path never advanced. TRACED: the double
 *      exit's BYE let the Backdraw's other finalist advance through `Backdraw|3|1` and `Backdraw|4|1`
 *      and across the winner link into the Main final; the correction withdrew the BYE and
 *      released the advancements inside the Backdraw, but not the one across the link. **CLOSED**:
 *      `positionClear`'s round walk follows the winner link (`releaseLinkedWinnerAdvancement`),
 *      pinned in `correctionReleasesAdvancementAcrossLink.test.ts`. 5 → 3.
 *   3. FIRST_MATCH_LOSER_CONSOLATION 8/5, `Main|2|2` WALKOVER → DOUBLE_WALKOVER, default policy:
 *      `Consolation|3|1` holds the BYE and the participant on opposite sides. Which side is the BYE
 *      differs, and nothing else.
 *   4. The same cell with the policy off, 2 cells. TRACED: two things at once. The DIRECT path
 *      stalled — the produced exit stopped on the BYE-held `Consolation|2|2` because
 *      `getExitArrivalSideNumber` predicted side 2 from feeder order where the seat already sat on
 *      side 1 (**CLOSED**: the seated side is read; `exitArrivesOnTheSeatedSide.test.ts`). What
 *      remains is the same difference as shape 3: `[2, 4] ws=2` against `[null, 4] ws=1`, the same
 *      winner on a different seat number.
 *
 * Shapes 3 and 4 share a root. Seat 2's advancement into `Consolation|3|1` came from its opponent's
 * BYE at generation; clearing the walkover's loser from seat 2 withdraws it, and whatever arrives
 * next — the double exit's BYE, or its exit — is laid out from scratch. Keeping a BYE-advanced seat
 * on ANY clear closes all three cells and breaks 4 of `shuffleCompletion`'s byeLimit cases:
 * `assignDrawPositionBye` finds the seat already advanced, BYEs that matchUp, and skips the
 * advancement step that also feeds the loser link its BYE. Generation has no canonical seat for a
 * BYE meeting a BYE either (measured 2026-09-30: lower wins in some pairs, higher in others).
 */

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
const EXITS = [
  { matchUpStatus: DOUBLE_WALKOVER },
  { matchUpStatus: DOUBLE_DEFAULT },
  { matchUpStatus: WALKOVER, winningSide: 1 },
  { matchUpStatus: DEFAULTED, winningSide: 2 },
];
const POLICIES: { label: string; doubleExitPropagateBye?: boolean }[] = [
  { label: 'BYE', doubleExitPropagateBye: undefined },
  { label: 'EXIT', doubleExitPropagateBye: false },
];

// five minutes over 960 cells: run by `pnpm verify` and CI, not by every `pnpm test`
const enabled = process.env.DEEP_CORRECTIONS === '1';

const BASELINE = { cells: 960, severe: 3, incomparable: 4, provenanceOnly: 0 };

function alternative(outcome: any): any {
  switch (outcome?.matchUpStatus) {
    case DOUBLE_WALKOVER:
      return { matchUpStatus: WALKOVER, winningSide: 1 };
    case DOUBLE_DEFAULT:
      return { matchUpStatus: DEFAULTED, winningSide: 1 };
    case WALKOVER:
      return { matchUpStatus: DOUBLE_WALKOVER };
    case DEFAULTED:
      return {
        matchUpStatus: COMPLETED,
        winningSide: 2,
        score: {
          sets: [
            { side1Score: 3, side2Score: 6, winningSide: 2 },
            { side1Score: 3, side2Score: 6, winningSide: 2 },
          ],
        },
      };
    default:
      return undefined;
  }
}

const withoutProvenance = (signature: string) => signature.replace(/ prov=[^ ]*/, '');

type Bucket = 'identical' | 'provenanceOnly' | 'incomparable' | 'refused' | 'severe';

/** Every cell of the sweep, each with its own seed. */
function cells(): { config: DivergenceConfig; cellExit: any; label: string }[] {
  const out: { config: DivergenceConfig; cellExit: any; label: string }[] = [];
  let seed = 7000000;
  for (const policy of POLICIES)
    for (const drawType of DRAW_TYPES)
      for (const drawSize of [8, 16])
        for (const reduction of [0, 1, 3])
          for (const cellExit of EXITS)
            for (const propagateExitStatus of [true, false]) {
              seed += 1;
              const participantsCount = drawSize - reduction;
              out.push({
                config: {
                  doubleExitPropagateBye: policy.doubleExitPropagateBye,
                  participantsCount,
                  propagateExitStatus,
                  drawType,
                  drawSize,
                  seed,
                },
                cellExit,
                label: `${policy.label} ${drawType} ${drawSize}/${participantsCount} ${cellExit.matchUpStatus} propagate=${propagateExitStatus}`,
              });
            }
  return out;
}

/** Which bucket one cell falls in, and the divergence text if it is severe. */
function classify(config: DivergenceConfig, cellExit: any): { bucket: Bucket; detail: string } | undefined {
  const scenario = deepCorrectionScenario({ config, cellExit, alternative });
  if (!scenario) return undefined;

  // ONE run of each path. This ran both a second time to read their refusals — 5 draws per cell
  // instead of 3 — and on the CI runner that was the difference between 34 minutes and the
  // 600-second timeout (#5049 and #5050 both timed out at 608 s with the counts already printed).
  const {
    divergences,
    directRefusals: direct,
    correctedRefusals: corrected,
  } = compareCorrection({ config, direct: scenario.direct, corrected: scenario.corrected });
  const { structureName, roundNumber, roundPosition } = scenario.mistake;
  const mistake = `${structureName}|${roundNumber}|${roundPosition}`;
  const rendered = divergences.map((d) => `${d.coordinate} [${d.direct}] vs [${d.corrected}]`).join('; ');
  const detail = `at ${mistake}: ${rendered}`;

  if (direct.includes(mistake)) return { bucket: 'incomparable', detail };
  if (direct !== corrected) return { bucket: 'refused', detail };
  const severe = divergences.some((d) => withoutProvenance(d.direct) !== withoutProvenance(d.corrected));
  if (severe) return { bucket: 'severe', detail };
  if (divergences.length) return { bucket: 'provenanceOnly', detail };
  return { bucket: 'identical', detail };
}

it.skipIf(!enabled)(
  'a correction taken deep in a draw leaves the same draw as the direct entry',
  () => {
    const counts: Record<Bucket, number> = { identical: 0, provenanceOnly: 0, incomparable: 0, refused: 0, severe: 0 };
    const severe: string[] = [];
    let played = 0;

    for (const { config, cellExit, label } of cells()) {
      setSubscriptions({});
      const result = classify(config, cellExit);
      // CONTROL: every cell produces a correction to compare
      expect(result, label).toBeDefined();
      if (!result) continue;
      played += 1;
      counts[result.bucket] += 1;
      if (result.bucket === 'severe') severe.push(`${label} ${result.detail}`);
    }

    const report = severe.join('\n');
    process.stdout.write(`\ndeep corrections: ${JSON.stringify(counts)}\n${report}\n`);

    // CONTROL: the sweep looked at what it says it looked at
    expect(played).toEqual(BASELINE.cells);
    expect(counts.refused).toEqual(0);

    // THE RATCHET. Lower these when a shape closes; never raise them.
    expect(counts.incomparable, 'incomparable cells').toBeLessThanOrEqual(BASELINE.incomparable);
    expect(counts.provenanceOnly, 'provenance-only cells').toBeLessThanOrEqual(BASELINE.provenanceOnly);
    expect(counts.severe, `severe cells:\n${report}`).toBeLessThanOrEqual(BASELINE.severe);
  },
  // the sweep takes ~4 minutes locally and ran to 608 s on the CI runner before the double run above
  // was removed; the ceiling is a guard against a hang, not a budget
  1_200_000,
);

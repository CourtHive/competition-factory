import {
  resolveFirstRoundStructure,
  compareCorrection,
  correctionScenario,
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
 */
const BASELINE = {
  cells: 192,
  /** both paths ran and the draws agree exactly — the only bucket that should ever grow */
  identical: 16,
  /** a stale `sideExitProvenance` entry only; status, winner and positions agree */
  provenanceOnly: 120,
  /** matchUpStatus, winningSide or drawPositions differ — user-visible */
  severe: 56,
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

function classify(cell: (typeof MATRIX)[number]): { bucket: Bucket; report?: string } {
  const { doubleExitStatus, singleExitStatus, ...config } = cell;
  const label = `${config.drawType} ${config.drawSize}/${config.participantsCount} ${doubleExitStatus} propagate=${config.propagateExitStatus}`;

  // COMPASS and OLYMPIC open in `East`, not `Main` — resolved per draw rather than assumed, and
  // CACHED: resolving builds a draw, and doing that per cell tripled the sweep's generation count
  const structureName = firstRoundStructure(config);
  const { direct, corrected } = correctionScenario({ doubleExitStatus, singleExitStatus, structureName });
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

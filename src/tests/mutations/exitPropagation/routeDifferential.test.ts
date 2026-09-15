import { compareRoutes, generateDraw, playForward } from '@Tests/testHarness/exitPropagation/routeComparison';
import { expect, test } from 'vitest';
import fs from 'fs';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * Route A vs Route B differential over every flip in a fully played draw. INERT unless
 * `ROUTE_DIFF=1`.
 *
 *   ROUTE_DIFF=1 TZ=UTC OUT=/tmp/route-diff.jsonl \
 *     npx vitest run src/tests/mutations/exitPropagation/routeDifferential.test.ts \
 *     --disable-console-intercept
 *
 * The two routes, the projection and the id-normalisation rationale are documented once in
 * `@Tests/testHarness/exitPropagation/routeComparison`. This file is the sweep over them: it flips
 * every decided matchUp both ways and counts how many end in structurally different draws.
 *
 * **This is the oracle this workstream is measured on, not the census.** `getDrawInconsistencies`
 * rates some divergences clean, so the census cannot see them; a direct comparison can.
 *
 * ## Reading the output
 *
 * One line per diverging flip (draw type, coordinate, the differing projection keys), then a
 * SUMMARY line. `--disable-console-intercept` is required for the console summary because
 * `vitest.config.mts` sets `onConsoleLog: () => {}` — but the file is written regardless, so the
 * file is the artefact to trust.
 *
 * Note the flag order: the path filter must come BEFORE `--disable-console-intercept`, or vitest
 * ignores it and runs the entire suite.
 */

const enabled = process.env.ROUTE_DIFF === '1';
const outPath = process.env.OUT ?? '/tmp/route-diff.jsonl';
const drawSize = Number(process.env.DIFF_DRAW_SIZE ?? 16);
const seed = Number(process.env.DIFF_SEED ?? 7001);

const DEFAULT_DRAW_TYPES = [FIRST_MATCH_LOSER_CONSOLATION, CURTIS_CONSOLATION, COMPASS, OLYMPIC];

/**
 * `DIFF_DRAW_TYPES` overrides the default set — e.g. `DIFF_DRAW_TYPES=DOUBLE_ELIMINATION` to probe
 * a draw type a census seed implicated. A count on the draw type in question beats reasoning about
 * whether a change helped or hurt it.
 */
const DRAW_TYPES = process.env.DIFF_DRAW_TYPES ? process.env.DIFF_DRAW_TYPES.split(',') : DEFAULT_DRAW_TYPES;

/**
 * Two participant counts, and the second one is not optional.
 *
 * A FULL draw has no BYEs, and without BYEs Gaps 2 and 3 cannot occur — so a sweep run only at
 * `participantsCount === drawSize` reports zero for them whether they are fixed or not. The reduced
 * count is what makes "what is left" a measurement rather than an artefact of the fixture.
 */
const PARTICIPANT_COUNTS = [drawSize, Number(process.env.DIFF_REDUCED ?? 13)];

test.skipIf(!enabled)(`route differential — seed ${seed}, drawSize ${drawSize}`, { timeout: 3_600_000 }, () => {
  fs.writeFileSync(outPath, '');
  const byDrawType: Record<string, { flips: number; diverging: number; skipped: number }> = {};
  let diverging = 0;
  let skipped = 0;
  let flips = 0;

  for (const participantsCount of PARTICIPANT_COUNTS) {
    for (const drawType of DRAW_TYPES) {
      const drawId = `diff-${drawType}-${participantsCount}`;
      const bucket = `${drawType}/${participantsCount}`;
      byDrawType[bucket] = { flips: 0, diverging: 0, skipped: 0 };

      // The play order is a property of the draw, so it is established once and reused for both
      // routes; regenerating from the same seed reproduces it exactly.
      generateDraw(drawType, drawId, drawSize, seed, participantsCount);
      const playOrder = playForward(drawId);
      // CONTROL: a draw that played zero matchUps would yield "0 diverging", which is
      // indistinguishable from a clean result. Assert the input before trusting the output.
      expect(playOrder.length).toBeGreaterThan(0);

      for (let index = 0; index < playOrder.length; index++) {
        const { differences, skipped: skipReason } = compareRoutes({
          participantsCount,
          playOrder,
          drawType,
          drawSize,
          drawId,
          index,
          seed,
        });

        if (differences === null) {
          skipped++;
          byDrawType[bucket].skipped++;
          fs.appendFileSync(
            outPath,
            JSON.stringify({ drawType, participantsCount, coord: playOrder[index], skipped: skipReason }) + '\n',
          );
          continue;
        }

        flips++;
        byDrawType[bucket].flips++;
        if (differences.length) {
          diverging++;
          byDrawType[bucket].diverging++;
          fs.appendFileSync(
            outPath,
            JSON.stringify({
              drawType,
              participantsCount,
              coord: playOrder[index],
              differenceCount: differences.length,
              differences,
            }) + '\n',
          );
        }
      }
    }
  }

  expect(flips).toBeGreaterThan(0);

  const summary = { kind: 'SUMMARY', flips, diverging, skipped, byDrawType };
  fs.appendFileSync(outPath, JSON.stringify(summary) + '\n');
  // Needs --disable-console-intercept to be visible; the OUT file is written regardless.
  console.log('ROUTE_DIFF_SUMMARY', JSON.stringify(summary));
});

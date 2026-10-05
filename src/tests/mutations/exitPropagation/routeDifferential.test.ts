import { expect, test } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  projectByCoordinate,
  compareRoutes,
  generateDraw,
  playForward,
  coordKey,
  type Coord,
} from '@Tests/testHarness/exitPropagation/routeComparison';

// constants
import {
  FIRST_MATCH_LOSER_CONSOLATION,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * Route A vs Route B differential over every flip in a fully played draw. INERT unless
 * `ROUTE_DIFF=1`, and wired into `pnpm verify` and `verify.yml` as `verify:route-differential`.
 *
 * ## It is a GATE now, and it asserts — 2026-09-29, punch-list P18
 *
 * Until then it wrote a file and asserted nothing about it, so it was run by whoever remembered to.
 * The five divergences it had reported since 2026-09-17 were the INSTRUMENT: Route B re-entered
 * every later result as `winningSide: 1`, and a flip can move the successor to the other side of the
 * matchUp they advance into. See `replayedWinningSide` in `routeComparison`. Replaying the swap
 * itself:
 *
 * | sweep | flips | diverging |
 * |---|---|---|
 * | the four default draw types, 16/16 and 16/13 | 186 | 0 (3 refused) |
 * | DOUBLE_ELIMINATION, 16/16 and 16/13 | 56 | 2, then 0 — see below |
 * | five more draw types, 16/16 and 16/13 | 213 | 0 |
 * | the default four at 8/8 and 8/7 | 74 | 0 (1 refused) |
 * | the default four, a second seed, 16/16 and 16/11 | 169 | 0 (3 refused) |
 *
 * Disabling `swapWinnerLoser`'s own re-pointing brings the five back, so the zero is not the
 * instrument agreeing with itself.
 *
 * ## The two that remained were the DECIDER, and they are closed
 *
 * Flipping DOUBLE_ELIMINATION's Main final left the Decider exactly as it was under Route A — same
 * occupants, same winner — because `getDownstreamStructureIds` declines a target that BOTH sides of
 * the flipped matchUp feed. They were allowed here by name until CA ruled, 2026-09-29: a decider
 * that is not needed is a `DEAD_RUBBER`, and one that was played before its final changed is
 * destroyed. `reconcileDecider` settles it by that rule on either route, so there is no allowance
 * left and the DOUBLE_ELIMINATION row above now reads 0.
 *
 * Anything that diverges fails this test, and so does a refusal from any route but A.
 *
 * ## The fields the projection could not see — G14, 2026-10-05
 *
 * The projection now carries entries, seedAssignments, extensions and lineUp (`F:<field>:<key>`,
 * from `fieldProjections`), so a route that leaves any of them behind diverges here too. Measured on
 * first contact: 0 diverging, the same as before. These draws are unseeded and none is TEAM, so only
 * entries and extensions are populated — the control below asserts that much, and
 * `fieldProjections.test.ts` plants a divergence in each field, through `compareRoutes`, to prove the
 * wiring reports one.
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

type FlipRecord = { participantsCount: number; diverges: boolean; skipped?: string; drawType: string; coord: Coord };

const enabled = process.env.ROUTE_DIFF === '1';
const outPath = process.env.OUT ?? path.join(os.tmpdir(), 'route-diff.jsonl');
const drawSize = Number(process.env.DIFF_DRAW_SIZE ?? 16);
const seed = Number(process.env.DIFF_SEED ?? 7001);

const DEFAULT_DRAW_TYPES = [FIRST_MATCH_LOSER_CONSOLATION, CURTIS_CONSOLATION, COMPASS, OLYMPIC, DOUBLE_ELIMINATION];

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
  const records: FlipRecord[] = [];

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
      // CONTROL for the G14 fields: a projection that holds no entries or extensions compares them
      // as equal however they differ
      const projected = Object.keys(projectByCoordinate(drawId));
      expect(projected.some((key) => key.startsWith('F:entries:'))).toEqual(true);
      expect(projected.some((key) => key.startsWith('F:extensions:'))).toEqual(true);

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

        records.push({
          diverges: !!differences?.length,
          coord: playOrder[index],
          skipped: skipReason,
          participantsCount,
          drawType,
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

  const unexpected = records.filter((record) => record.diverges);
  expect(
    unexpected.map((record) => `${record.drawType}/${record.participantsCount} ${coordKey(record.coord)}`),
    'Route A and Route B must leave the same draw',
  ).toEqual([]);

  const refusals = records.filter((record) => record.skipped).map((record) => record.skipped);
  expect([...new Set(refusals)].filter((reason) => reason !== 'A:refused')).toEqual([]);

  const summary = { kind: 'SUMMARY', flips, diverging, skipped, byDrawType };
  fs.appendFileSync(outPath, JSON.stringify(summary) + '\n');
  // Needs --disable-console-intercept to be visible; the OUT file is written regardless.
  console.log('ROUTE_DIFF_SUMMARY', JSON.stringify(summary));
});

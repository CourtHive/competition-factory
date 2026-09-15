import {
  buildDraw,
  flipBothWays,
  flippableCoordinates,
  playFully,
} from '@Tests/testHarness/exitPropagation/routeDifferential';
import { expect, it } from 'vitest';
import { writeFileSync } from 'fs';

// constants
import {
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * The differential probe. Not a gate — it writes a report and asserts only that it MEASURED
 * something, so the same file can be run before and after a change and the two compared.
 *
 * Run with:  DIFFERENTIAL=1 OUT=/tmp/diff.json npx vitest run src/tests/mutations/exitPropagation/routeDifferential.probe.test.ts
 */

const enabled = process.env.DIFFERENTIAL === '1';
const outPath = process.env.OUT ?? '/tmp/route-differential.json';
const seed = Number(process.env.DIFF_SEED ?? 7001);
const drawSize = Number(process.env.DIFF_DRAW_SIZE ?? 16);

/**
 * Four draw types at full size, plus the same four UNDER-FILLED.
 *
 * The under-filled arm matters: at `drawSize 16` with 16 participants there are no BYEs, so a
 * `FIRST_MATCHUP` link can never withhold a placement and Gaps 2 and 3 — both of which need a
 * withheld placement to exist — cannot appear at all. The plan reproduces both at FMLC 16/13, so
 * that profile is carried here rather than discovered again.
 */
const PROFILES = [
  FIRST_MATCH_LOSER_CONSOLATION,
  CURTIS_CONSOLATION,
  COMPASS,
  OLYMPIC,
  // DOUBLE_ELIMINATION is the draw type where WIDENING which structures get visited over-corrects in
  // both directions: `Backdraw` is fed by several MAIN rounds, and `Main r4` feeds its WINNER to a
  // decider, so a structure-visiting fix can reach a structure the flip does not touch AND treat a
  // winners' continuation as a back-draw. Carried here as a control on the OPPOSITE failure mode to
  // the one this workstream set out to fix.
  DOUBLE_ELIMINATION,
].flatMap((drawType) => [
  { drawType, label: `${drawType} ${drawSize}` },
  { drawType, participantsCount: drawSize - 3, label: `${drawType} ${drawSize}/${drawSize - 3}` },
]);

it.runIf(enabled)(
  'measures Route A against Route B across every decided matchUp',
  () => {
    const report: any = {
      seed,
      drawSize,
      drawTypes: {},
      totals: { flips: 0, diverging: 0, substantive: 0, routeAFlagged: 0, routeBFlagged: 0 },
    };

    for (const { drawType, participantsCount, label } of PROFILES) {
      const profile = { drawType, drawSize, seed, ...(participantsCount ? { participantsCount } : {}) };

      // play a reference copy to derive the schedule and the flip list
      buildDraw(profile, 'reference');
      const schedule = playFully('reference');
      const flips = flippableCoordinates('reference');

      // CONTROL: a draw that played no matchUps, or has no flippable result, would make every
      // comparison below vacuous — an empty differential reads as "the two routes agree".
      expect(schedule.length, `${label}: nothing was played`).toBeGreaterThan(0);
      expect(flips.length, `${label}: nothing is flippable`).toBeGreaterThan(0);

      const results = flips.map((coordinate) => flipBothWays(profile, schedule, coordinate));
      const diverging = results.filter((result) => result.differences.length > 0);
      const substantive = diverging.filter((result) => !result.provenanceOnly);

      report.drawTypes[label] = {
        scheduleLength: schedule.length,
        flips: flips.length,
        diverging: diverging.length,
        substantive: substantive.length,
        provenanceOnly: diverging.length - substantive.length,
        routeAFlagged: results.filter((result) => result.routeAInconsistencies > 0).length,
        routeBFlagged: results.filter((result) => result.routeBInconsistencies > 0).length,
        divergingCoordinates: diverging.map((result) => ({
          coordinate: result.coordinate,
          routeACode: result.routeACode,
          routeBCode: result.routeBCode,
          routeBIncomplete: result.routeBIncomplete,
          provenanceOnly: result.provenanceOnly,
          routeAInconsistencies: result.routeAInconsistencies,
          routeBInconsistencies: result.routeBInconsistencies,
          differenceCount: result.differences.length,
          differences: result.differences.slice(0, 12),
        })),
      };
      report.totals.flips += flips.length;
      report.totals.diverging += diverging.length;
      report.totals.substantive += substantive.length;
      report.totals.routeAFlagged += report.drawTypes[label].routeAFlagged;
      report.totals.routeBFlagged += report.drawTypes[label].routeBFlagged;
    }

    writeFileSync(outPath, JSON.stringify(report, null, 2));
    expect(report.totals.flips).toBeGreaterThan(0);
  },
  600_000,
);

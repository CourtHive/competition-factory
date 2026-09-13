import { generateSchedule, prepareDraw, randomConfig, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * Seed-level CENSUS of the exit-propagation pipeline. INERT unless `CENSUS=1`.
 *
 *   CENSUS=1 SEED_START=9000001 SEED_COUNT=600 OUT=/tmp/census.jsonl \
 *     npx vitest run src/tests/mutations/exitPropagation/census.test.ts
 *
 * ## Why this exists alongside `sweep.test.ts`
 *
 * They answer different questions and their numbers are NOT comparable.
 *
 * `sweep.test.ts` SHRINKS each finding and then DEDUPLICATES on its fingerprint, so a seed that
 * fails with a shape already claimed in that worker writes nothing. Its output is a list of distinct
 * SHAPES — the right thing for discovery at 480k seeds, and the reason it is what Button runs.
 *
 * This file does neither. One row per failing seed, the unshrunk first failure, no dedup. Its output
 * is a list of FAILING SEEDS, which is what a before/after measurement needs: "16 closed, 1 new" is
 * a statement about seeds, and a deduplicated file cannot support it. Every census number quoted in
 * this workstream — 136 -> 92 -> 58 -> 42 -> 27 — is this measurement, not the sweep's.
 *
 * ## Frozen schedules, and why they matter for an A/B
 *
 * `generateSchedule` walks the LIVE draw and picks among matchUps that currently hold two
 * participants, so it calls the engine under test: a fix changes the schedules themselves, and a
 * naive A/B mixes defect closure with schedule drift. Emit once, replay on both trees:
 *
 *   CENSUS=1 SCHEDULES_OUT=/tmp/schedules.jsonl … # emit only, no replay
 *   CENSUS=1 SCHEDULES_IN=/tmp/schedules.jsonl  … # replay those exact steps
 *
 * Measured 2026-09-13: the frozen and live censuses agreed exactly on the same window, so drift is
 * not currently distorting the headline — but that agreement is a finding with a shelf life, and the
 * frozen mode is how it stays checkable.
 *
 * ## Per-seed attribution is only sound since #4844
 *
 * `generateTournamentRecord` used to consume a module-level array of nine tournament names with
 * `randomPop`, so from the tenth generation in a process the seeded RNG ran one draw out of step and
 * `nonRandom` stopped determining the tournament. Three of thirty-one failing seeds then could not
 * be reproduced alone. If a seed ever again fails in a run but not in isolation, suspect that class
 * first — see `src/tests/mocks/mockTournamentNameReuse.test.ts`.
 */

const enabled = process.env.CENSUS === '1';
const seedStart = Number(process.env.SEED_START ?? 9000001);
const seedCount = Number(process.env.SEED_COUNT ?? 600);
const maxSteps = Number(process.env.MAX_STEPS ?? 30);
const outPath = process.env.OUT ?? '/tmp/census.jsonl';
const schedulesOut = process.env.SCHEDULES_OUT;
const schedulesIn = process.env.SCHEDULES_IN;

type Scenario = { seed: number; config: any; steps?: any[]; generationThrow?: string };

/** Generate each seed's schedule against a fresh draw. */
function generateScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];
  for (let seed = seedStart; seed < seedStart + seedCount; seed++) {
    setSubscriptions({});
    const config = randomConfig(seed);
    const drawId = `sweep-${seed}`;
    try {
      prepareDraw(config, drawId);
      scenarios.push({ seed, config, steps: generateSchedule(config, drawId, maxSteps) });
    } catch (err: any) {
      scenarios.push({ seed, config, generationThrow: String(err?.message ?? err) });
    }
  }
  return scenarios;
}

function readScenarios(path: string): Scenario[] {
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test.skipIf(!enabled)(
  `census ${seedStart}..${seedStart + seedCount - 1}`,
  () => {
    const scenarios = schedulesIn ? readScenarios(schedulesIn) : generateScenarios();

    if (schedulesOut) {
      fs.writeFileSync(schedulesOut, scenarios.map((scenario) => JSON.stringify(scenario)).join('\n') + '\n');
      // Emitting is a mode of its own: the point is to hand the SAME steps to another tree, so there
      // is nothing to measure here and a replay would only re-introduce the drift being removed.
      expect(scenarios.length).toBeGreaterThan(0);
      return;
    }

    fs.writeFileSync(outPath, '');
    const byIssue: Record<string, number> = {};
    let failing = 0;

    for (const scenario of scenarios) {
      const { seed, config } = scenario;
      setSubscriptions({});

      if (scenario.generationThrow) {
        failing++;
        byIssue.GENERATION_THROW = (byIssue.GENERATION_THROW ?? 0) + 1;
        fs.appendFileSync(
          outPath,
          JSON.stringify({ seed, property: 'GENERATION_THROW', detail: scenario.generationThrow, config }) + '\n',
        );
        continue;
      }

      let failure;
      try {
        failure = replay(config, scenario.steps ?? [], `sweep-${seed}`);
      } catch (err: any) {
        failure = { property: 'NO_EXCEPTION_ESCAPES', matchUpId: '-', detail: String(err?.message ?? err) };
      }
      if (!failure) continue;

      failing++;
      byIssue[failure.property] = (byIssue[failure.property] ?? 0) + 1;
      fs.appendFileSync(
        outPath,
        JSON.stringify({
          seed,
          drawType: config.drawType,
          property: failure.property,
          detail: failure.detail,
          matchUpId: failure.matchUpId,
          stepCount: scenario.steps?.length,
          config,
        }) + '\n',
      );
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({ kind: 'SUMMARY', seedStart, seedCount, scenarios: scenarios.length, failing, byIssue }) + '\n',
    );

    // The control: a census that scored no scenarios would report "0 failing" and read as good news.
    expect(scenarios.length).toEqual(seedCount);
  },
  1000 * 60 * 60 * 6,
);

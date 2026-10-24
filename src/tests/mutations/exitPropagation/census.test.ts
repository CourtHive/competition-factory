import { findingLocation, findingProvenance, harnessRevision } from '@Tests/testHarness/exitPropagation/findingRecord';
import { generateSchedule, prepareDraw, randomConfig, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { emptyCoverage } from '@Tests/testHarness/exitPropagation/properties';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';
import {
  addReplayCounts,
  emptyReplayCounts,
  scenarioPreparationFailure,
} from '@Tests/testHarness/exitPropagation/replayTypes';

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
/**
 * THE POLICY ARM, live. `PROPAGATE_BYE=0` attaches `doubleExitPropagateBye: false`, `PROPAGATE_BYE=1` attaches `true`,
 * unset attaches nothing — the same contract as `censusProgressionPolicy.test.ts`, which replays frozen windows only.
 * CA, 2026-10-08: the `doubleExitPropagateBye: false` arm must reach zero `STALLED_POSITION` before it is promoted, and
 * measuring that at scale needs schedules GENERATED under the policy: `generateSchedule` calls the engine, so a schedule
 * emitted without the policy is not the policy arm's schedule. Attached at generation and at replay alike, and recorded
 * on each emitted scenario so a frozen policy window replays under the policy it was emitted under.
 */
const propagateByeEnv = process.env.PROPAGATE_BYE;
const policyDefinitions =
  propagateByeEnv === '1' || propagateByeEnv === '0'
    ? { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: propagateByeEnv === '1' } }
    : undefined;

/** `revision` is the checkout that generated the schedule, so a frozen replay can name its source (census plan A6) */
type Scenario = {
  seed: number;
  config: any;
  steps?: any[];
  generationThrow?: string;
  policyDefinitions?: any;
  revision?: string;
};

/** Generate each seed's schedule against a fresh draw. */
function generateScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];
  const revision = harnessRevision() ?? undefined;
  for (let seed = seedStart; seed < seedStart + seedCount; seed++) {
    setSubscriptions({});
    const config = randomConfig(seed);
    const drawId = `sweep-${seed}`;
    try {
      if (!prepareDraw(config, drawId, policyDefinitions)) throw new Error(`could not prepare ${drawId}`);
      const steps = generateSchedule(config, drawId, maxSteps);
      scenarios.push({ seed, config, steps, ...(policyDefinitions ? { policyDefinitions } : {}), revision });
    } catch (err: any) {
      scenarios.push({ seed, config, generationThrow: String(err?.message ?? err), revision });
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
    // what the relational phase actually executed across the run: a count of schedules says nothing about it
    const coverage = emptyCoverage();
    const counts = emptyReplayCounts();
    const verdicts = { clean: 0, failed: 0, 'build-failed': 0 };
    let incompleteScenarios = 0;
    let failing = 0;
    const settleCounts: Record<string, number> = {};

    for (const scenario of scenarios) {
      const { seed, config } = scenario;
      setSubscriptions({});

      const scenarioPolicy = scenario.policyDefinitions ?? policyDefinitions;
      // what the settle passes cannot report through a result (Phase C): reported beside the verdict, never as one
      const settle: { step: number; site: string; kind: string; detail?: string }[] = [];
      const result = replay(config, scenario.steps ?? [], `sweep-${seed}`, scenarioPolicy, coverage, {
        preparationFailure: scenarioPreparationFailure(scenario),
        onStep: ({ index, observation }) => {
          for (const event of observation?.settleEvents ?? []) settle.push({ step: index, ...event });
        },
      });
      for (const event of settle) {
        const key = `${event.kind}:${event.site}`;
        settleCounts[key] = (settleCounts[key] ?? 0) + 1;
      }
      if (settle.length)
        fs.appendFileSync(outPath, JSON.stringify({ kind: 'SETTLE', seed, drawType: config.drawType, settle }) + '\n');
      addReplayCounts(counts, result.counts);
      verdicts[result.verdict] += 1;
      if (!result.complete) incompleteScenarios += 1;
      fs.appendFileSync(
        outPath,
        JSON.stringify({
          kind: 'REPLAY',
          seed,
          verdict: result.verdict,
          complete: result.complete,
          counts: result.counts,
          coverage: result.coverage,
        }) + '\n',
      );
      const failure = result.findings[0];
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
          // the relational probe completes the reproduction, and `changes` names what a round trip left behind
          ...(failure.probe ? { probe: failure.probe } : {}),
          ...(failure.changes ? { changes: failure.changes } : {}),
          ...findingLocation(failure),
          ...findingProvenance({ policyDefinitions: scenarioPolicy, sourceRevision: scenario.revision }),
          stepCount: scenario.steps?.length,
          config,
        }) + '\n',
      );
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({
        kind: 'SUMMARY',
        seedStart,
        seedCount,
        scenarios: scenarios.length,
        failing,
        byIssue,
        coverage,
        counts,
        verdicts,
        incompleteScenarios,
        settle: settleCounts,
      }) + '\n',
    );

    // The control: a census that scored no scenarios would report "0 failing" and read as good news.
    expect(scenarios.length).toEqual(seedCount);
  },
  1000 * 60 * 60 * 6,
);

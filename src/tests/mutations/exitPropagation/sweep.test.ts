import {
  fingerprint,
  generateSchedule,
  prepareDraw,
  randomConfig,
  replay,
  shrink,
} from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * At-scale randomized sweep. INERT unless `SWEEP=1`.
 *
 * The normal suite skips this in microseconds; it exists so the sweep can share the committed
 * oracles rather than a divergent copy of them — a second implementation of the harness would
 * drift from the one CI enforces, and then the two would disagree about what a finding is.
 *
 *   SWEEP=1 SEED_START=1 SEED_COUNT=5000 OUT=/tmp/sweep-0.jsonl npx vitest run src/tests/mutations/exitPropagation/sweep.test.ts
 *
 * Findings are shrunk before they are written and deduplicated by fingerprint, so the output is a
 * bug list rather than a log. Each line carries the config and the shrunk step list, which is a
 * complete reproduction.
 */

const enabled = process.env.SWEEP === '1';
const seedStart = Number(process.env.SEED_START ?? 1);
const seedCount = Number(process.env.SEED_COUNT ?? 200);
const maxSteps = Number(process.env.MAX_STEPS ?? 40);
const outPath = process.env.OUT ?? '/tmp/sweep.jsonl';

test.skipIf(!enabled)(
  `sweep ${seedStart}..${seedStart + seedCount - 1}`,
  () => {
    const seen = new Set<string>();
    let scenarios = 0;
    let findings = 0;

    for (let seed = seedStart; seed < seedStart + seedCount; seed++) {
      setSubscriptions({});
      const config = randomConfig(seed);
      const drawId = `sweep-${seed}`;
      scenarios++;

      // build the schedule against a live draw, then replay it from scratch so the finding is
      // reproducible from (config, steps) alone rather than from the generator's internal state
      let steps;
      try {
        prepareDraw(config, drawId);
        steps = generateSchedule(config, drawId, maxSteps);
      } catch (err: any) {
        // a throw during generation is itself a finding — record it verbatim
        const line = { kind: 'GENERATION_THROW', config, detail: String(err?.message ?? err) };
        fs.appendFileSync(outPath, JSON.stringify(line) + '\n');
        findings++;
        continue;
      }

      let failure;
      try {
        failure = replay(config, steps, drawId);
      } catch (err: any) {
        failure = { property: 'NO_EXCEPTION_ESCAPES', matchUpId: '-', detail: String(err?.message ?? err) };
      }
      if (!failure) continue;

      const shrunk = shrink(config, steps, drawId);
      const print = fingerprint(shrunk.config, failure, shrunk.steps);
      if (seen.has(print)) continue;
      seen.add(print);
      findings++;

      fs.appendFileSync(
        outPath,
        JSON.stringify({
          property: failure.property,
          detail: failure.detail,
          config: shrunk.config,
          steps: shrunk.steps,
          originalSteps: steps.length,
          fingerprint: print,
          seed,
        }) + '\n',
      );
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({ kind: 'SUMMARY', seedStart, seedCount, scenarios, uniqueFindings: findings }) + '\n',
    );
    expect(scenarios).toEqual(seedCount);
  },
  1000 * 60 * 60 * 6,
);

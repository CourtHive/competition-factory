import { addReplayCounts, emptyReplayCounts } from '@Tests/testHarness/exitPropagation/replayTypes';
import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * Direct `STALLED_POSITION` count over a window of schedules. INERT unless `STALL_COUNT=1`.
 *
 *   STALL_COUNT=1 SCHEDULES_IN=/tmp/emit.jsonl OUT=/tmp/stalls.jsonl [ALLOW_CHANGE_PROPAGATION=1] [PROPAGATE_BYE=0|1] \
 *     TZ=UTC npx vitest run src/tests/mutations/exitPropagation/stallCount.test.ts
 *
 * ## Why the census is not enough
 *
 * The census (`census.test.ts`) reports a seed's FIRST failing property, and counts a seed as failing only when
 * `getDrawInconsistencies` is `valid: false` — which `STALLED_POSITION`, a `warning` until its promotion, never makes
 * it. So the census cannot see a stall at all, and with the severity flipped locally it still hides a stall behind any
 * earlier failure. This replays every step of every schedule and asks the end state (`stallsAfterSchedule`), whatever
 * the severity.
 *
 * ## The arm
 *
 * Feed it schedules emitted IN THE ARM being counted (`CENSUS=1 SCHEDULES_OUT=…` with the same flags): the census's
 * `generateSchedule` calls the engine, so `allowChangePropagation` and the progression policy change the schedule
 * itself. `ALLOW_CHANGE_PROPAGATION=1` and `PROPAGATE_BYE` take the census's meaning; a scenario's own `arm: 'on'` or
 * `policyDefinitions` (the ratchet fixtures carry them) wins.
 *
 * One row per stalling seed, with the coordinate of each stalled matchUp, then a SUMMARY row.
 */

const enabled = process.env.STALL_COUNT === '1';
const schedulesIn = process.env.SCHEDULES_IN;
const outPath = process.env.OUT ?? '/tmp/stalls.jsonl';
// Large measurement batches opt into a longer budget without editing the checkout under test.
const timeout = Number(process.env.STALL_COUNT_TIMEOUT_MS ?? 3_600_000);
if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('Invalid STALL_COUNT_TIMEOUT_MS');
const allowChangePropagation = process.env.ALLOW_CHANGE_PROPAGATION === '1';
const propagateByeEnv = process.env.PROPAGATE_BYE;
const policyDefinitions =
  propagateByeEnv === '1' || propagateByeEnv === '0'
    ? { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: propagateByeEnv === '1' } }
    : undefined;

test.skipIf(!enabled)(
  `stall count ${schedulesIn}`,
  () => {
    const scenarios = fs
      .readFileSync(schedulesIn as string, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    const out: string[] = [];
    const counts = emptyReplayCounts();
    const verdicts = { clean: 0, failed: 0, 'build-failed': 0 };
    let incompleteScenarios = 0;
    let counted = 0;
    let stalling = 0;
    let instances = 0;
    for (const scenario of scenarios) {
      const result = replayStalls({
        allowChangePropagation: allowChangePropagation || scenario.arm === 'on',
        drawId: `stall-count-${scenario.seed}`,
        catchThrows: true,
        policyDefinitions,
        scenario,
      });
      addReplayCounts(counts, result.replay.counts);
      verdicts[result.replay.verdict] += 1;
      if (!result.replay.complete) incompleteScenarios += 1;
      out.push(
        JSON.stringify({
          kind: 'REPLAY',
          seed: scenario.seed,
          verdict: result.replay.verdict,
          complete: result.replay.complete,
          counts: result.replay.counts,
        }),
      );
      const stalls = result.stalls;
      if (!stalls) continue;
      counted += 1;
      if (!stalls.length) continue;
      stalling += 1;
      instances += stalls.length;
      const { drawType, drawSize, participantsCount } = scenario.config;
      out.push(
        JSON.stringify({
          seed: scenario.seed,
          ...(scenario.arm ? { arm: scenario.arm } : {}),
          size: `${drawSize}/${participantsCount}`,
          stalls,
          drawType,
        }),
      );
    }
    out.push(
      JSON.stringify({
        kind: 'SUMMARY',
        scenarios: scenarios.length,
        counted,
        stalling,
        instances,
        counts,
        verdicts,
        incompleteScenarios,
      }),
    );
    fs.writeFileSync(outPath, out.join('\n') + '\n');
    expect(counted).toBeGreaterThan(0);
  },
  timeout,
);

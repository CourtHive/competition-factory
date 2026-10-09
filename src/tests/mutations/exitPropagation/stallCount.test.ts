import { stallsAfterSchedule } from '@Tests/testHarness/exitPropagation/stallCount';
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
      .map((line) => JSON.parse(line))
      .filter((scenario) => scenario.steps);

    const out: string[] = [];
    let counted = 0;
    let stalling = 0;
    let instances = 0;
    for (const scenario of scenarios) {
      const stalls = stallsAfterSchedule({
        allowChangePropagation: allowChangePropagation || scenario.arm === 'on',
        drawId: `stall-count-${scenario.seed}`,
        catchThrows: true,
        policyDefinitions,
        scenario,
      });
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
    out.push(JSON.stringify({ kind: 'SUMMARY', scenarios: counted, stalling, instances }));
    fs.writeFileSync(outPath, out.join('\n') + '\n');
    expect(counted).toBeGreaterThan(0);
  },
  3_600_000,
);

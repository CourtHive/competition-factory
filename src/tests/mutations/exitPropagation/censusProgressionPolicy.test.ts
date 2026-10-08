import { replay, type ScenarioConfig, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * `doubleExitPropagateBye` ON, over a frozen census window. INERT unless `POLICY_CENSUS=1`.
 *
 *   POLICY_CENSUS=1 PROPAGATE_BYE=1 TZ=UTC \
 *     SCHEDULES_IN=../Mentat/fixtures/exit-propagation-census/sched-w2.jsonl \
 *     OUT=/tmp/policy-w2-on.jsonl \
 *     npx vitest run src/tests/mutations/exitPropagation/censusProgressionPolicy.test.ts
 *
 * Add `ALLOW_CHANGE_PROPAGATION=1` for that arm, exactly as the census takes it. Omit
 * `PROPAGATE_BYE` for the control described below.
 *
 * ## Why this exists: P30's number is stale and the obvious way to refresh it is barred
 *
 * Punch-list **P30** records the default flip as not shippable — 34 → 48 failing census seeds, 34 suite
 * failures across 12 files — measured **2026-09-19**, which predates #4983, #4985, #4987, #4988 and the
 * P39 work. The standing rule is to re-measure before trusting a recorded number.
 *
 * The obvious way to re-measure is to set the two policy reads in `doubleExitAdvancement` to `?? true`
 * and run the suite. That edits shared source to measure it, and it also measures the wrong thing for
 * the question being asked: **34 failures across 12 files is largely how many tests ENCODE the current
 * default**, not how much the behaviour breaks.
 *
 * This asks the behaviour question directly and without touching source: attach the policy the way a
 * consumer would — `policyDefinitions[POLICY_TYPE_PROGRESSION] = { doubleExitPropagateBye: true }`,
 * which is how `doubleExitPropagateBye.test.ts` already does it — and replay the frozen window.
 *
 * ## What the policy actually governs, which narrows the question
 *
 * CA, 2026-09-20, recorded in that test's docblock: *"doubleExitPropagateBye: true is ONLY referring to
 * connected structure propagation … because in the structure in which the doubleExit occurs there still
 * should be a produced exit."* Restated 2026-09-27. So the flag is a choice at ONE coordinate — the
 * loser target in the connected structure — between a **BYE** and a **second produced exit**. The
 * same-structure produced exit is unconditional and is not what `propagate` refers to.
 *
 * `handleLoserMatchUp` is that choice in code: `propagateBye || targetFedIn` takes
 * `advanceByeToLoserMatchUp`, and everything else falls through to `conditionallyAdvanceDrawPosition`
 * with a `walkoverWinningSide`.
 *
 * ## THE CONTROL, and it is the whole reason this instrument can be trusted
 *
 * Run with `PROPAGATE_BYE` unset, this must reproduce the census's own failing-seed count for the same
 * window and arm. It replays the same frozen bytes through the same `observeMutation` / `checkInvariants`
 * / `checkIntegrity` the census uses, so a divergence means this instrument is measuring something else
 * and its policy-ON number means nothing. Numbers to match on `dev` `6c3625b9e`:
 *
 *   sched-w1 off 24 · sched-w1 ON 21 · sched-w2 off 23 · sched-w2 ON 16
 *
 * `scenarios` and `stepsReplayed` are asserted for the same reason they are in the census: a replay that
 * measured nothing also reports zero failures.
 */
const enabled = process.env.POLICY_CENSUS === '1';
const schedulesIn = process.env.SCHEDULES_IN;
const outPath = process.env.OUT ?? '/tmp/census-progression-policy.jsonl';
/**
 * `PROPAGATE_BYE=1` attaches `true`, `PROPAGATE_BYE=0` attaches `false`, unset attaches nothing. Since
 * the default became `true` (2026-09-29) "unset" no longer means off, so the policy-OFF arm — the one a
 * consumer reaches by opting out, and the one `STALLED_POSITION` severity is measured against — needs
 * the explicit `0`.
 */
const propagateByeEnv = process.env.PROPAGATE_BYE;
const propagateBye = propagateByeEnv === '1';

type Scenario = { seed: number; config: ScenarioConfig; steps: Step[] };

/** attached exactly as `doubleExitPropagateBye.test.ts` attaches it — a consumer's own route */
const policyDefinitions =
  propagateByeEnv === '1' || propagateByeEnv === '0'
    ? { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: propagateBye } }
    : undefined;

test.skipIf(!enabled)(
  'doubleExitPropagateBye over a frozen window',
  () => {
    expect(schedulesIn, 'SCHEDULES_IN is required — this instrument only replays frozen bytes').toBeTruthy();
    const scenarios: Scenario[] = fs
      .readFileSync(schedulesIn as string, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    fs.writeFileSync(outPath, '');
    let replayed = 0;
    let failing = 0;
    const byIssue: Record<string, number> = {};

    for (const { seed, config, steps } of scenarios) {
      setSubscriptions({});
      const failure = replay(config, steps, `policy-${seed}`, policyDefinitions);
      replayed += 1;
      if (!failure) continue;
      failing += 1;
      byIssue[failure.property] = (byIssue[failure.property] ?? 0) + 1;
      fs.appendFileSync(
        outPath,
        JSON.stringify({ seed, drawType: config.drawType, property: failure.property, detail: failure.detail }) + '\n',
      );
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({ kind: 'SUMMARY', propagateBye, scenarios: scenarios.length, failing, byIssue }) + '\n',
    );
    process.stdout.write(
      `\npropagateBye=${propagateBye} scenarios=${scenarios.length} replayed=${replayed} failing=${failing}\n` +
        `byIssue=${JSON.stringify(byIssue)}\n`,
    );

    // controls — a replay that measured nothing also reports zero failures
    expect(scenarios.length).toBeGreaterThan(0);
    expect(replayed).toEqual(scenarios.length);
  },
  1_800_000,
);

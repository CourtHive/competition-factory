import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getInvariantViolations } from '@Tests/testHarness/exitPropagation/invariants';
import { prepareDraw, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * EVERY harness invariant violation at EVERY step of a frozen window. INERT unless `INVARIANT_SCAN=1`.
 *
 *   INVARIANT_SCAN=1 TZ=UTC SCHEDULES_IN=../Mentat/fixtures/exit-propagation-census/sched-w1.jsonl \
 *     OUT=/tmp/scan-w1-off.jsonl npx vitest run src/tests/mutations/exitPropagation/invariantScan.test.ts
 *
 * `ALLOW_CHANGE_PROPAGATION=1` selects the flag-ON arm, exactly as it does for the census.
 * `RULES=BYE_WON,BYE_WITH_WINNING_SIDE` narrows the output to named rules.
 *
 * ## Why this exists alongside `census.test.ts`
 *
 * The census stops at each seed's FIRST failure. That is the right unit for a before/after — it is
 * what makes "16 closed, 1 new" a statement about seeds — but it means any rule that fires AFTER
 * another property has already tripped is invisible to it, on every seed where something else goes
 * wrong first. **A census reporting zero of a rule is therefore not evidence that the rule never
 * fires.** Block D of the drawPositions/exit-cascade programme turned entirely on that distinction:
 * `BYE_WON` was the first failure of no seed on any of six arms, which said nothing on its own.
 *
 * This file answers the other question — does the rule fire ANYWHERE, at any step, on any seed —
 * and it is the cheap way to ask it, because `observeMutation` already computes the violations.
 * One row per (seed, rule, matchUp), first occurrence only: a violation persists on a matchUp until
 * something rewrites it, so re-reporting it on every subsequent step would bury the distinct ones.
 *
 * ## Measured with it, 2026-09-17, factory `dev` 2be7ec20f
 *
 * Six arms — `sched-w1`, `sched-w2` and `sched-de`, each on both propagation arms, 1,763 seeds:
 * ZERO `BYE_WON` and ZERO `BYE_WITH_WINNING_SIDE`. Exactly one rule fires across the whole corpus
 * (`UNDECIDED_WITH_SCORE`, DE seeds 9000184 and 9305697).
 *
 * That clean result is only evidence because it was FALSIFIED: with `correctResultsAwardedToTheBye`
 * suppressed in `assignDrawPositionBye`, the same scan reports `BYE_WON` on 44 seeds of the two
 * general windows (8/6 flag OFF/ON on w1, 15/15 on w2) and on 18/19 of the DE window, every one
 * DOUBLE_ELIMINATION. See `byeArrivesIntoPendingExit.test.ts`, which pins six of those as cases.
 */

const enabled = process.env.INVARIANT_SCAN === '1';
const schedulesIn = process.env.SCHEDULES_IN as string;
const outPath = process.env.OUT ?? '/tmp/invariantScan.jsonl';
const ruleFilter = new Set((process.env.RULES ?? '').split(',').filter(Boolean));

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

test.skipIf(!enabled)(
  'per-step invariant scan',
  () => {
    const scenarios = fs
      .readFileSync(schedulesIn, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    fs.writeFileSync(outPath, '');
    const byRule: Record<string, number> = {};
    const seedsByRule: Record<string, number[]> = {};

    for (const scenario of scenarios) {
      const { seed, config, steps } = scenario;
      if (!steps) continue;
      setSubscriptions({});
      const drawId = `scan-${seed}`;
      if (!prepareDraw(config, drawId)) continue;

      const reported = new Set<string>();
      let stepNumber = 0;
      for (const step of steps as Step[]) {
        stepNumber++;
        const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === key(step));
        // a step can name a matchUp this draw does not hold; skipping is what `replay` does too
        if (!target) continue;

        const observation = observeMutation({
          propagateExitStatus: config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        const violations = getInvariantViolations({
          drawDefinition: getDrawDefinition(drawId),
          matchUps: observation.matchUps,
        });

        for (const violation of violations) {
          if (ruleFilter.size && !ruleFilter.has(violation.rule)) continue;
          const dedupe = `${violation.rule}|${violation.matchUpId ?? violation.structureId}`;
          if (reported.has(dedupe)) continue;
          reported.add(dedupe);
          byRule[violation.rule] = (byRule[violation.rule] ?? 0) + 1;
          (seedsByRule[violation.rule] ??= []).push(seed);
          fs.appendFileSync(
            outPath,
            JSON.stringify({
              propagateExitStatus: config.propagateExitStatus,
              matchUpId: violation.matchUpId,
              drawType: config.drawType,
              detail: violation.detail,
              rule: violation.rule,
              stepKey: key(step),
              outcome: step.outcome,
              step: stepNumber,
              seed,
            }) + '\n',
          );
        }
      }
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({ kind: 'SUMMARY', scenarios: scenarios.length, byRule, seedsByRule }) + '\n',
    );

    // The control: a scan that replayed no scenarios would write an empty `byRule` and read as
    // good news. This is the same guard `census.test.ts` carries, and for the same reason.
    expect(scenarios.length).toBeGreaterThan(0);
  },
  1000 * 60 * 60 * 6,
);

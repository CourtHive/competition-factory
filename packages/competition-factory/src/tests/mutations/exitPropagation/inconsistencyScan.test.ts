import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * EVERY `getDrawInconsistencies` issueType at EVERY step of a frozen window. INERT unless
 * `INCONSISTENCY_SCAN=1`.
 *
 *   INCONSISTENCY_SCAN=1 TZ=UTC SCHEDULES_IN=../Mentat/fixtures/exit-propagation-census/sched-w1.jsonl \
 *     OUT=/tmp/inconsistency-w1-off.jsonl \
 *     npx vitest run src/tests/mutations/exitPropagation/inconsistencyScan.test.ts
 *
 * `ALLOW_CHANGE_PROPAGATION=1` selects the flag-ON arm, exactly as it does for the census.
 * `ISSUES=EXIT_WITHOUT_LOSER,DROPPED_PROGRESSION` narrows the output to named issueTypes.
 *
 * ## Why this exists alongside `census.test.ts` and `invariantScan.test.ts`
 *
 * `invariantScan` is the same instrument for the HARNESS invariants in `invariants.ts`. This is its
 * sibling for the ENGINE's own integrity detector, and the two cover different rules by design —
 * `invariants.ts` exists precisely because `getDrawInconsistencies` does not police those shapes.
 *
 * The census stops at each seed's FIRST failure, so a `DRAW_INCONSISTENCY` that would have been
 * reported on a seed where something else trips first is invisible to it. **A census reporting zero
 * of an issueType is therefore not evidence that the issueType never occurs.**
 *
 * ## The question it was written for, and why the direction matters
 *
 * Several detectors in `getStructureInconsistencies` and `getDrawInconsistencies` are EXEMPTED by
 * `isPropagatedExit`, which is a PRESENCE read over `sideExitProvenance` — `EXIT_WITHOUT_LOSER` and
 * `DROPPED_PROGRESSION` both consult it. Any change that makes provenance survive in MORE places
 * therefore makes more matchUps read as propagation-produced, and **suppresses findings**. That is
 * indistinguishable from a fix if you only count issues going down.
 *
 * So this scan is to be diffed in BOTH directions: an issueType that STOPS firing is a candidate
 * suppression and has to be explained, not banked. `WINNER_NOT_ADVANCED` and
 * `WINNING_SIDE_ADVANCEMENT_MISMATCH` consult no provenance at all and are the control — they
 * cannot be suppressed this way, so a change in them is a real behaviour change.
 */

const enabled = process.env.INCONSISTENCY_SCAN === '1';
const schedulesIn = process.env.SCHEDULES_IN as string;
const outPath = process.env.OUT ?? '/tmp/inconsistencyScan.jsonl';
const issueFilter = new Set((process.env.ISSUES ?? '').split(',').filter(Boolean));

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

test.skipIf(!enabled)(
  'per-step draw-inconsistency scan',
  () => {
    const scenarios = fs
      .readFileSync(schedulesIn, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    fs.writeFileSync(outPath, '');
    const byIssue: Record<string, number> = {};
    const seedsByIssue: Record<string, number[]> = {};
    let stepsApplied = 0;

    for (const scenario of scenarios) {
      const { seed, config, steps } = scenario;
      if (!steps) continue;
      setSubscriptions({});
      const drawId = `inconsistency-${seed}`;
      if (!prepareDraw(config, drawId)) continue;

      const reported = new Set<string>();
      let stepNumber = 0;
      for (const step of steps as Step[]) {
        stepNumber++;
        const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === key(step));
        // a step can name a matchUp this draw does not hold; skipping is what `replay` does too
        if (!target) continue;

        observeMutation({
          propagateExitStatus: config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        stepsApplied++;

        const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
        // matchUpIds are fresh UUIDs per generated draw AND per process, so a finding keyed on one
        // cannot be compared between two trees — every row reads as both "stopped" and "started"
        // firing. The structural coordinate is what survives, so it is emitted alongside.
        const coordinate = new Map<string, string>(getDrawMatchUps(drawId).map((m: any) => [m.matchUpId, key(m)]));
        for (const entry of integrity?.inconsistencies ?? []) {
          if (issueFilter.size && !issueFilter.has(entry.issueType)) continue;
          // first occurrence only: an inconsistency persists on a matchUp until something rewrites
          // it, so re-reporting it every subsequent step would bury the distinct ones
          const dedupe = `${entry.issueType}|${entry.matchUpId ?? entry.structureId}`;
          if (reported.has(dedupe)) continue;
          reported.add(dedupe);
          byIssue[entry.issueType] = (byIssue[entry.issueType] ?? 0) + 1;
          (seedsByIssue[entry.issueType] ??= []).push(seed);
          fs.appendFileSync(
            outPath,
            JSON.stringify({
              matchUpKey: coordinate.get(entry.matchUpId) ?? null,
              propagateExitStatus: config.propagateExitStatus,
              matchUpId: entry.matchUpId,
              issueType: entry.issueType,
              drawType: config.drawType,
              message: entry.message,
              stepKey: key(step),
              step: stepNumber,
              seed,
            }) + '\n',
          );
        }
      }
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({ kind: 'SUMMARY', scenarios: scenarios.length, stepsApplied, byIssue, seedsByIssue }) + '\n',
    );

    // TWO controls. A scan that replayed no scenarios would write an empty `byIssue` and read as
    // good news; so would one that replayed them and applied no steps, which is the failure mode a
    // scenario-count check alone does not catch.
    expect(scenarios.length).toBeGreaterThan(0);
    expect(stepsApplied).toBeGreaterThan(0);
  },
  1000 * 60 * 60 * 6,
);

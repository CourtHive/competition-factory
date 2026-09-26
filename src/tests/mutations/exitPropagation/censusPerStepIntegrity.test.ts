import { observeMutation, getDrawMatchUps, getDrawDefinition } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, type ScenarioConfig, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * PER-STEP DRAW INTEGRITY over a frozen census window. INERT unless `PER_STEP_INTEGRITY=1`.
 *
 *   PER_STEP_INTEGRITY=1 TZ=UTC \
 *     SCHEDULES_IN=../Mentat/fixtures/exit-propagation-census/sched-w2.jsonl \
 *     OUT=/tmp/per-step-w2.jsonl \
 *     npx vitest run src/tests/mutations/exitPropagation/censusPerStepIntegrity.test.ts
 *
 * Add `ALLOW_CHANGE_PROPAGATION=1` for the other arm, exactly as the census takes it.
 *
 * ## Why this exists, and why it is a SEPARATE instrument rather than a change to `replay`
 *
 * `replay` calls `checkIntegrity` **once, after the whole schedule** (`sweep.ts`). So an
 * inconsistency that appears at step 5 and is overwritten by step 9 is invisible to the census: the
 * seed is reported as clean, and it IS clean at the end. That blind spot is punch-list **P28**, and
 * P28 also records why the obvious fix is not allowed — *"making it per-step would re-baseline the
 * census"*, which would invalidate every number in
 * `Mentat/fixtures/exit-propagation-census/README.md` and every A/B taken against them.
 *
 * This instrument therefore reads the same frozen bytes and replays them the same way, but reports
 * a DIFFERENT measurement alongside the census rather than inside it. The census keeps its baseline;
 * this answers the question the census structurally cannot.
 *
 * ## What it is for: **P29**
 *
 * P29 is *a produced WALKOVER is awarded to the side that CARRIES the exit*. Its cited reproduction
 * is seed **9100426** on `sched-w2` with the flag ON, where `Consolation|4|1` becomes `WALKOVER ws=2`
 * at step 5 — correct — and `ws=1` at step 9, which awards the match to the side whose provenance
 * says it exited. #4988 fixed a different mechanism (the side was mis-identified at the moment of
 * writing); this one is a LATER FLIP and belongs to winner-change progression (**P18**, **P3**).
 *
 * A flip like that survives to the end only if nothing overwrites it. When something does, the
 * census sees nothing — which is exactly why P29's own reproduction could not be confirmed from
 * census output.
 *
 * ## Output
 *
 * One JSONL record per (seed, step) at which `getDrawInconsistencies` reports `valid: false`, plus a
 * per-seed record saying whether the last step was clean. Read together they separate:
 *
 *  - **TRANSIENT** — findings appear mid-schedule and the final state is clean. Invisible to the
 *    census. This is the class P29 lives in.
 *  - **PERSISTENT** — findings still present at the last step. The census sees these already.
 *
 * Controls, asserted rather than printed: the window must yield scenarios, and those scenarios must
 * yield steps. A run that replays nothing also reports zero findings.
 */
const enabled = process.env.PER_STEP_INTEGRITY === '1';
const schedulesIn = process.env.SCHEDULES_IN;
const outPath = process.env.OUT ?? '/tmp/per-step-integrity.jsonl';
const watchOnly = process.env.WATCH_SEED ? Number(process.env.WATCH_SEED) : undefined;

/** the same coordinate key `replay` resolves a frozen step by — `sweep.ts` keeps it private */
const structuralKey = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;

type Scenario = { seed: number; config: ScenarioConfig; steps: Step[] };

const readWindow = (path: string): Scenario[] =>
  fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((s: Scenario) => watchOnly === undefined || s.seed === watchOnly);

const inconsistenciesNow = (drawId: string) => {
  const drawDefinition = getDrawDefinition(drawId);
  const integrity: any = getDrawInconsistencies({ drawDefinition, drawId });
  return integrity?.valid === false ? (integrity.inconsistencies ?? []) : [];
};

test.skipIf(!enabled)(
  'per-step draw integrity over a frozen window',
  () => {
    expect(schedulesIn, 'SCHEDULES_IN is required — this instrument only replays frozen bytes').toBeTruthy();
    const scenarios = readWindow(schedulesIn as string);
    fs.writeFileSync(outPath, '');

    let stepsReplayed = 0;
    let seedsWithAnyFinding = 0;
    let transientSeeds = 0;
    let persistentSeeds = 0;
    const issueTypesSeen: Record<string, number> = {};

    for (const scenario of scenarios) {
      const { seed, config, steps } = scenario;
      setSubscriptions({});
      const drawId = `perstep-${seed}`;
      if (!prepareDraw(config, drawId)) continue;

      const perStep: { step: number; key: string; issueTypes: string[] }[] = [];

      for (const [index, step] of steps.entries()) {
        const matchUps = getDrawMatchUps(drawId);
        const target = matchUps.find((matchUp: any) => structuralKey(matchUp) === structuralKey(step));
        if (!target) continue;
        // the generator's own scoreability predicate, character for character — see `replay`
        if ((target.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;

        observeMutation({
          propagateExitStatus: config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        stepsReplayed += 1;

        const found = inconsistenciesNow(drawId);
        if (found.length) {
          const issueTypes = found.map((i: any) => i.issueType);
          for (const issueType of issueTypes) bump(issueTypesSeen, issueType);
          perStep.push({ step: index + 1, key: structuralKey(step), issueTypes });
          fs.appendFileSync(
            outPath,
            JSON.stringify({
              kind: 'FINDING',
              seed,
              drawType: config.drawType,
              drawSize: config.drawSize,
              participantsCount: config.participantsCount,
              propagateExitStatus: config.propagateExitStatus,
              step: index + 1,
              of: steps.length,
              scored: structuralKey(step),
              outcome: step.outcome,
              inconsistencies: found,
            }) + '\n',
          );
        }
      }

      if (!perStep.length) continue;
      seedsWithAnyFinding += 1;
      const stillDirtyAtEnd = inconsistenciesNow(drawId).length > 0;
      if (stillDirtyAtEnd) persistentSeeds += 1;
      else transientSeeds += 1;

      fs.appendFileSync(
        outPath,
        JSON.stringify({
          kind: 'SEED',
          seed,
          drawType: config.drawType,
          verdict: stillDirtyAtEnd ? 'PERSISTENT' : 'TRANSIENT',
          firstStep: perStep[0].step,
          lastStep: perStep.at(-1)?.step,
          steps: steps.length,
          issueTypes: [...new Set(perStep.flatMap((p) => p.issueTypes))],
        }) + '\n',
      );
    }

    process.stdout.write(
      `\nscenarios=${scenarios.length} stepsReplayed=${stepsReplayed}\n` +
        `seedsWithAnyFinding=${seedsWithAnyFinding} transient=${transientSeeds} persistent=${persistentSeeds}\n` +
        `issueTypes=${JSON.stringify(issueTypesSeen)}\n`,
    );

    // controls — a run that replayed nothing also reports zero findings
    expect(scenarios.length).toBeGreaterThan(0);
    expect(stepsReplayed).toBeGreaterThan(0);
  },
  1_800_000,
);

function bump(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

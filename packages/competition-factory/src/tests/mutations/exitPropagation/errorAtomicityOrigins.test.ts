import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  hash,
} from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, type Step } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, test } from 'vitest';
import fs from 'fs';

/**
 * WHERE an error-over-a-mutated-draw comes from, and WHAT it changed. INERT unless `ORIGINS=1`.
 *
 *   ORIGINS=1 TZ=UTC SCHEDULES_IN=../Mentat/fixtures/exit-propagation-census/sched-w1.jsonl \
 *     OUT=/tmp/origins.jsonl npx vitest run \
 *     src/tests/mutations/exitPropagation/errorAtomicityOrigins.test.ts
 *   (add ALLOW_CHANGE_PROPAGATION=1 for the second arm)
 *
 * `census.test.ts` reports THAT a seed violates ERROR_IMPLIES_NO_MUTATION. This reports where the
 * refusal was raised and which matchUps the draw changed before it — which is the difference
 * between knowing a class exists and being able to fix it.
 *
 * Every defect closed in this programme on 2026-09-15/16 was found this way and not otherwise:
 *  - the squatting propagation BYE, by seeing the blocked target's occupants;
 *  - the DOUBLE_ELIMINATION TypeError, by capturing a stack instead of a returned error;
 *  - the source-write ordering, by seeing that the recorded difference was the SOURCE matchUp.
 *
 * Two things it does that a naive probe does not, both learned the expensive way:
 *
 * 1. IT REPORTS THE STACK. `decorateResult` accumulates frames, so `result.stack` names the
 *    refusing function. Without it you get an error code and a guess.
 * 2. IT CATCHES THE CAUGHT ONES. The engine wraps method invocation in try/catch outside
 *    devContext, so an internal TypeError is RETURNED as `result.error`, not thrown. A probe that
 *    only catches exceptions reports a clean run while the engine is crashing. That is how the
 *    `.includes` TypeError hid — 300 shapes in the propagateExitStatus:false sweep population.
 */

const enabled = process.env.ORIGINS === '1';
const outPath = process.env.OUT ?? '/tmp/errorAtomicityOrigins.jsonl';
const schedulesIn = process.env.SCHEDULES_IN;

const structuralKey = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

/** Compact per-matchUp projection, enough to see what a cascade touched. */
const project = (drawId: string): Map<string, string> =>
  new Map(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      matchUp.matchUpId,
      `${structuralKey(matchUp)} status=${matchUp.matchUpStatus ?? '-'} ws=${matchUp.winningSide ?? '-'} dp=${JSON.stringify(matchUp.drawPositions)}`,
    ]),
  );

test.skipIf(!enabled)(
  'origins of errors returned over a mutated draw',
  () => {
    const scenarios = fs
      .readFileSync(schedulesIn as string, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    fs.writeFileSync(outPath, '');
    let steps = 0;
    let findings = 0;

    for (const scenario of scenarios) {
      setSubscriptions({});
      const drawId = `origins-${scenario.seed}`;
      prepareDraw(scenario.config, drawId);

      let stepNumber = 0;
      for (const step of (scenario.steps ?? []) as Step[]) {
        stepNumber++;
        const target = getDrawMatchUps(drawId).find((matchUp: any) => structuralKey(matchUp) === structuralKey(step));
        if (!target) continue;

        const before = hash(getDrawDefinition(drawId));
        const beforeProjection = project(drawId);
        const observation = observeMutation({
          propagateExitStatus: scenario.config.propagateExitStatus,
          matchUpId: target.matchUpId,
          outcome: step.outcome,
          drawId,
        });
        steps++;

        const errored = observation.error ?? observation.thrown;
        if (!errored) continue;
        if (hash(getDrawDefinition(drawId)) === before) continue; // a clean refusal is not a finding

        const afterProjection = project(drawId);
        const changed: string[] = [];
        for (const [matchUpId, row] of afterProjection) {
          const was = beforeProjection.get(matchUpId);
          if (was && was !== row) changed.push(`${was}  ->  ${row}`);
        }

        findings++;
        fs.appendFileSync(
          outPath,
          JSON.stringify({
            seed: scenario.seed,
            drawType: scenario.config.drawType,
            config: scenario.config,
            step: stepNumber,
            target: structuralKey(step),
            targetWas: { matchUpStatus: target.matchUpStatus ?? null, winningSide: target.winningSide ?? null },
            outcome: step.outcome,
            // `thrown` only populates inside devContext; otherwise the engine returns the TypeError.
            error: observation.error ?? null,
            thrown: observation.thrown ?? null,
            stack: (observation.result as any)?.stack ?? null,
            changedMatchUps: changed,
            // The first row is very often the SOURCE matchUp — which is the whole diagnosis.
            sourceWasChanged: changed.some((row) => row.startsWith(structuralKey(step))),
          }) + '\n',
        );
        break; // one finding per seed: the FIRST is the one a fix must address
      }
    }

    fs.appendFileSync(
      outPath,
      JSON.stringify({ kind: 'SUMMARY', scenarios: scenarios.length, steps, findings }) + '\n',
    );
    // The control: a run that replayed nothing would report zero findings and read as good news.
    expect(steps).toBeGreaterThan(0);
  },
  1000 * 60 * 60,
);

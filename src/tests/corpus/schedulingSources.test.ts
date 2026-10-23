import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { recordScheduling } from '../testHarness/corpus/schedulingSources';
import { applyPatch } from '../testHarness/corpus/applyPatch';
import { afterEach, expect, it } from 'vitest';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Golden corpus § 5 for the scheduling pipeline. Each authored scenario claims the scheduling step properties, and the
 * writer refuses one whose scheduler breaks them; its `finalState` claims are the rule it pins. A scenario with a
 * `knownFailure` pins today's behaviour of a recorded defect: its claims are expected to FAIL, and the day they pass
 * the defect is fixed and the scenario loses its `knownFailure` in the same PR.
 */
let outDir = '';
afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

it('every scheduling scenario writes, replays both ways, and holds its claims (known failures fail theirs)', () => {
  outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-scheduling-'));
  const { written, failed } = recordScheduling({ outDir });
  expect(failed).toEqual([]);
  expect(written.length).toBeGreaterThanOrEqual(7);

  for (const { scenario, knownFailure, finalState, expectedErrors = {} } of written) {
    const id = scenario.scenarioId;
    expect({ id, reader: replayAsReader(scenario) }).toEqual({ id, reader: [] });
    expect({ id, engine: replayThroughEngine(scenario) }).toEqual({ id, engine: [] });
    // the steps refused are exactly those the scenario expects, with their codes; every other step succeeded
    const errors = Object.fromEntries(
      scenario.steps.flatMap((step: any, index: number) => (step.result.error ? [[index, step.result.error]] : [])),
    );
    expect({ id, errors }).toEqual({ id, errors: expectedErrors });
    // every scheduling call that succeeded records its deferral report
    for (const step of scenario.steps)
      if (!step.result.error && ['scheduleProfileRounds', 'scheduleMatchUps'].includes(step.directive.method))
        expect({ id, value: typeof step.result.value }).toEqual({ id, value: 'object' });

    if (!finalState) continue;
    const record = scenario.steps.reduce(
      (state: any, step: any) => applyPatch(state, step.patch),
      scenario.initial.record,
    );
    const failedClaims = finalState(
      record,
      scenario.steps.map((step: any) => step.result.value),
    );
    if (knownFailure)
      expect({ id, defectStillPresent: failedClaims.length > 0 }).toEqual({ id, defectStillPresent: true });
    else expect({ id, failedClaims }).toEqual({ id, failedClaims: [] });
  }
});

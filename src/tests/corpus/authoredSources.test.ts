import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { recordAuthored } from '../testHarness/corpus/authoredSources';
import { applyPatch } from '../testHarness/corpus/applyPatch';
import { setRandomSource } from '@Tools/prng';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * C4c. Each authored scenario pins a rule the outcome-pipeline spec states; the expected result
 * codes are the claim. A '?' expectation is a rule the spec leaves UNPINNED: whatever the engine
 * does is recorded and printed, not asserted, so the next revision of the page can state it.
 */
let outDir = '';
afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

it('every authored scenario writes, replays both ways, and the engine answers as the spec says', () => {
  outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-authored-'));
  const { written, failed } = recordAuthored({ outDir });
  expect(failed).toEqual([]);
  expect(written.length).toBeGreaterThanOrEqual(8);

  const unpinned: string[] = [];
  for (const { scenario, expected, finalState } of written) {
    expect({ id: scenario.scenarioId, reader: replayAsReader(scenario) }).toEqual({
      id: scenario.scenarioId,
      reader: [],
    });
    expect({ id: scenario.scenarioId, engine: replayThroughEngine(scenario) }).toEqual({
      id: scenario.scenarioId,
      engine: [],
    });
    const actual = scenario.steps.map((s: any) => s.result.error ?? 'ok');
    const asserted = expected.map((e, i) => (e === '?' ? actual[i] : e));
    expected.forEach((e, i) => e === '?' && unpinned.push(`${scenario.scenarioId} step ${i}: ${actual[i]}`));
    expect({ id: scenario.scenarioId, results: actual }).toEqual({ id: scenario.scenarioId, results: asserted });
    if (finalState) {
      const record = scenario.steps.reduce(
        (state: any, step: any) => applyPatch(state, step.patch),
        scenario.initial.record,
      );
      expect({ id: scenario.scenarioId, failedClaims: finalState(record) }).toEqual({
        id: scenario.scenarioId,
        failedClaims: [],
      });
    }
    // the second application of a double exit is a no-op: the step's patch is empty
    if (scenario.scenarioId.endsWith('double-exit-idempotent')) expect(scenario.steps[1].patch).toEqual([]);
  }
  if (unpinned.length) process.stdout.write(`corpus:authored UNPINNED observed:\n  ${unpinned.join('\n  ')}\n`);
});

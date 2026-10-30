import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { queueScenarios, recordQueue } from '../testHarness/corpus/queueSources';
import { afterEach, expect, it } from 'vitest';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * The `queue` corpus source: every scenario writes, each step answers as stated, the queue's rollback is recorded,
 * and the scenario replays both ways (as a reader of its patches, and through the engine).
 */
let outDir = '';
afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

const byId = (written: any[], scenarioId: string) =>
  written.find(({ scenario }) => scenario.scenarioId === scenarioId).scenario;

it('every queue scenario writes, answers as stated, and replays both ways', () => {
  outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-queue-'));
  const { written, failed } = recordQueue({ outDir });
  expect(failed).toEqual([]);
  expect(written.length).toEqual(queueScenarios().length);

  for (const { scenario, expected } of written) {
    const id = scenario.scenarioId;
    const results = scenario.steps.map(({ result }: any) => (result.success ? true : result.error));
    expect({ id, results }).toEqual({ id, results: expected });
    expect({ id, reader: replayAsReader(scenario) }).toEqual({ id, reader: [] });
    expect({ id, engine: replayThroughEngine(scenario) }).toEqual({ id, engine: [] });
  }

  // a rolled-back queue leaves the record exactly as it was; one that keeps its writes does not
  const rolledBack = byId(written, 'queue/refusal-rolls-back');
  expect(rolledBack.steps[0].result.context).toEqual({ rolledBack: true });
  expect(rolledBack.steps[0].hash).toEqual(rolledBack.initial.hash);
  const kept = byId(written, 'queue/refusal-keeps-earlier-writes');
  expect(kept.steps[0].result.context).toEqual({ rolledBack: false });
  expect(kept.steps[0].hash).not.toEqual(kept.initial.hash);
  const unknown = byId(written, 'queue/unknown-method-refused-before-any-runs');
  expect(unknown.steps[0].hash).toEqual(unknown.initial.hash);
  const between = byId(written, 'queue/one-queue-after-another');
  expect(between.steps[1].hash).toEqual(between.steps[0].hash);
});

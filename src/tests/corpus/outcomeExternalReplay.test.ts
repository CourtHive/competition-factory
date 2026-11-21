import { appendFileSync, createReadStream, globSync, writeFileSync } from 'node:fs';
import { replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { setOutcomePipeline } from '@Global/state/globalState';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { it } from 'vitest';
// constants and types
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';
type CorpusEntry = { scenarioId: string; steps: unknown[] };
type Replay = ReturnType<typeof replayThroughEngine> | { exception: string };
type Difference = {
  file: string;
  scenarioId: string;
  disagreement: boolean;
  v1: Replay;
  v2: Replay;
  differential: Replay;
};

function replay(scenario: CorpusEntry, mode: OutcomePipelineMode): Replay {
  setOutcomePipeline(mode);
  try {
    return replayThroughEngine(structuredClone(scenario));
  } catch (error) {
    return { exception: error instanceof Error ? error.message : String(error) };
  }
}

it.skipIf(!process.env.OUTCOME_EXTERNAL_CORPUS)(
  'compares public corpus result codes and step hashes in all three outcome modes',
  async () => {
    const root = resolve(process.env.OUTCOME_EXTERNAL_CORPUS ?? '.corpus-out');
    const pattern = process.env.OUTCOME_EXTERNAL_CORPUS_GLOB ?? '**/*.jsonl';
    const files = globSync(pattern, { cwd: root, exclude: ['**/_*.jsonl', 'grammar/**', 'scoring/**'] }).sort();
    const details = process.env.OUTCOME_EXTERNAL_REPLAY_DETAILS;
    if (details) writeFileSync(details, '');
    const totals = { scenarios: 0, steps: 0, disagreements: 0, commonDrift: 0 };
    const differences: Difference[] = [];
    try {
      for (const file of files) {
        const lines = createInterface({ input: createReadStream(resolve(root, file)), crlfDelay: Infinity });
        for await (const line of lines) {
          if (!line.trim()) continue;
          const scenario: CorpusEntry = JSON.parse(line);
          totals.scenarios++;
          totals.steps += scenario.steps.length;
          const v1 = replay(scenario, OUTCOME_PIPELINE_V1);
          const v2 = replay(scenario, OUTCOME_PIPELINE_V2);
          const differential = replay(scenario, OUTCOME_PIPELINE_DIFFERENTIAL);
          const disagreement = !isDeepStrictEqual(v1, v2) || !isDeepStrictEqual(v2, differential);
          if (disagreement) totals.disagreements++;
          else if (!Array.isArray(v2) || v2.length) totals.commonDrift++;
          else continue;
          const difference = { file, scenarioId: scenario.scenarioId, disagreement, v1, v2, differential };
          if (differences.length < 10) differences.push(difference);
          if (details) appendFileSync(details, JSON.stringify(difference) + '\n');
        }
      }
    } finally {
      setOutcomePipeline();
    }
    if (!totals.scenarios) throw new Error(`No scenarios found under ${root}`);
    const output = process.env.OUTCOME_EXTERNAL_REPLAY_JSON;
    if (output) writeFileSync(output, JSON.stringify({ totals, differences }, null, 2) + '\n');
    process.stdout.write(JSON.stringify(totals) + '\n');
  },
  43_200_000,
);

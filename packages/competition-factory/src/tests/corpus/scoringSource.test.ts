import { SCORING_FORMATS, STREAMS, recordScoring, replayScoring } from '../testHarness/corpus/scoringSource';
import { replayAsReader } from '../testHarness/corpus/replayScenario';
import { setRandomSource } from '@Tools/prng';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';
import addFormats from 'ajv-formats';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Ajv from 'ajv';

/**
 * C4b. Seeded point streams through the scoring engine, per format and bias, with the observable
 * recorded at every point. Each scenario must validate, read back, and recompute to the same
 * values by chaining createMatchUp and addPoint. With `CORPUS_OUT` set (`pnpm corpus:scoring`)
 * the output is kept.
 */
const schema = JSON.parse(fs.readFileSync('./corpus/corpus.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

let outDir = '';
afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

it(
  'records every format and stream, and each scenario validates, reads back and recomputes',
  { timeout: 120_000 },
  () => {
    outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-scoring-'));
    const { scenarios, summary } = recordScoring({ outDir });
    expect(summary.scenarios).toEqual(SCORING_FORMATS.length * STREAMS.length * 3);
    process.stdout.write(`corpus:scoring ${JSON.stringify(summary)}\n`);

    for (const scenario of scenarios) {
      const ok = validate(scenario);
      if (!ok) console.log(scenario.scenarioId, ajv.errorsText(validate.errors));
      expect({ id: scenario.scenarioId, valid: ok }).toEqual({ id: scenario.scenarioId, valid: true });
      expect(replayAsReader(scenario)).toEqual([]);
      expect({ id: scenario.scenarioId, scoring: replayScoring(scenario) }).toEqual({
        id: scenario.scenarioId,
        scoring: [],
      });
    }
    // every set-based format completes within the cap under every stream
    expect(summary.capped).toEqual(0);
    // a point after the end changes nothing (it did, in all 72 streams, until addPoint guarded completion)
    expect(summary.postCompletionChanged).toEqual(0);
    expect(new Set(scenarios.map((s) => s.scenarioId)).size).toEqual(scenarios.length);
  },
);

it('is byte-identical when written twice', () => {
  const a = fs.mkdtempSync(path.join(tmpdir(), 'corpus-scoring-'));
  const b = fs.mkdtempSync(path.join(tmpdir(), 'corpus-scoring-'));
  recordScoring({ outDir: a, seeds: [7] });
  recordScoring({ outDir: b, seeds: [7] });
  expect(fs.readFileSync(path.join(a, 'scoring.jsonl'), 'utf8')).toEqual(
    fs.readFileSync(path.join(b, 'scoring.jsonl'), 'utf8'),
  );
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});

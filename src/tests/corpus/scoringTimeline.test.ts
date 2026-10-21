import { timelineScenarios } from '../testHarness/corpus/scoringScenariosTimeline';
import { replayScoringScenario } from '../testHarness/corpus/scoringScenarios';
import { replayAsReader } from '../testHarness/corpus/replayScenario';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import path from 'node:path';
import fs from 'node:fs';
import Ajv from 'ajv';

/**
 * SE3. The scoring engine class as a corpus source: the authored timeline scenarios (every action type,
 * every correction, save/load/rebuild) and one scenario per refused matrix cell. Each must validate,
 * read back, and recompute to the same results through a new engine. With `CORPUS_OUT` set
 * (`pnpm corpus:scoring`) they are written to `timeline.jsonl`, beside the seeded streams, and the
 * manifest pins them.
 */
const schema = JSON.parse(fs.readFileSync('./corpus/corpus.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

describe('scoring corpus: the timeline through the class', () => {
  it('records every timeline scenario, and each validates, reads back and recomputes', () => {
    const scenarios = timelineScenarios();
    for (const scenario of scenarios) {
      const valid = validate(scenario);
      expect({ id: scenario.scenarioId, valid, errors: valid ? '' : ajv.errorsText(validate.errors) }).toEqual({
        id: scenario.scenarioId,
        valid: true,
        errors: '',
      });
      expect(replayAsReader(scenario)).toEqual([]);
      expect({ id: scenario.scenarioId, replay: replayScoringScenario(scenario) }).toEqual({
        id: scenario.scenarioId,
        replay: [],
      });
    }
    expect(new Set(scenarios.map((scenario) => scenario.scenarioId)).size).toEqual(scenarios.length);

    const outDir = process.env.CORPUS_OUT;
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      const lines = scenarios.map((scenario) => JSON.stringify(scenario) + '\n').join('');
      fs.writeFileSync(path.join(outDir, 'timeline.jsonl'), lines);
    }
  });

  it('is byte-identical when written twice', () => {
    expect(JSON.stringify(timelineScenarios())).toEqual(JSON.stringify(timelineScenarios()));
  });
});

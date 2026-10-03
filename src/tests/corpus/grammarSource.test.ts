import { EDGE_CODES, grammarInputs, recordGrammar, replayGrammar } from '../testHarness/corpus/grammarSource';
import { replayAsReader } from '../testHarness/corpus/replayScenario';
import { afterEach, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import Ajv from 'ajv';

/**
 * C4a. The grammar as a direct source: every fixture format, every format the harvest contains,
 * and the edge codes, four steps each with the return value recorded. Each scenario must validate
 * against the corpus schema, read back (the reader ignores values; patches are empty), and
 * recompute to the same values. With `CORPUS_OUT` set (`pnpm corpus:grammar`) the output is kept.
 */
const schema = JSON.parse(fs.readFileSync('./corpus/corpus.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);

let outDir = '';
afterEach(() => {
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

it('writes every grammar input as a scenario that validates, reads back and recomputes', () => {
  outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-grammar-'));
  // The harvest (every format the recorded corpus holds) is OPT-IN: it depends on whatever recording
  // sits in `.corpus-out`, so the hash manifest built from this source moved with the contents of a
  // worktree. `corpus:verify` asks for it; `corpus:grammar`, which the manifest gate runs, does not.
  const harvest =
    process.env.CORPUS_OUT && process.env.CORPUS_GRAMMAR_HARVEST ? path.dirname(process.env.CORPUS_OUT) : undefined;
  const inputs = grammarInputs(harvest);
  expect(inputs.length).toBeGreaterThanOrEqual(22 + EDGE_CODES.length - 6); // overlaps between the lists
  const scenarios = recordGrammar({ outDir, harvestDir: harvest });
  expect(scenarios).toHaveLength(inputs.length);

  for (const scenario of scenarios) {
    const ok = validate(scenario);
    if (!ok) console.log(scenario.scenarioId, ajv.errorsText(validate.errors));
    expect({ id: scenario.scenarioId, valid: ok }).toEqual({ id: scenario.scenarioId, valid: true });
    expect(replayAsReader(scenario)).toEqual([]);
    expect({ id: scenario.scenarioId, grammar: replayGrammar(scenario) }).toEqual({
      id: scenario.scenarioId,
      grammar: [],
    });
  }

  const byTag = (tag: string) => scenarios.filter((s) => s.tags.includes(tag)).length;
  process.stdout.write(
    `corpus:grammar ${JSON.stringify({ inputs: inputs.length, canonical: byTag('canonical'), nonCanonical: byTag('non-canonical'), invalid: byTag('invalid') })}\n`,
  );
  expect(byTag('canonical')).toBeGreaterThan(15);
  expect(byTag('invalid')).toBeGreaterThan(3);

  // the standard format, as a worked example a reader can check by eye
  const standard = scenarios.find((s) => s.scenarioId === 'grammar/set3-s-6-tb7');
  expect(standard?.properties).toEqual(['GRAMMAR_ROUND_TRIP']);
  expect(standard?.steps[0].result.value).toMatchObject({
    bestOf: 3,
    setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
  });
  expect(standard?.steps[1].result.value).toEqual('SET3-S:6/TB7');
  expect(standard?.steps[2].result.value).toEqual(true);
  expect(standard?.steps[3].result.value).toEqual(false);
});

it('an invalid code parses to nothing, and the scenario says so by omitting the value', () => {
  const scenarios = recordGrammar({ outDir: (outDir = fs.mkdtempSync(path.join(tmpdir(), 'corpus-grammar-'))) });
  const bad = scenarios.find((s) => s.scenarioId === 'grammar/set3-s-6-tb7-xyz');
  expect(bad?.tags).toContain('invalid');
  expect(bad?.steps[0].result).toEqual({ success: true });
  expect(bad?.steps[2].result.value).toEqual(false);
});

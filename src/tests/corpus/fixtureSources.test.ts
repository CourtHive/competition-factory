import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { listFixtures, recordFixtures } from '../testHarness/corpus/fixtureSources';
import { setRandomSource } from '@Tools/prng';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * C2c. Every real-record fixture becomes a scenario: the record as initial state, a score-then-
 * clear probe on its first playable matchUp. Each must pass the CODES schema (the writer refuses
 * otherwise), read back by patches and replay through the engine. Fast enough to run always; with
 * `CORPUS_OUT` set (`pnpm corpus:fixtures`) the output is kept instead of discarded.
 */
let outDir = '';

afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

it.skipIf(process.env.CORPUS_RECORD === '1')(
  'every fixture writes, reads back and replays',
  { timeout: 300_000 },
  () => {
    outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-fixtures-'));
    const files = listFixtures();
    expect(files.length).toEqual(16);

    const { written, failed } = recordFixtures({ outDir });
    expect(failed).toEqual([]);
    expect(written.map((s) => s.scenarioId)).toEqual(
      files.map((f) => `fixture/${f.replace(/\.tods\.json$/, '').toLowerCase()}`),
    );

    const probed = written.filter((s) => s.steps.length === 2);
    const doUndo = written.filter((s) => s.properties.includes('DO_UNDO_IDENTITY'));
    process.stdout.write(
      `corpus:fixtures ${JSON.stringify({ fixtures: written.length, probed: probed.length, doUndoIdentity: doUndo.length, unplayable: written.length - probed.length })}\n`,
    );
    expect(probed.length).toBeGreaterThan(8);

    for (const scenario of written) {
      expect({ id: scenario.scenarioId, reader: replayAsReader(scenario) }).toEqual({
        id: scenario.scenarioId,
        reader: [],
      });
      expect({ id: scenario.scenarioId, engine: replayThroughEngine(scenario) }).toEqual({
        id: scenario.scenarioId,
        engine: [],
      });
    }
    const lines = fs.readFileSync(path.join(outDir, 'fixtures.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(16);
  },
);

import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { recordMocks } from '../testHarness/corpus/mocksSources';
import { MOCKS_SCENARIOS } from '../testHarness/corpus/mocksScenarios';
import { afterEach, expect, it } from 'vitest';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * The `mocks` corpus source: every scenario shape's method list writes as a scenario, every step succeeds, and the
 * scenario replays both ways (as a reader of its patches, and through the engine).
 */
let outDir = '';
afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

it('every mocks scenario writes from its method list, succeeds at every step, and replays both ways', () => {
  outDir = process.env.CORPUS_OUT ?? fs.mkdtempSync(path.join(tmpdir(), 'corpus-mocks-'));
  const { written, failed } = recordMocks({ outDir });
  expect(failed).toEqual([]);
  expect(written.length).toEqual(MOCKS_SCENARIOS.length);

  for (const scenario of written) {
    const id = scenario.scenarioId;
    const refused = scenario.steps.filter(({ result }) => result.error).map(({ directive }) => directive.method);
    expect({ id, refused }).toEqual({ id, refused: [] });
    expect({ id, reader: replayAsReader(scenario) }).toEqual({ id, reader: [] });
    expect({ id, engine: replayThroughEngine(scenario) }).toEqual({ id, engine: [] });
  }
}, 180_000);

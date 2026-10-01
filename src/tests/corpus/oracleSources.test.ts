import { recordCensus, recordMatrixCells, recordRouteFlips } from '../testHarness/corpus/oracleSources';
import { replayAsReader, replayThroughEngine } from '../testHarness/corpus/replayScenario';
import { MATRIX_CELLS, MATRIX_DRAW_TYPES } from '../testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '../testHarness/exitPropagation/producedExitPolicy';
import { CorpusRecorder } from '../testHarness/corpus/recorder';
import { setRandomSource } from '@Tools/prng';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * C2b. Always: a smoke slice of each oracle is recorded to a temp dir and every scenario must
 * validate, read back by patches, and replay through the engine. With `CORPUS_ORACLES=1`
 * (`pnpm corpus:oracles`): the whole matrix, the census range, the route flips and the stall
 * budget's policy arm are written under `CORPUS_OUT` (default `.corpus-out/oracles`, ignored).
 * Neither runs under `CORPUS_RECORD=1`, where the global recorder already owns the observer.
 */
const underGlobalRecorder = process.env.CORPUS_RECORD === '1';
const full = process.env.CORPUS_ORACLES === '1';

let recorder: CorpusRecorder | undefined;
let outDir = '';

afterEach(() => {
  recorder?.stop();
  recorder = undefined;
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

function readScenarios(dir: string) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl') && !f.startsWith('_'))
    .flatMap((f) =>
      fs
        .readFileSync(path.join(dir, f), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    );
}

it.skipIf(underGlobalRecorder)('a smoke slice of every oracle records, validates, reads back and replays', () => {
  outDir = fs.mkdtempSync(path.join(tmpdir(), 'corpus-oracles-'));
  recorder = new CorpusRecorder({ outDir });

  expect(recordMatrixCells({ recorder, cells: MATRIX_CELLS.slice(0, 3) })).toEqual(3);
  expect(recordCensus({ recorder, seedStart: 9000001, seedCount: 2, maxSteps: 8 })).toEqual(2);
  expect(recordRouteFlips({ recorder, drawTypes: [MATRIX_DRAW_TYPES[0]], drawSize: 8, limitPerDraw: 2 })).toEqual({
    draws: 1,
    flips: 2,
  });

  const stats = recorder.flushSummary();
  const invalid = stats.reduce((a, s) => a + s.invalid, 0);
  expect(stats.flatMap((s) => Object.entries(s.invalidReasons))).toEqual([]);
  expect(invalid).toEqual(0);

  const scenarios = readScenarios(outDir);
  expect(scenarios.length).toBeGreaterThanOrEqual(3 + 2 + 1 + 2);
  const kinds = new Set(scenarios.map((s: any) => s.source.kind));
  expect([...kinds].sort((a, b) => a.localeCompare(b))).toEqual(['census', 'matrix', 'route-differential']);
  expect(scenarios.find((s: any) => s.scenarioId.startsWith('oracle/matrix/'))?.tags).toEqual(['matrix']);
  expect(scenarios.some((s: any) => s.scenarioId.endsWith('/part-2'))).toEqual(true); // a flip replays twice

  recorder.stop();
  recorder = undefined;
  for (const scenario of scenarios) {
    expect({ id: scenario.scenarioId, reader: replayAsReader(scenario) }).toEqual({
      id: scenario.scenarioId,
      reader: [],
    });
    expect({ id: scenario.scenarioId, engine: replayThroughEngine(scenario) }).toEqual({
      id: scenario.scenarioId,
      engine: [],
    });
  }
});

it.skipIf(underGlobalRecorder || !full)('writes every oracle as corpus scenarios', { timeout: 3_600_000 }, () => {
  outDir = process.env.CORPUS_OUT ?? '.corpus-out/oracles';
  fs.rmSync(outDir, { recursive: true, force: true });
  recorder = new CorpusRecorder({ outDir });
  const played = recordMatrixCells({ recorder, cells: MATRIX_CELLS });
  const policy = recordMatrixCells({
    recorder,
    cells: MATRIX_CELLS,
    prefix: 'oracle/stall-budget',
    kind: 'stall-budget',
    policyDefinitions: PRODUCED_EXIT_POLICY,
  });
  const census = recordCensus({
    recorder,
    seedStart: Number(process.env.SEED_START ?? 9000001),
    seedCount: Number(process.env.SEED_COUNT ?? 600),
    maxSteps: Number(process.env.MAX_STEPS ?? 30),
  });
  const routes = recordRouteFlips({
    recorder,
    drawTypes: MATRIX_DRAW_TYPES,
    drawSize: 16,
    participantCounts: [16, 13],
    limitPerDraw: process.env.CORPUS_FLIPS ? Number(process.env.CORPUS_FLIPS) : undefined,
  });
  const stats = recorder.flushSummary();
  const totals = stats.reduce(
    (a, s) => ({
      scenarios: a.scenarios + s.scenarios,
      steps: a.steps + s.steps,
      bytes: a.bytes + s.bytes,
      invalid: a.invalid + s.invalid,
    }),
    { scenarios: 0, steps: 0, bytes: 0, invalid: 0 },
  );
  process.stdout.write(
    `corpus:oracles ${JSON.stringify({ played, policy, census, routes, ...totals, MB: +(totals.bytes / 1048576).toFixed(1) })}\n`,
  );
  expect(totals.invalid).toEqual(0);
});

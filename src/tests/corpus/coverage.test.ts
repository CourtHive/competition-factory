import {
  computeCoverage,
  methodSources,
  errorCodesByName,
  declaredErrorCodes,
  renderCoverage,
} from '../testHarness/corpus/coverage';
import { recordFixtures } from '../testHarness/corpus/fixtureSources';
import { CORE_METHODS } from '../testHarness/corpus/coreMethods';
import { setRandomSource } from '@Tools/prng';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * C3. Always: the computation is checked on a known input (the fixtures source). With
 * `CORPUS_COVERAGE=1` (`pnpm corpus:coverage`): coverage of whatever is under `CORPUS_OUT`
 * (default `.corpus-out`) is written to `<CORPUS_OUT>/coverage.json` and printed as markdown;
 * `scripts/verify/corpus-coverage.mjs` then ratchets it against its baseline.
 */
let outDir = '';

afterEach(() => {
  setRandomSource();
  setClock();
  if (outDir.startsWith(tmpdir())) fs.rmSync(outDir, { recursive: true, force: true });
});

it('resolves every core method to a source file and reads its declared error codes', () => {
  const sources = methodSources();
  const unresolved = [...CORE_METHODS].filter((m) => !sources[m]);
  expect(unresolved).toEqual([]);
  const byName = errorCodesByName();
  expect(Object.keys(byName).length).toBeGreaterThan(200);
  expect(byName.MATCHUP_NOT_FOUND).toEqual('ERR_NOT_FOUND_MATCHUP');
  const declared = declaredErrorCodes(sources.setMatchUpStatus, byName);
  expect(declared.length).toBeGreaterThan(0);
  expect(declared.every((c) => /^ERR_/.test(c))).toEqual(true);
});

it.skipIf(process.env.CORPUS_RECORD === '1')('computes coverage from a known source', () => {
  outDir = fs.mkdtempSync(path.join(tmpdir(), 'corpus-coverage-'));
  const { written } = recordFixtures({ outDir });
  const cov = computeCoverage(outDir);
  expect(cov.scenarios).toEqual(written.length);
  expect(cov.steps).toEqual(written.reduce((a, s) => a + s.steps.length, 0));
  expect(cov.methods.setMatchUpStatus.steps).toEqual(cov.steps); // the probe is all setMatchUpStatus
  expect(cov.methods.setMatchUpStatus.sources).toEqual(['fixture']);
  expect(cov.methodsWithSteps).toEqual(1);
  expect(cov.methodsAtZero).toHaveLength(cov.coreMethods - 1);
  const md = renderCoverage(cov);
  expect(md).toContain('core methods with ≥1 step | 1 /');
});

it.skipIf(process.env.CORPUS_COVERAGE !== '1')('reports coverage of the harvested corpus', () => {
  const dir = process.env.CORPUS_OUT ?? '.corpus-out';
  const cov = computeCoverage(dir);
  expect(cov.scenarioFiles).toBeGreaterThan(0);
  fs.writeFileSync(path.join(dir, 'coverage.json'), JSON.stringify(cov, null, 2));
  process.stdout.write(renderCoverage(cov));
});

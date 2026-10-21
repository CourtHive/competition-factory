#!/usr/bin/env node
/**
 * Run the scoring suites with the ScoringEngine selector set to `differential`, and fail unless the run compared
 * something; then run them again with `v2` alone, and fail unless every file ran the v2 engine shell (SE2c).
 *
 * ## What this guards
 *
 * The clean-room v2 engine (`src/assemblies/engines/scoring/v2/`) and the v1 class must agree on every call the
 * scoring tests, the conformance cases and the corpus make. Under `SCORING_ENGINE=differential` each v1 call is
 * made on a v2 engine shell too and a difference throws, so a red here is a divergence to decide (rule versus v1),
 * never a flake. The outcome pipeline's `route-differential` gate is the model (scoring-engine v2 plan § 2). Under
 * `SCORING_ENGINE=v2` the same suites hold v2 alone to every expectation they hold v1 to.
 *
 * ## Why it reads the tally
 *
 * A differential that compared nothing would pass every test, and what it does not compare (a status set outside
 * scoring) it DEFERS by reason. So each test file appends what it compared and deferred
 * (`SCORING_TALLY`), and this fails when the sum compared no point, game, set, baseline, undo, redo or edit. It
 * prints the whole tally, deferrals and pending decisions included, so a reader sees what green covered.
 */
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUITES = ['src/tests/scoring', 'src/tests/corpus'];
const REQUIRED = [
  'compared:addPoint',
  'compared:addGame',
  'compared:addSet',
  'compared:setInitialScore',
  'compared:undo',
  'compared:redo',
  'compared:editPoint',
  'compared:endSegment',
  'verdict:addPoint',
];

/** runs the scoring suites with the selector set to `mode`, and returns the summed tally the test files wrote */
function runSuites(mode) {
  const tallyFile = join(mkdtempSync(join(tmpdir(), `scoring-${mode}-`)), 'tally.jsonl');
  const run = spawnSync('npx', ['vitest', 'run', ...SUITES], {
    stdio: 'inherit',
    env: { ...process.env, TZ: 'UTC', SCORING_ENGINE: mode, SCORING_TALLY: tallyFile },
  });
  if (run.status !== 0) {
    console.error(`verify:scoring-differential: vitest (${mode}) exited ${run.status}`);
    process.exit(run.status ?? 1);
  }
  if (!existsSync(tallyFile)) {
    console.error(`verify:scoring-differential: no tally was written in ${mode} mode`);
    process.exit(1);
  }
  const tally = {};
  for (const line of readFileSync(tallyFile, 'utf8').trim().split('\n').filter(Boolean))
    for (const [key, value] of Object.entries(JSON.parse(line))) tally[key] = (tally[key] ?? 0) + value;
  return tally;
}

const tally = runSuites('differential');
for (const key of Object.keys(tally).toSorted((a, b) => a.localeCompare(b, 'en')))
  console.log(`${key.padEnd(40)} ${tally[key]}`);
const missing = REQUIRED.filter((key) => !tally[key]);
if (missing.length) {
  console.error(`verify:scoring-differential: compared nothing for ${missing.join(', ')}`);
  process.exit(1);
}

// the same suites on v2 alone (SE2c): every file must have seen the constructor hand back the v2 shell
const alone = runSuites('v2');
console.log(`v2 alone: ${alone['v2:alone'] ?? 0} of ${alone['v2:files'] ?? 0} test files ran the v2 shell`);
if (!alone['v2:files'] || alone['v2:alone'] !== alone['v2:files']) {
  console.error('verify:scoring-differential: the v2 pass did not run v2 alone in every file');
  process.exit(1);
}
console.log('verify:scoring-differential: OK');

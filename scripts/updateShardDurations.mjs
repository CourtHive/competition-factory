#!/usr/bin/env node
/**
 * Record per-file test durations for the duration-balanced shards (vitest.sequencer.mts).
 *
 *   node scripts/updateShardDurations.mjs <report.json> <full|pr>
 *
 * <report.json> is vitest's JSON report of a WHOLE suite run, usually the merge of a CI run's four coverage
 * shards: download the `coverage-blob-node26-*` artifacts into one directory, then
 *   pnpm exec vitest --merge-reports=<dir> --reporter=json --outputFile=<report.json> --coverage.enabled=false
 * Use a PR into dev for `pr` and a checkpoint or master push for `full` (FACTORY_MATRIX_TIER, matrixTier.ts).
 * The other tier's durations are kept. Seconds are rounded to tenths; the file is keyed by repo-relative path.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [reportPath, tier] = process.argv.slice(2);
if (!reportPath || !['full', 'pr'].includes(tier)) {
  console.error('usage: node scripts/updateShardDurations.mjs <report.json> <full|pr>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const durations = {};
for (const result of report.testResults ?? []) {
  const at = result.name.indexOf('/src/');
  if (at < 0) continue;
  durations[result.name.slice(at + 1)] = Math.round((result.endTime - result.startTime) / 100) / 10;
}
const count = Object.keys(durations).length;
// a partial report (one shard) would leave three quarters of the suite at the default weight
if (count < 1000) {
  console.error(`[shard-durations] only ${count} files in ${reportPath}: expected a whole-suite report`);
  process.exit(1);
}

const target = new URL('../vitest.shardDurations.json', import.meta.url);
let existing = {};
try {
  existing = JSON.parse(readFileSync(target, 'utf8'));
} catch {
  // first write
}
const sorted = Object.fromEntries(Object.entries(durations).sort(([a], [b]) => a.localeCompare(b, 'en')));
writeFileSync(target, JSON.stringify({ ...existing, [tier]: sorted }, null, 2) + '\n');
const total = Object.values(durations).reduce((sum, seconds) => sum + seconds, 0);
console.log(`[shard-durations] ${tier}: ${count} files, ${total.toFixed(0)} test-seconds`);

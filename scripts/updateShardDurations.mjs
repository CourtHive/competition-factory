#!/usr/bin/env node
/**
 * Record per-file test durations for the duration-balanced shards (vitest.sequencer.mts).
 *
 *   node scripts/updateShardDurations.mjs <full|pr> <report.json> [<report.json> ...]
 *
 * Each <report.json> is vitest's JSON report of a WHOLE suite run, usually the merge of a CI run's four coverage
 * shards: download the `coverage-blob-node26-*` artifacts into one directory, then
 *   pnpm exec vitest --merge-reports=<dir> --reporter=json --outputFile=<report.json> --coverage.enabled=false
 * Use PRs into dev for `pr` and checkpoints or master pushes for `full` (FACTORY_MATRIX_TIER, matrixTier.ts).
 *
 * Give several runs. A file's measured time depends on which files shared the runner's CPU with it: the same file
 * measured 54 s in one run and 31 s in the next (2026-11-05). Each file records the MEDIAN of its times across the
 * reports given, which damps that noise. The other tier's durations are kept. Seconds are rounded to tenths; the
 * file is keyed by repo-relative path.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [tier, ...reportPaths] = process.argv.slice(2);
if (!['full', 'pr'].includes(tier) || !reportPaths.length) {
  console.error('usage: node scripts/updateShardDurations.mjs <full|pr> <report.json> [<report.json> ...]');
  process.exit(2);
}

const samples = new Map();
for (const reportPath of reportPaths) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  let count = 0;
  for (const result of report.testResults ?? []) {
    const at = result.name.indexOf('/src/');
    if (at < 0) continue;
    const path = result.name.slice(at + 1);
    if (!samples.has(path)) samples.set(path, []);
    samples.get(path).push((result.endTime - result.startTime) / 1000);
    count += 1;
  }
  // a partial report (one shard) would leave three quarters of the suite at the default weight
  if (count < 1000) {
    console.error(`[shard-durations] only ${count} files in ${reportPath}: expected a whole-suite report`);
    process.exit(1);
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const durations = Object.fromEntries(
  [...samples.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([path, values]) => [path, Math.round(median(values) * 10) / 10]),
);

const target = new URL('../vitest.shardDurations.json', import.meta.url);
let existing = {};
try {
  existing = JSON.parse(readFileSync(target, 'utf8'));
} catch {
  // first write
}
writeFileSync(target, JSON.stringify({ ...existing, [tier]: durations }, null, 2) + '\n');
const total = Object.values(durations).reduce((sum, seconds) => sum + seconds, 0);
console.log(
  `[shard-durations] ${tier}: ${samples.size} files, ${total.toFixed(0)} test-seconds (median of ${reportPaths.length} report${reportPaths.length > 1 ? 's' : ''})`,
);

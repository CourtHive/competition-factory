import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * Duration-balanced shards (2026-11-05). Vitest's own `--shard` sorts files by a hash of their path and cuts the
 * list into equal COUNTS, so one CI coverage shard drew 1,060 test-seconds and another 725 (PR #6194's run): the
 * slowest shard set the wall time. This sequencer instead assigns files greedily by recorded duration, heaviest
 * first, each to the least-loaded shard (longest-processing-time first).
 *
 * Every shard process computes the same assignment from the same sorted file list and the same durations, so the
 * shards stay disjoint and together cover every file, which `vitest --merge-reports --coverage` relies on.
 * Durations come from `vitest.shardDurations.json`, per matrix tier (src/tests/testHarness/matrixTier.ts), written by
 * `scripts/updateShardDurations.mjs` from a CI run's merged report. A file with no recorded duration (a new test)
 * weighs DEFAULT_SECONDS: stale durations cost balance, never coverage.
 */
const DEFAULT_SECONDS = 0.5;
// Recorded durations are test time only; importing and collecting a file costs more on top (11-19% of a CI coverage
// shard, about 0.2 s a file). Without it, the shard given the hundreds of fast files would run long.
const FILE_OVERHEAD_SECONDS = 0.2;

type Durations = Record<'full' | 'pr', Record<string, number>>;

const tier = process.env.FACTORY_MATRIX_TIER === 'pr' ? 'pr' : 'full';

function loadDurations(): Record<string, number> {
  try {
    const all = JSON.parse(readFileSync(new URL('./vitest.shardDurations.json', import.meta.url), 'utf8')) as Durations;
    return all[tier] ?? {};
  } catch {
    return {};
  }
}

export function assignShards(paths: string[], count: number, durations: Record<string, number>): string[][] {
  const shards = Array.from({ length: count }, () => ({ load: 0, paths: [] as string[] }));
  const weighed = [...paths]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((path) => ({ path, seconds: (durations[path] ?? DEFAULT_SECONDS) + FILE_OVERHEAD_SECONDS }))
    // heaviest first; equal weights keep path order, so the assignment is deterministic
    .sort((a, b) => b.seconds - a.seconds);
  for (const { path, seconds } of weighed) {
    // the lowest load, and among equal loads the lowest index
    const target = shards.reduce((best, shard) => (shard.load < best.load ? shard : best), shards[0]);
    target.load += seconds;
    target.paths.push(path);
  }
  return shards.map((shard) => shard.paths);
}

export default class DurationSequencer extends BaseSequencer {
  async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { index, count } = this.ctx.config.shard ?? { index: 1, count: 1 };
    const root = this.ctx.config.root;
    const pathOf = (spec: TestSpecification) => relative(root, spec.moduleId).split('\\').join('/');
    const assigned = new Set(assignShards(files.map(pathOf), count, loadDurations())[index - 1]);
    return files.filter((spec) => assigned.has(pathOf(spec)));
  }
}

import { readFileSync } from 'node:fs';

// Each file holds one arm of the same size range. Compare each seed before summarizing the cell.
const [freshPath, retainedPath] = process.argv.slice(2);
if (!retainedPath) throw new Error('Pass fresh and retained sample files for the same workload');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const fresh = read(freshPath);
const retained = read(retainedPath);
const key = ({ eventType, drawSize, workload, seed }) => JSON.stringify([eventType, drawSize, workload, seed]);
const candidates = new Map(retained.map((row) => [key(row), row]));
if (!fresh.length || candidates.size !== retained.length) throw new Error('Empty reference or duplicate candidates');
const cells = new Map();
const differing = [];
let calls = 0;
for (const base of fresh) {
  const id = key(base);
  const candidate = candidates.get(id);
  if (
    !candidate ||
    base.calls !== candidate.calls ||
    base.pipeline !== 'v2' ||
    candidate.pipeline !== 'v2' ||
    base.planner !== 'fresh' ||
    candidate.planner !== 'retained' ||
    Boolean(base.digest) !== Boolean(candidate.digest)
  ) {
    throw new Error('Unpaired measurement: ' + id);
  }
  candidates.delete(id);
  if (base.digest !== candidate.digest) differing.push(id);
  calls += base.calls;
  const cell = JSON.stringify([base.eventType, base.drawSize, base.workload]);
  const group = cells.get(cell) ?? [];
  group.push([base, candidate]);
  cells.set(cell, group);
}
if (candidates.size) throw new Error('Unpaired retained samples');
const median = (xs) => {
  const values = xs.toSorted((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
};
const workloads = [...cells.values()].map((group) => {
  const [[{ eventType, drawSize, workload, calls }]] = group;
  return {
    eventType,
    drawSize,
    workload,
    callsPerDraw: calls,
    seeds: group.length,
    freshMsPerDraw: median(group.map(([base]) => base.mutationMs)),
    retainedMsPerDraw: median(group.map(([, candidate]) => candidate.mutationMs)),
    retainedIndexHits: group.reduce((n, [, r]) => n + r.index.hits, 0),
    retainedIndexBuilds: group.reduce((n, [, r]) => n + r.index.builds, 0),
  };
});
console.log(
  JSON.stringify(
    { pairs: fresh.length, callsPerArm: calls, comparedTraces: !!fresh[0].digest, differing, workloads },
    null,
    2,
  ),
);
if (differing.length) process.exitCode = 1;

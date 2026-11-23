// Usage: node scripts/ext/pairedPlannerSummary.mjs <paired-output.jsonl>
import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const quantile = (xs, q) => xs.toSorted((a, b) => a - b)[Math.ceil(q * xs.length) - 1];
const median = (xs) => {
  const sorted = xs.toSorted((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
let seed = 48211;
function bootstrap(values, statistic) {
  const estimates = [];
  for (let i = 0; i < 10000; i++) {
    const sample = Array.from({ length: values.length }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return values[Math.floor((seed / 2 ** 32) * values.length)];
    });
    estimates.push(statistic(sample));
  }
  return { estimate: statistic(values), interval: [quantile(estimates, 0.025), quantile(estimates, 0.975)] };
}

function metrics(row) {
  const calls = row.samples.map((s) => s.ms);
  return {
    callMedianMs: median(calls),
    callP95Ms: quantile(calls, 0.95),
    drawMutationMs: calls.reduce((a, b) => a + b, 0),
    drawElapsedMs: row.traversalMs,
  };
}

const report = [];
for (const cell of new Set(rows.map((r) => r.field + ' ' + r.size))) {
  const all = rows.filter((r) => r.field + ' ' + r.size === cell);
  const measured = all.filter((r) => !r.audit);
  const pairs = [...new Set(measured.map((r) => r.seed))].map((seed) => {
    const pair = measured.filter((r) => r.seed === seed);
    if (pair.length !== 2 || pair[0].retained === pair[1].retained || pair[0].finalHash !== pair[1].finalHash)
      throw Error('Invalid pair in ' + cell);
    return [metrics(pair.find((r) => !r.retained)), metrics(pair.find((r) => r.retained))];
  });
  const stats = {};
  for (const key of Object.keys(pairs[0][0])) {
    stats[key] = {
      fresh: bootstrap(
        pairs.map(([f]) => f[key]),
        median,
      ),
      retained: bootstrap(
        pairs.map(([, r]) => r[key]),
        median,
      ),
      pairedPercent: bootstrap(
        pairs.map(([f, r]) => 100 * (r[key] / f[key] - 1)),
        median,
      ),
    };
  }
  const fresh = measured.filter((r) => !r.retained);
  report.push({
    cell,
    pairs: pairs.length,
    freshFirst: measured.filter((r, i) => i % 2 === 0 && !r.retained).length,
    firstSeedTraceAgrees:
      all.some((r) => r.audit && r.digest) && new Set(all.filter((r) => r.audit).map((r) => r.digest)).size === 1,
    callsPerArm: fresh.reduce((n, r) => n + r.samples.length, 0),
    stats,
  });
}
console.log(JSON.stringify(report, null, 2));

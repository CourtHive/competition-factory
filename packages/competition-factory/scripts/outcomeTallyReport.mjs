#!/usr/bin/env node
/**
 * Summarises a differential tally run: what v2 compared with v1, and what it deferred, by route and reason
 * (outcome v2 executor plan § 6 S0, the measured deferral tally).
 *
 *   OUTCOME_PIPELINE=differential OUTCOME_TALLY=/tmp/tally.jsonl TZ=UTC npx vitest run
 *   node scripts/outcomeTallyReport.mjs /tmp/tally.jsonl [--json]
 *
 * Each line of the tally is one test file's counts (src/tests/testHarness/differentialTally.ts). A key is a route
 * (`winner`, `clear`, ...), a route and what was checked after it (`winner:direction`, `winner:dual`, an invariant),
 * `refusal` for a call either pipeline refused, or `refusal:deferred:<code>`: v1 refused with an apply-stage code v2
 * does not yet plan. `deferred` means v2 did not plan what v1 did, so nothing was compared.
 *
 * A tally with no lines, or nothing compared, fails: a run that compared nothing is not a clean result.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const file = args.find((arg) => !arg.startsWith('--'));

if (!file || !fs.existsSync(file)) {
  console.error(`[outcome-tally] no tally at ${file ?? '(none given)'}: run with OUTCOME_TALLY=<file> first`);
  process.exit(1);
}

const keys = new Map();
let files = 0;
const lines = fs.readFileSync(file, 'utf8').split('\n');
for (const [index, line] of lines.entries()) {
  if (!line.trim()) continue;
  files += 1;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    // the tally is appended by parallel vitest workers; a torn line is named, and the run is not summarised as if whole
    console.error(
      `[outcome-tally] ${file}:${index + 1} is not a JSON line (${error.message}); the tally is incomplete`,
    );
    process.exit(1);
  }
  for (const [key, count] of Object.entries(parsed)) {
    const total = keys.get(key) ?? { compared: 0, deferred: 0 };
    total.compared += count.compared;
    total.deferred += count.deferred;
    keys.set(key, total);
  }
}
const rows = [...keys.entries()].map(([key, count]) => ({ key, ...count })).sort((a, b) => a.key.localeCompare(b.key));
const sum = (pick) => rows.reduce((total, row) => total + pick(row), 0);
// the call-level rows: one per call that reached the comparison, by the route it took (`refusal`, or `none` when
// v2 chose none); `team-autocalc` is tallied BESIDE the route of a TEAM auto-calc call, so it is not a call row
const BESIDE_THE_ROUTE = new Set(['team-autocalc']);
const isCallRow = (row) => !row.key.includes(':') && !BESIDE_THE_ROUTE.has(row.key);
const calls = {
  compared: sum((r) => (isCallRow(r) ? r.compared : 0)),
  deferred: sum((r) => (isCallRow(r) ? r.deferred : 0)),
};

if (!files || !calls.compared) {
  console.error(`[outcome-tally] ${files} file(s), ${calls.compared} calls compared: nothing to report`);
  process.exit(1);
}
if (asJson) {
  console.log(JSON.stringify({ files, calls, rows }, undefined, 2));
  process.exit(0);
}

const share = (row) => {
  const total = row.compared + row.deferred;
  return total ? `${((100 * row.deferred) / total).toFixed(1)}%` : '-';
};
const table = (selected) => [
  '| key | compared | deferred | deferred share |',
  '|---|---:|---:|---:|',
  ...selected.map((row) => `| \`${row.key}\` | ${row.compared} | ${row.deferred} | ${share(row)} |`),
];
console.log(
  [
    `${files} test files; ${calls.compared + calls.deferred} calls reached the comparison: ${calls.compared} compared, ` +
      `${calls.deferred} deferred (${share(calls)}).`,
    '',
    '## By route (one row per call)',
    '',
    ...table(rows.filter(isCallRow)),
    '',
    '## Deferral reasons (what v2 did not yet plan), most deferred first',
    '',
    ...table(rows.filter((row) => !isCallRow(row) && row.deferred).sort((a, b) => b.deferred - a.deferred)),
    '',
    '## Every check after a route',
    '',
    ...table(rows.filter((row) => !isCallRow(row))),
  ].join('\n'),
);

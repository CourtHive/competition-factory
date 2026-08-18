#!/usr/bin/env node
/**
 * verify:coverage-headroom — how close coverage is to the floor, in items.
 *
 * `verify:coverage` answers a binary: are we above the threshold? It cannot
 * answer "by how much", and that is the number people actually need. On
 * 2026-08-18 statements sat at 95.09% against a floor of 95 — **39 statements**
 * of margin out of 43,284. Any PR adding ~40 uncovered statements would have
 * gone red, and nothing said so until it did.
 *
 * Percentages hide this. 95.09 vs 95.00 reads like room; 39 items out of 43,284
 * reads like the cliff edge it is. So this reports the margin in the unit that
 * makes it legible, and budgets the DELTA rather than the absolute:
 *
 *   - always prints headroom per metric, so every CI log carries the number
 *   - fails when a change eats more than `--budget` items of margin vs the
 *     baseline (default 25), even while still passing verify:coverage
 *
 * Budgeting the delta is deliberate. A floor-based warning would fire on the
 * same runs `verify:coverage` already fails, which adds nothing. What is worth
 * catching is the run that silently spends a third of the remaining margin and
 * still goes green.
 *
 * Note that healthy growth RAISES headroom: fully-covered new code adds `n` to
 * both covered and total, so headroom gains `n * (1 - floor)`. A drop therefore
 * means uncovered code was added — which is exactly the signal wanted.
 *
 * Modes:
 *   --update-baseline   overwrite the baseline with current headroom
 *   --budget=N          items of margin a change may spend (default 25)
 *
 * Reads `coverage/coverage-summary.json`, so it must run after
 * `verify:coverage` (whose reporters already include `json-summary`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const SUMMARY = join(FACTORY_ROOT, 'coverage/coverage-summary.json');
const CONFIG = join(FACTORY_ROOT, 'vitest.config.mts');
const BASELINE = join(__dirname, 'baseline/coverage-headroom.json');

const METRICS = ['statements', 'branches', 'functions', 'lines'];

const args = process.argv.slice(2);
const updateBaseline = args.includes('--update-baseline');
const budgetArg = args.find((a) => a.startsWith('--budget='));
const BUDGET = budgetArg ? Number(budgetArg.split('=')[1]) : 25;

function log(msg) {
  process.stdout.write(`[verify:coverage-headroom] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[verify:coverage-headroom] ${msg}\n`);
  process.exit(1);
}

/**
 * Read the GLOBAL thresholds out of vitest.config.mts rather than restating
 * them here. A second copy would drift, and drifting silently is the whole
 * failure mode this script exists to make visible — `scripts/verify/README.md`
 * said the branch floor was 83 for the three months after it became 85.
 *
 * The per-file block (`'src/**': { perFile: true, … }`) is skipped: only the
 * first, unkeyed `thresholds` entries are global.
 */
function readThresholds() {
  if (!existsSync(CONFIG)) fail(`missing ${CONFIG}`);
  const src = readFileSync(CONFIG, 'utf8');
  const block = src.slice(src.indexOf('thresholds: {'));
  const perFileAt = block.indexOf('perFile');
  const globalBlock = perFileAt === -1 ? block : block.slice(0, block.lastIndexOf('{', perFileAt));

  const thresholds = {};
  for (const metric of METRICS) {
    const match = new RegExp(`\\b${metric}:\\s*(\\d+(?:\\.\\d+)?)`).exec(globalBlock);
    if (!match) fail(`could not read the '${metric}' threshold from vitest.config.mts`);
    thresholds[metric] = Number(match[1]);
  }
  return thresholds;
}

if (!existsSync(SUMMARY)) {
  fail(`missing ${SUMMARY} — run \`pnpm verify:coverage\` first (it writes the json-summary report).`);
}

const total = JSON.parse(readFileSync(SUMMARY, 'utf8')).total;
const thresholds = readThresholds();

const current = {};
for (const metric of METRICS) {
  const { covered, total: count } = total[metric];
  // The floor is applied to a percentage, so the smallest passing `covered` is
  // ceil(count * floor / 100). Headroom is how many covered items could be lost
  // before dropping under it.
  current[metric] = {
    headroom: covered - Math.ceil((count * thresholds[metric]) / 100),
    pct: Number(total[metric].pct.toFixed(2)),
    covered,
    count,
    floor: thresholds[metric],
  };
}

log('margin before the floor, in items:');
for (const metric of METRICS) {
  const c = current[metric];
  log(
    `  ${metric.padEnd(11)} ${String(c.covered).padStart(6)}/${String(c.count).padEnd(6)} ` +
      `${c.pct.toFixed(2).padStart(6)}%  floor ${String(c.floor).padStart(2)}  headroom ${String(c.headroom).padStart(5)}`,
  );
}

if (updateBaseline) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  const next = Object.fromEntries(METRICS.map((m) => [m, current[m].headroom]));
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  log(`baseline updated — ${JSON.stringify(next)}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  fail(`missing baseline — run \`node scripts/verify/coverage-headroom.mjs --update-baseline\` to seed it.`);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const regressions = [];

for (const metric of METRICS) {
  const before = baseline[metric];
  if (typeof before !== 'number') continue; // a metric added to the baseline later
  const spent = before - current[metric].headroom;
  if (spent > BUDGET) regressions.push({ metric, before, after: current[metric].headroom, spent });
}

if (regressions.length) {
  for (const r of regressions) {
    process.stderr.write(
      `[verify:coverage-headroom] ${r.metric}: headroom ${r.before} → ${r.after} (spent ${r.spent}, budget ${BUDGET})\n`,
    );
  }
  process.stderr.write(
    'This change adds uncovered code faster than it adds covered code. Either cover it, or\n' +
      'accept the new margin with `node scripts/verify/coverage-headroom.mjs --update-baseline`.\n',
  );
  fail(`FAIL — ${regressions.length} metric(s) spent more than ${BUDGET} items of margin.`);
}

const tightest = METRICS.reduce((a, b) => (current[a].headroom <= current[b].headroom ? a : b));
log(`OK — tightest is ${tightest} at ${current[tightest].headroom} items (budget ${BUDGET} per change)`);

#!/usr/bin/env node
/**
 * corpus:verify — the golden corpus covers the core method set, and never less than it did.
 *
 * Reads `<CORPUS_OUT>/coverage.json` (written by `pnpm corpus:coverage` after the sources have
 * run) and compares it to `scripts/verify/baseline/corpus-coverage.json`. Two things may only
 * rise: the number of core methods with at least one scenario, and, per method, the set of
 * declared error codes observed. Scenarios are not committed (CA, 2026-10-01), so this baseline
 * is the committed artifact: small, a count and a code list per method, and the only part of the
 * corpus that git tracks. Headroom to 100% is printed on every run in the unit that matters,
 * methods at zero and codes never observed, because a percentage would hide which ones.
 *
 *   --update-baseline   overwrite the baseline with the current coverage
 *
 * Not in `pnpm verify`: the sources take about fifteen minutes to run. It belongs to the
 * pre-merge chain and to any PR that touches a core governor.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CORPUS_OUT ?? '.corpus-out';
const COVERAGE = join(OUT, 'coverage.json');
const BASELINE = join(__dirname, 'baseline/corpus-coverage.json');
const updateBaseline = process.argv.includes('--update-baseline');

const log = (msg) => process.stdout.write(`[corpus:verify] ${msg}\n`);
function fail(msg) {
  process.stderr.write(`[corpus:verify] FAIL — ${msg}\n`);
  process.exit(1);
}

if (!existsSync(COVERAGE))
  fail(`missing ${COVERAGE} — run \`pnpm corpus:coverage\` after the sources (fixtures, oracles, record).`);
const cov = JSON.parse(readFileSync(COVERAGE, 'utf8'));

const snapshot = {
  coreMethods: cov.coreMethods,
  methodsWithSteps: cov.methodsWithSteps,
  observedDeclaredCodes: cov.observedDeclaredCodes,
  declaredCodes: cov.declaredCodes,
  methods: Object.fromEntries(
    Object.values(cov.methods).map((m) => [m.method, { steps: m.steps, observedCodes: m.observedCodes }]),
  ),
};

log(`core methods with ≥1 step: ${cov.methodsWithSteps}/${cov.coreMethods}; at zero: ${cov.methodsAtZero.length}`);
log(`declared error codes observed: ${cov.observedDeclaredCodes}/${cov.declaredCodes}`);
if (cov.methodsAtZero.length) log(`at zero: ${cov.methodsAtZero.join(', ')}`);

if (updateBaseline) {
  writeFileSync(BASELINE, JSON.stringify(snapshot, null, 2) + '\n');
  log(`baseline updated → ${BASELINE}`);
  process.exit(0);
}
if (!existsSync(BASELINE))
  fail(`missing baseline — run \`node scripts/verify/corpus-coverage.mjs --update-baseline\` to seed it.`);

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const problems = [];
if (cov.methodsWithSteps < baseline.methodsWithSteps) {
  problems.push(`methods with ≥1 step fell ${baseline.methodsWithSteps} → ${cov.methodsWithSteps}`);
}
for (const [method, before] of Object.entries(baseline.methods ?? {})) {
  const now = snapshot.methods[method];
  if (!now) {
    problems.push(`${method}: in the baseline but no longer a core method (regenerate the baseline deliberately)`);
    continue;
  }
  if (before.steps > 0 && now.steps === 0) problems.push(`${method}: had ${before.steps} steps, now none`);
  const lost = (before.observedCodes ?? []).filter((c) => !now.observedCodes.includes(c));
  if (lost.length) problems.push(`${method}: error codes no longer observed: ${lost.join(', ')}`);
}
if (problems.length)
  fail(
    `coverage fell below the baseline:\n  ${problems.join('\n  ')}\n  If this is intended, re-seed with --update-baseline and say why in the PR.`,
  );
log('OK — coverage is at or above the baseline');

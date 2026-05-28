#!/usr/bin/env node
/**
 * verify:audit — fail on high/critical advisories.
 *
 * Factory has zero runtime deps, so this is almost entirely about dev-tree
 * awareness. We only fail on `high` or `critical` advisories; moderate/low
 * are surfaced for visibility but don't gate publish.
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');

function log(msg) {
  process.stdout.write(`[verify:audit] ${msg}\n`);
}

let json;
try {
  json = execSync('pnpm audit --json', { cwd: FACTORY_ROOT, encoding: 'utf8' });
} catch (err) {
  // pnpm audit exits non-zero when ANY advisory is found; the JSON is still
  // on stdout for parsing.
  json = err.stdout || '';
  if (!json) {
    process.stderr.write(`[verify:audit] could not parse pnpm audit output: ${err.message}\n`);
    process.exit(1);
  }
}

let report;
try {
  report = JSON.parse(json);
} catch (err) {
  process.stderr.write(`[verify:audit] pnpm audit produced non-JSON output:\n${json}\n`);
  process.exit(1);
}

const meta = report.metadata?.vulnerabilities ?? {};
const high = (meta.high ?? 0) + (meta.critical ?? 0);
const moderate = meta.moderate ?? 0;
const low = meta.low ?? 0;
const info = meta.info ?? 0;

log(`advisories — critical+high: ${high}, moderate: ${moderate}, low: ${low}, info: ${info}`);

if (high > 0) {
  process.stderr.write(`[verify:audit] FAIL — ${high} high/critical advisory(ies).\n`);
  process.stderr.write('Inspect with `pnpm audit` and resolve before publish.\n');
  process.exit(1);
}

log('OK — no high/critical advisories');

#!/usr/bin/env node
/**
 * verify:ecosystem — run every consumer's test suite against the in-tree
 * factory (resolved via the pnpm `link:../factory` overrides each repo
 * already carries). Reports per-repo pass/fail counts at the end.
 *
 * Skips a consumer if its directory is missing on disk. The script does
 * NOT install anything — each consumer is expected to already have
 * node_modules. If `--build-factory` is passed we rebuild the factory
 * first; default assumes a recent build.
 *
 * Args:
 *   --build-factory     run `pnpm build` in the factory first
 *   --only=name,name    only run the listed repos
 *   --skip=name,name    skip the listed repos
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const ECOSYSTEM_ROOT = resolve(FACTORY_ROOT, '..');

// Each consumer with a test script that exercises factory consumption.
// Add new consumers here as the ecosystem grows.
const CONSUMERS = [
  { name: 'courthive-components', script: 'test' },
  { name: 'TMX', script: 'test --run' },
  { name: 'competition-factory-server', script: 'test' },
  { name: 'pdf-factory', script: 'test --run' },
  { name: 'epixodic', script: 'test --run' },
  { name: 'courthive-arena', script: 'test --run' },
  { name: 'courthive-public', script: 'test' },
  { name: 'scoringVisualizations', script: 'test' },
  { name: 'courthive-ams', script: 'test' },
  { name: 'courthive-ingest', script: 'test' },
  { name: 'courthive-rankings', script: 'test' },
  { name: 'courthive-persons', script: 'test' },
  { name: 'tmx-assistant', script: 'test' },
  { name: 'provider-config', script: 'test' },
  { name: 'tidyScore', script: 'test' },
];

function log(msg) {
  process.stdout.write(`[verify:ecosystem] ${msg}\n`);
}

function parseArgs(argv) {
  const args = { buildFactory: false, only: null, skip: null };
  for (const a of argv) {
    if (a === '--build-factory') args.buildFactory = true;
    else if (a.startsWith('--only=')) args.only = new Set(a.slice('--only='.length).split(','));
    else if (a.startsWith('--skip=')) args.skip = new Set(a.slice('--skip='.length).split(','));
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.buildFactory) {
  log('rebuilding factory dist…');
  execSync('pnpm build', { cwd: FACTORY_ROOT, stdio: 'inherit' });
}

const results = [];
for (const c of CONSUMERS) {
  if (args.only && !args.only.has(c.name)) {
    results.push({ name: c.name, status: 'skipped (--only)' });
    continue;
  }
  if (args.skip?.has(c.name)) {
    results.push({ name: c.name, status: 'skipped (--skip)' });
    continue;
  }
  const dir = resolve(ECOSYSTEM_ROOT, c.name);
  if (!existsSync(dir)) {
    results.push({ name: c.name, status: 'missing' });
    continue;
  }
  log(`→ ${c.name}: pnpm ${c.script}`);
  const start = Date.now();
  try {
    const out = execSync(`pnpm ${c.script}`, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    // try to extract a tests-passing count
    const m = out.match(/Tests:\s+(\d+) passed/) || out.match(/Tests\s+(\d+) passed/) || out.match(/(\d+)\s+passed/);
    const passing = m ? m[1] : '?';
    results.push({ name: c.name, status: 'pass', tests: passing, sec: elapsed });
    log(`  ${c.name}: ${passing} tests passed (${elapsed}s)`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    results.push({
      name: c.name,
      status: 'FAIL',
      sec: elapsed,
      tail: (err.stdout || err.stderr || '').split('\n').slice(-15).join('\n'),
    });
    log(`  ${c.name}: FAIL after ${elapsed}s`);
  }
}

// Summary
log('\nsummary:');
const failures = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'pass');
const skipped = results.filter((r) => r.status.startsWith('skipped'));
const missing = results.filter((r) => r.status === 'missing');

for (const r of results) {
  const status = r.status === 'pass' ? `✓ ${r.tests}t/${r.sec}s` : r.status;
  process.stdout.write(`  ${r.name.padEnd(28)} ${status}\n`);
}
log(`\n${passed.length} passed | ${failures.length} failed | ${skipped.length} skipped | ${missing.length} missing`);

if (failures.length) {
  for (const f of failures) {
    process.stderr.write(`\n=== ${f.name} (tail) ===\n${f.tail}\n`);
  }
  process.exit(1);
}

log('OK — every consumer in scope passed against the in-tree factory');

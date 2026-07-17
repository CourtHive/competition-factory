#!/usr/bin/env node
/**
 * verify:bundle-size — track and budget the published artifact sizes.
 *
 * Measures raw + gzip for each file the package publishes (dist/*.js, *.mjs,
 * *.d.ts). Compares against `scripts/verify/baseline/bundle-size.json`. Fails
 * if any file grows beyond its budget (default +10 %).
 *
 * Modes:
 *   --update-baseline      overwrite the baseline with current sizes
 *   --budget=N             override growth threshold (decimal, default 0.10)
 */
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const BASELINE = join(FACTORY_ROOT, 'scripts/verify/baseline/bundle-size.json');
const DIST = join(FACTORY_ROOT, 'dist');

// Files that count toward the publish budget. dist/*.map files are not
// included in published tarballs by default and are excluded here too.
const TRACKED = [
  'index.js',
  'tods-competition-factory.d.ts',
  'tods-competition-factory.d.mts',
  'tods-competition-factory.d.cts',
  'tods-competition-factory.development.cjs.js',
  'tods-competition-factory.production.cjs.min.js',
];

function log(msg) {
  process.stdout.write(`[verify:bundle-size] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[verify:bundle-size] FAIL: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { updateBaseline: false, budget: 0.1 };
  for (const a of argv) {
    if (a === '--update-baseline') args.updateBaseline = true;
    else if (a.startsWith('--budget=')) args.budget = parseFloat(a.slice('--budget='.length));
  }
  return args;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function measure() {
  const result = {};
  for (const name of TRACKED) {
    const path = join(DIST, name);
    if (!existsSync(path)) {
      log(`skip ${name} (not present)`);
      continue;
    }
    const raw = readFileSync(path);
    const gzipped = gzipSync(raw, { level: 9 });
    result[name] = { raw: raw.length, gzip: gzipped.length };
  }
  // The ESM build (exports.import) is a preserveModules tree of ~1200 files
  // rather than one artifact — budget its aggregate .mjs size as a single line.
  const esmDir = join(DIST, 'esm');
  if (existsSync(esmDir)) {
    let raw = 0;
    let gzip = 0;
    let files = 0;
    for (const file of walk(esmDir)) {
      if (!file.endsWith('.mjs')) continue;
      const buf = readFileSync(file);
      raw += buf.length;
      gzip += gzipSync(buf, { level: 9 }).length;
      files += 1;
    }
    result['esm/** (aggregate)'] = { raw, gzip, files };
  }
  return result;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(DIST)) {
  fail('dist/ not present — run `pnpm build` first');
}

const current = measure();
log(`measured ${Object.keys(current).length} files`);

if (args.updateBaseline) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  log(`baseline updated → ${BASELINE}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  fail(`no baseline at ${BASELINE}. Run with --update-baseline to seed it.`);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const failures = [];
const summary = [];

for (const name of Object.keys(current)) {
  const cur = current[name];
  const base = baseline[name];
  if (!base) {
    summary.push(`  + ${name}: new (${formatBytes(cur.raw)} raw / ${formatBytes(cur.gzip)} gz)`);
    continue;
  }
  const rawGrowth = (cur.raw - base.raw) / base.raw;
  const gzGrowth = (cur.gzip - base.gzip) / base.gzip;
  const line = `  ${name}: ${formatBytes(cur.raw)} raw (${(rawGrowth * 100).toFixed(1)}%), ${formatBytes(cur.gzip)} gz (${(gzGrowth * 100).toFixed(1)}%)`;
  if (rawGrowth > args.budget || gzGrowth > args.budget) {
    failures.push(
      `${name}: raw ${(rawGrowth * 100).toFixed(1)}%, gz ${(gzGrowth * 100).toFixed(1)}% — exceeds +${(args.budget * 100).toFixed(0)}% budget`,
    );
  }
  summary.push(line);
}

for (const name of Object.keys(baseline)) {
  if (!current[name]) {
    failures.push(`${name}: dropped from dist (was ${formatBytes(baseline[name].raw)} raw)`);
  }
}

log('sizes:');
for (const s of summary) process.stdout.write(s + '\n');

if (failures.length) {
  process.stderr.write(`\n[verify:bundle-size] FAIL — ${failures.length} budget violation(s):\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.stderr.write(
    `\nIf the growth is intentional, run \`pnpm verify:bundle-size -- --update-baseline\` to acknowledge.\n`,
  );
  process.exit(1);
}

log(`OK — all ${Object.keys(current).length} tracked files within +${(args.budget * 100).toFixed(0)}% budget`);

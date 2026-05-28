#!/usr/bin/env node
/**
 * verify:pack — pack the factory into a tarball, install it as a real
 * dependency in scripts/verify/fixtures/pack-test/, and run `tsc --noEmit`
 * against a smoke file that imports a representative slice of the public
 * surface.
 *
 * Catches `.d.ts` referencing internal paths that don't survive publish.
 * Runs in ~30s on a warm cache.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const FIXTURE_SRC = join(FACTORY_ROOT, 'scripts/verify/fixtures/pack-test');

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

function log(msg) {
  process.stdout.write(`[verify:pack] ${msg}\n`);
}

function fail(msg, err) {
  process.stderr.write(`[verify:pack] FAIL: ${msg}\n`);
  if (err) process.stderr.write(err.stdout || err.stderr || err.message || String(err));
  process.exit(1);
}

// 1. Build the factory so dist/ is current.
log('building factory dist…');
try {
  run('pnpm build', { cwd: FACTORY_ROOT, stdio: 'inherit' });
} catch (err) {
  fail('pnpm build failed', err);
}

// 2. Pack into a temp directory so we don't pollute the repo root.
const stage = mkdtempSync(join(tmpdir(), 'verify-pack-'));
log(`staging at ${stage}`);
let tarballPath;
try {
  const out = run(`pnpm pack --pack-destination "${stage}"`, { cwd: FACTORY_ROOT });
  // pnpm pack prints the tarball name on stdout; grab the .tgz from the stage dir for safety.
  const tarballs = readdirSync(stage).filter((f) => f.endsWith('.tgz'));
  if (tarballs.length !== 1) fail(`expected exactly one tarball, got ${tarballs.length} (${out.trim()})`);
  tarballPath = join(stage, tarballs[0]);
  log(`packed → ${tarballPath}`);
} catch (err) {
  fail('pnpm pack failed', err);
}

// 3. Copy fixture into stage, slot the tarball in, install, typecheck.
const fixture = join(stage, 'pack-test');
cpSync(FIXTURE_SRC, fixture, { recursive: true });
renameSync(tarballPath, join(fixture, 'factory-tarball.tgz'));

log('installing tarball as a real dependency…');
try {
  run('pnpm install --silent --ignore-workspace --config.confirmModulesPurge=false', { cwd: fixture });
} catch (err) {
  fail('pnpm install of packed tarball failed', err);
}

log('running tsc against smoke.ts…');
let tscOutput = '';
try {
  tscOutput = run('npx --no-install tsc -p .', { cwd: fixture });
} catch (err) {
  fail('tsc against tarball failed — dist .d.ts is referencing something that did not publish', err);
}
if (tscOutput.trim()) {
  process.stdout.write(tscOutput);
}

// 4. (Optional) actually require the dist at runtime to catch import-side regressions.
log('runtime require() smoke…');
try {
  run(
    "node -e \"const f = require('tods-competition-factory'); if (!f.tournamentEngine || !f.syncEngine || !f.mocksEngine) { console.error('missing exports'); process.exit(1); }\"",
    {
      cwd: fixture,
    },
  );
} catch (err) {
  fail('require() smoke failed against tarball', err);
}

// 5. Clean stage.
if (!process.env.VERIFY_PACK_KEEP) {
  rmSync(stage, { recursive: true, force: true });
} else {
  log(`leaving stage in place (VERIFY_PACK_KEEP set): ${stage}`);
}

log('OK — published .d.ts compiles + dist requires + smoke runtime exports present');

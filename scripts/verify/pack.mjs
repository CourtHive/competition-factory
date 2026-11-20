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
import { cpSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const FIXTURE_SRC = join(FACTORY_ROOT, 'scripts/verify/fixtures/pack-test');

function run(cmd, opts = {}) {
  // a deadline on every child (punch list P62): a pack or install that hangs fails the check instead of stalling it
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', timeout: 1_200_000, killSignal: 'SIGKILL', ...opts });
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
  tscOutput += run('npx --no-install tsc -p tsconfig.async.json', { cwd: fixture });
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
    "node -e \"const f = require('tods-competition-factory'); if (!f.tournamentEngine || !f.syncEngine || !f.mocksEngine) { console.error('missing exports'); process.exit(1); } const schema = require('tods-competition-factory/schema/tournament.schema.json'); if (!schema?.definitions?.MatchUpSchedule) { console.error('schema subpath did not publish, or lacks MatchUpSchedule'); process.exit(1); }\"",
    {
      cwd: fixture,
    },
  );
} catch (err) {
  fail('require() smoke failed against tarball', err);
}

// The governors subpath, through the package's own `exports` map: require resolves the CJS shim,
// import resolves the ESM governors barrel. Both must carry the same governors as the root.
log('governors subpath smoke (require + import)…');
const subpathCheck = (sub, root) =>
  `if (typeof ${sub}.queryGovernor?.getParticipants !== 'function' || Object.keys(${sub}).length !== Object.keys(${root}.governors).length) { console.error('governors subpath does not match the root governors'); process.exit(1); }`;
try {
  run(
    `node -e "const sub = require('tods-competition-factory/governors'); const root = require('tods-competition-factory'); ${subpathCheck('sub', 'root')}"`,
    { cwd: fixture },
  );
  run(
    `node --input-type=module -e "import * as sub from 'tods-competition-factory/governors'; import * as root from 'tods-competition-factory'; ${subpathCheck('sub', 'root')}"`,
    { cwd: fixture },
  );
} catch (err) {
  fail('governors subpath smoke failed against tarball', err);
}

// The score-entry-state subpath, as a consumer of the PACKED tarball meets it: its declarations under Node's own
// resolution in both formats with no DOM lib, then two score states held at once by `require` and by `import`, with no
// DOM. The CJS run also asserts that loading it loads nothing of the root bundle.
log('score-entry-state subpath smoke (types nodenext, require + import, no DOM)…');
try {
  const out = [
    run('npx --no-install tsc -p tsconfig.scoreEntryState.json', { cwd: fixture }),
    run('node scoreEntryState.runtime.cjs', { cwd: fixture }),
    run('node scoreEntryState.runtime.mjs', { cwd: fixture }),
  ].join('');
  process.stdout.write(out);
} catch (err) {
  fail('score-entry-state subpath smoke failed against tarball', err);
}

// Both package conditions, type declarations without DOM, and a browser bundle through the public exports map.
log('constants subpath smoke (types nodenext, require + import, packed browser bundle)…');
try {
  process.stdout.write(
    [
      run('npx --no-install tsc -p tsconfig.constants.json', { cwd: fixture }),
      run('node constants.runtime.cjs', { cwd: fixture }),
      run('node constants.runtime.mjs', { cwd: fixture }),
      run('node constants.runtime.cjs', { cwd: fixture, env: { ...process.env, NODE_ENV: 'production' } }),
    ].join(''),
  );
  const browser = await build({
    absWorkingDir: fixture,
    stdin: {
      contents:
        "import { matchUpStatusConstants } from 'tods-competition-factory/constants'; console.log(matchUpStatusConstants.COMPLETED);",
      resolveDir: fixture,
    },
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
  });
  const inputs = Object.keys(browser.metafile.inputs).filter((p) => p !== '<stdin>');
  if (!inputs.length || inputs.some((p) => !p.replaceAll('\\', '/').includes('/dist/esm/constants/'))) {
    throw new Error(`packed constants browser graph escaped constants: ${inputs.join(', ')}`);
  }
  const bytes = browser.outputFiles[0].contents;
  log(
    `packed constants consumer: ${bytes.length} B min / ${gzipSync(bytes).length} B gzip; ${inputs.length} constants modules`,
  );
} catch (err) {
  fail('constants subpath smoke failed against tarball', err);
}

// The first read-only operator presentation contract is types-only: it must never load a runtime module.
log('operator presentation contracts (types only, both module formats)…');
try {
  process.stdout.write(run('npx --no-install tsc -p tsconfig.operator.json', { cwd: fixture }));
  process.stdout.write(run('node operator.runtime.mjs', { cwd: fixture }));
  const result = await build({
    absWorkingDir: fixture,
    stdin: {
      contents:
        "import type { OperatorDrawPresentation } from 'tods-competition-factory/operator-types'; export const value: OperatorDrawPresentation | undefined = undefined;",
      resolveDir: fixture,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
  });
  if (Object.keys(result.metafile.inputs).some((path) => path !== '<stdin>'))
    throw new Error('operator types retained a runtime dependency');
  log('operator types erase completely in a packed browser consumer');
} catch (err) {
  fail('operator presentation contract smoke failed against tarball', err);
}

// 5. Clean stage.
if (!process.env.VERIFY_PACK_KEEP) {
  rmSync(stage, { recursive: true, force: true });
} else {
  log(`leaving stage in place (VERIFY_PACK_KEEP set): ${stage}`);
}

log('OK — published .d.ts compiles + dist requires + smoke runtime exports present');

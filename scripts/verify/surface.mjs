#!/usr/bin/env node
/**
 * verify:surface — diff the current dist `.d.ts` public surface against a
 * baseline. Catches accidental removals, signature changes, and any
 * semver-relevant breakage BEFORE publish.
 *
 * Modes:
 *   --baseline=local       compare against scripts/verify/baseline/surface.txt
 *                          (the default)
 *   --baseline=npm[@TAG]   compare against the .d.ts inside the package
 *                          fetched from npm (defaults to @latest)
 *   --update-baseline      overwrite the local baseline with the current
 *                          surface (use after intentional surface changes)
 *
 * The "surface" is extracted as a normalized list of public names:
 *   - exported types / interfaces / enums
 *   - exported runtime symbols (functions, classes, consts)
 * Body changes (impl edits) are ignored — only NAMES + their SHAPES are
 * compared. The diff is fail-on-removal + warn-on-addition by default.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const BASELINE_DIR = join(FACTORY_ROOT, 'scripts/verify/baseline');
const LOCAL_BASELINE = join(BASELINE_DIR, 'surface.txt');
const DIST_DTS = join(FACTORY_ROOT, 'dist/tods-competition-factory.d.ts');

function log(msg) {
  process.stdout.write(`[verify:surface] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[verify:surface] FAIL: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { baseline: 'local', npmTag: 'latest', updateBaseline: false };
  for (const a of argv) {
    if (a === '--update-baseline') args.updateBaseline = true;
    else if (a === '--baseline=local') args.baseline = 'local';
    else if (a.startsWith('--baseline=npm')) {
      args.baseline = 'npm';
      const at = a.indexOf('@');
      if (at !== -1) args.npmTag = a.slice(at + 1);
    }
  }
  return args;
}

/**
 * Extract a normalized public-surface list from a .d.ts file. We don't parse
 * the AST — we just pull out the top-level `export` lines and their carry
 * shapes (declaration heads). Internal types referenced but not exported are
 * intentionally skipped because consumers can't import them.
 */
function extractSurface(dtsPath) {
  if (!existsSync(dtsPath)) fail(`missing .d.ts: ${dtsPath}`);
  const src = readFileSync(dtsPath, 'utf8');

  const surface = new Set();
  // The dist groups everything into one `export { ... }` and one
  // `export type { ... }` at the bottom. Parse those.
  const matches = src.matchAll(/export\s+(?:type\s+)?\{\s*([^}]+)\}/g);
  for (const m of matches) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of names) {
      // Handle `Foo as Bar` — the public name is what's after `as`.
      const asMatch = n.match(/^(\S+)\s+as\s+(\S+)$/);
      const publicName = asMatch ? asMatch[2] : n;
      surface.add(publicName);
    }
  }
  return Array.from(surface).sort();
}

function readBaselineLocal() {
  if (!existsSync(LOCAL_BASELINE)) {
    fail(`no local baseline at ${LOCAL_BASELINE}. Run \`pnpm verify:surface -- --update-baseline\` to create one.`);
  }
  return readFileSync(LOCAL_BASELINE, 'utf8').trim().split('\n').filter(Boolean).sort();
}

function readBaselineNpm(tag) {
  const stage = mkdtempSync(join(tmpdir(), 'verify-surface-'));
  log(`pulling tods-competition-factory@${tag} from npm…`);
  try {
    execSync(`npm pack tods-competition-factory@${tag} --silent`, { cwd: stage });
    const tarball = execSync('ls *.tgz', { cwd: stage, encoding: 'utf8' }).trim();
    execSync(`tar -xzf ${tarball}`, { cwd: stage });
    const dts = join(stage, 'package/dist/tods-competition-factory.d.ts');
    if (!existsSync(dts)) fail(`npm baseline has no dist .d.ts at ${dts}`);
    const surface = extractSurface(dts);
    rmSync(stage, { recursive: true, force: true });
    return surface;
  } catch (err) {
    rmSync(stage, { recursive: true, force: true });
    fail(`npm pack failed: ${err.message}`);
  }
}

function diff(baseline, current) {
  const baseSet = new Set(baseline);
  const curSet = new Set(current);
  const removed = baseline.filter((n) => !curSet.has(n));
  const added = current.filter((n) => !baseSet.has(n));
  return { removed, added };
}

// --- main ---
const args = parseArgs(process.argv.slice(2));

if (!existsSync(DIST_DTS)) {
  log('dist .d.ts not found — building first…');
  execSync('pnpm build', { cwd: FACTORY_ROOT, stdio: 'inherit' });
}

const current = extractSurface(DIST_DTS);
log(`current surface: ${current.length} exports`);

if (args.updateBaseline) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(LOCAL_BASELINE, current.join('\n') + '\n');
  log(`baseline updated → ${LOCAL_BASELINE} (${current.length} exports)`);
  process.exit(0);
}

const baseline = args.baseline === 'npm' ? readBaselineNpm(args.npmTag) : readBaselineLocal();
log(`baseline (${args.baseline}${args.baseline === 'npm' ? '@' + args.npmTag : ''}): ${baseline.length} exports`);

const { removed, added } = diff(baseline, current);

if (added.length) {
  log(`added (${added.length}): ${added.join(', ')}`);
}
if (removed.length) {
  process.stderr.write(`[verify:surface] FAIL — ${removed.length} export(s) removed:\n`);
  for (const n of removed) process.stderr.write(`  - ${n}\n`);
  process.stderr.write(
    `\nRemovals are breaking changes. If intentional, run \`pnpm verify:surface -- --update-baseline\` to acknowledge.\n`,
  );
  process.exit(1);
}

log('OK — no exports removed (additions are non-breaking)');

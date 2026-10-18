#!/usr/bin/env node
/**
 * verify:consumer-bundle — budget what a CONSUMER bundles, not what we publish.
 *
 * verify:bundle-size budgets the published files and verify:shakeable proves a leaf
 * import shakes; neither sets a ceiling on an engine import. This bundles each fixture
 * below from the built ESM entry the way an application's production build would
 * (esbuild: bundle, minify, tree shaking, ESM; gzip level 9), and compares raw + gzip
 * against `scripts/verify/baseline/consumer-bundle.json`. A fixture fails when either
 * grows beyond the budget (default +10 %).
 *
 * The esbuild metafile is summarised per source area (the first two path segments under
 * dist/esm, e.g. `query/matchUps`). The baseline keeps those areas too, so a failure names
 * the areas that grew and the largest modules inside them, not just a byte count.
 *
 *   --update-baseline   overwrite the baseline with the current measurements
 *   --budget=N          growth threshold (decimal, default 0.10)
 *   --top=N             contributors printed per fixture (default 8)
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const ESM_DIR = join(FACTORY_ROOT, 'dist/esm');
const ESM_ENTRY = join(ESM_DIR, 'index.mjs');
const BASELINE = join(FACTORY_ROOT, 'scripts/verify/baseline/consumer-bundle.json');

// Each body keeps its imports live (an unused import would itself be shaken away) and
// reads the way custom-engines.md tells a consumer to write it.
const FIXTURES = {
  'syncEngine + governors.queryGovernor': {
    imports: ['syncEngine', 'governors'],
    body: 'syncEngine.importMethods(governors.queryGovernor);\nconsole.log(typeof syncEngine.getParticipants);',
  },
  tournamentEngine: {
    imports: ['tournamentEngine'],
    body: 'console.log(typeof tournamentEngine.getParticipants);',
  },
  syncEngine: {
    imports: ['syncEngine'],
    body: 'console.log(typeof syncEngine.setState);',
  },
  'syncEngine + queryGovernor': {
    imports: ['syncEngine', 'queryGovernor'],
    body: 'syncEngine.importMethods(queryGovernor);\nconsole.log(typeof syncEngine.getParticipants);',
  },
};

function log(msg) {
  process.stdout.write(`[verify:consumer-bundle] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[verify:consumer-bundle] FAIL: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { updateBaseline: false, budget: 0.1, top: 8 };
  for (const a of argv) {
    if (a === '--update-baseline') args.updateBaseline = true;
    else if (a.startsWith('--budget=')) args.budget = Number.parseFloat(a.slice('--budget='.length));
    else if (a.startsWith('--top=')) args.top = Number.parseInt(a.slice('--top='.length), 10);
  }
  return args;
}

function formatBytes(n) {
  if (Math.abs(n) < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function percent(cur, base) {
  return base ? ((cur - base) / base) * 100 : 0;
}

// `dist/esm/query/matchUps/addGoesTo.mjs` → `query/matchUps`; root files keep their name.
function areaOf(modulePath) {
  const parts = modulePath.split('/');
  return parts.length > 2 ? parts.slice(0, 2).join('/') : parts.join('/');
}

async function measure(workdir, name, { imports, body }) {
  const entry = join(workdir, `${name.replaceAll(/\W+/g, '_')}.mjs`);
  writeFileSync(entry, `import { ${imports.join(', ')} } from ${JSON.stringify(ESM_ENTRY)};\n${body}\n`);

  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    minify: true,
    treeShaking: true,
    metafile: true,
    absWorkingDir: FACTORY_ROOT, // metafile input paths are relative to this
    write: false,
    logLevel: 'silent',
  });

  const contents = result.outputFiles[0].contents;
  const [output] = Object.values(result.metafile.outputs);
  const modules = {};
  for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
    const path = relative(ESM_DIR, resolve(FACTORY_ROOT, input)).replaceAll('\\', '/');
    if (path.startsWith('..') || !bytesInOutput) continue;
    modules[path] = bytesInOutput;
  }
  const areas = {};
  for (const [path, bytes] of Object.entries(modules)) {
    const area = areaOf(path);
    areas[area] = (areas[area] ?? 0) + bytes;
  }
  const sortedAreas = Object.fromEntries(Object.entries(areas).sort((a, b) => b[1] - a[1]));

  return {
    raw: contents.length,
    gzip: gzipSync(contents, { level: 9 }).length,
    modules: Object.keys(modules).length,
    areas: sortedAreas,
    moduleBytes: modules,
  };
}

function printContributors(cur, top) {
  for (const [area, bytes] of Object.entries(cur.areas).slice(0, top)) {
    process.stdout.write(`      ${formatBytes(bytes).padStart(9)}  ${area}\n`);
  }
}

// Areas ranked by growth against the baseline, each with its largest modules, so a failure
// says WHAT was pulled in.
function explainGrowth(cur, base, top) {
  const lines = [];
  const grown = Object.entries(cur.areas)
    .map(([area, bytes]) => [area, bytes - (base.areas?.[area] ?? 0), !base.areas?.[area]])
    .filter(([, delta]) => delta > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);
  for (const [area, delta, isNew] of grown) {
    lines.push(`      +${formatBytes(delta).padStart(9)}  ${area}${isNew ? '  (new area)' : ''}`);
    const largest = Object.entries(cur.moduleBytes)
      .filter(([path]) => areaOf(path) === area)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [path, bytes] of largest) lines.push(`                   ${formatBytes(bytes).padStart(9)}  ${path}`);
  }
  return lines;
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(ESM_ENTRY)) fail(`${ESM_ENTRY} not present — run \`pnpm build\` first`);

const workdir = mkdtempSync(join(tmpdir(), 'factory-consumer-bundle-'));
const current = {};
try {
  for (const [name, fixture] of Object.entries(FIXTURES)) current[name] = await measure(workdir, name, fixture);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (args.updateBaseline) {
  const baseline = {};
  for (const [name, { raw, gzip, modules, areas }] of Object.entries(current)) {
    baseline[name] = { raw, gzip, modules, areas };
  }
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  log(`baseline updated → ${BASELINE}`);
  process.exit(0);
}

if (!existsSync(BASELINE)) fail(`no baseline at ${BASELINE}. Run with --update-baseline to seed it.`);

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const failures = [];

for (const [name, cur] of Object.entries(current)) {
  const base = baseline[name];
  if (!base) {
    failures.push(`${name}: no baseline entry — run with --update-baseline to seed it`);
    continue;
  }
  const rawGrowth = percent(cur.raw, base.raw);
  const gzGrowth = percent(cur.gzip, base.gzip);
  const ceiling = Math.floor(base.gzip * (1 + args.budget));
  log(
    `${name}: ${formatBytes(cur.raw)} raw (${rawGrowth.toFixed(1)}%), ${formatBytes(cur.gzip)} gz ` +
      `(${gzGrowth.toFixed(1)}%; ceiling ${formatBytes(ceiling)}), ${cur.modules} modules`,
  );
  const over = rawGrowth > args.budget * 100 || gzGrowth > args.budget * 100;
  if (over) {
    failures.push(
      `${name}: raw ${rawGrowth.toFixed(1)}%, gz ${gzGrowth.toFixed(1)}% — exceeds +${(args.budget * 100).toFixed(0)}%`,
    );
    process.stdout.write('    grew (area, then its largest modules):\n');
    for (const line of explainGrowth(cur, base, args.top)) process.stdout.write(line + '\n');
  } else {
    process.stdout.write('    top contributors:\n');
    printContributors(cur, args.top);
  }
}

for (const name of Object.keys(baseline)) {
  if (!current[name]) failures.push(`${name}: in the baseline but no longer measured`);
}

if (failures.length) {
  process.stderr.write(`\n[verify:consumer-bundle] FAIL — ${failures.length} budget violation(s):\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.stderr.write(
    `\nIf the growth is intentional, run \`pnpm verify:consumer-bundle -- --update-baseline\` to acknowledge.\n`,
  );
  process.exit(1);
}

log(`OK — ${Object.keys(current).length} consumer fixtures within +${(args.budget * 100).toFixed(0)}% budget`);

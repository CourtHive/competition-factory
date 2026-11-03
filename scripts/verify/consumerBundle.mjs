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
 * Three kinds of check:
 *   - growth: each fixture against its own baseline (+10 % raw or gzip by default).
 *   - anchor: each fixture against its size at the last factory release
 *     (`scripts/verify/baseline/consumer-bundle-anchor.json`), +15 % raw or gzip. Raising the
 *     baseline does not move the anchor; only a release does (`--set-anchor`), so repeated
 *     acknowledgements cannot add up past the anchor budget between two releases.
 *   - shake ceilings: a narrow fixture's gzip as a share of tournamentEngine's, measured in
 *     the same run. A re-baseline cannot move these, so a governor that starts dragging in
 *     the rest of the library fails here even when the baseline was just raised.
 *
 *   --update-baseline --reason="..."  re-measure every fixture. The reason must name each
 *                                     source area that grew by AREA_NAMING_FLOOR bytes or more
 *                                     in any fixture; it is stored beside the numbers.
 *   --seed-new --reason="..."         add baseline entries for fixtures that have none, leaving
 *                                     the existing entries untouched, and seed an anchor for any
 *                                     fixture that has none from the current build
 *   --set-anchor=<checkout>           re-anchor on a release: <checkout> is a built checkout of
 *                                     the release tag (HEAD exactly at v<its package version>).
 *                                     Each fixture is bundled from its dist with this script's
 *                                     fixtures and esbuild; one that cannot be built there (an
 *                                     export the release lacks) is seeded from the current build.
 *   --budget=N                        growth threshold (decimal, default 0.10)
 *   --top=N                           contributors printed per fixture (default 8)
 */
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const ESM_DIR = join(FACTORY_ROOT, 'dist/esm');
const ESM_ENTRY = join(ESM_DIR, 'index.mjs');
const BASELINE = join(FACTORY_ROOT, 'scripts/verify/baseline/consumer-bundle.json');
const ANCHOR = join(FACTORY_ROOT, 'scripts/verify/baseline/consumer-bundle-anchor.json');

// Growth allowed over the last release, raw or gzip. Not a flag: it is the one number that
// --update-baseline cannot reach.
const ANCHOR_BUDGET = 0.15;

// Runtime exports TMX imports from the package root outside its tests (TMX src, 2026-11-02).
// TMX's real build bundles all of them together, so they are measured together.
const TMX_IMPORTS = [
  'availability',
  'AvailabilityEngine',
  'BookingTypeEnum',
  'competitionEngine',
  'computeRatingDistributionStats',
  'ContactRelationshipEnum',
  'drawDefinitionConstants',
  'drawsGovernor',
  'entryStatusConstants',
  'errorConditionConstants',
  'eventConstants',
  'extensionConstants',
  'factoryConstants',
  'FactoryError',
  'fixtures',
  'flightConstants',
  'genderConstants',
  'globalState',
  'hasScaleValueNumber',
  'keyValueConstants',
  'matchUpActionConstants',
  'matchUpFormatCode',
  'matchUpGovernor',
  'matchUpStatusConstants',
  'matchUpTypes',
  'mocksEngine',
  'mocksGovernor',
  'OnlineResourceTypeEnum',
  'participantConstants',
  'ParticipantRoleEnum',
  'participantRoles',
  'penaltyConstants',
  'policyComposer',
  'policyConstants',
  'positionActionConstants',
  'practiceGovernor',
  'publishingGovernor',
  'queryGovernor',
  'ratingConstants',
  'resolveScaleValueNumber',
  'scaleConstants',
  'scaleEngine',
  'scheduleGovernor',
  'scoreGovernor',
  'timeItemConstants',
  'tools',
  'tournamentEngine',
  'tournamentGovernor',
  'unwrap',
  'unwrapOr',
  'version',
  'weekdayConstants',
];

const keepLive = (imports) => `console.log(${imports.map((name) => `typeof ${name}`).join(', ')});`;

// Where `tods-competition-factory/governors` resolves for a bundler (the `import` condition),
// read from a checkout's package.json so the fixture exercises the published mapping.
function governorsSubpath(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const target = pkg.exports?.['./governors']?.import?.default;
  return target ? join(root, target) : undefined;
}

// Each body keeps its imports live (an unused import would itself be shaken away).
const FIXTURES = {
  // The trap form custom-engines.md warns against. esbuild keeps every governor for any use of
  // the `governors` namespace imported by name; rolldown and rollup keep only the governor read
  // here (rolldown, not after `const { queryGovernor } = governors`). Measured, not ceilinged.
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
  // A scoring client: the score governor plus tools and fixtures, no engine.
  'scoreGovernor + tools + fixtures': {
    imports: ['scoreGovernor', 'tools', 'fixtures'],
    body: keepLive(['scoreGovernor', 'tools', 'fixtures']),
  },
  'TMX import union': {
    imports: TMX_IMPORTS,
    body: keepLive(TMX_IMPORTS),
  },
  // The namespace form that shakes everywhere: a direct `import * as` of the governors subpath.
  'syncEngine + governors subpath namespace': {
    imports: ['syncEngine'],
    namespaces: { governors: governorsSubpath },
    body: 'syncEngine.importMethods(governors.queryGovernor);\nconsole.log(typeof syncEngine.getParticipants);',
  },
};

// The share of tournamentEngine's gzip a narrow fixture may reach. Each is a form
// custom-engines.md recommends; at 2026-11-03 they measure 2.7 %, 35 %, 25 % and 35 %. A
// form that stopped shaking would land near 100 %.
const REFERENCE_FIXTURE = 'tournamentEngine';
const SHAKE_CEILINGS = {
  syncEngine: 0.05,
  'syncEngine + queryGovernor': 0.5,
  'scoreGovernor + tools + fixtures': 0.4,
  'syncEngine + governors subpath namespace': 0.5,
};

// An --update-baseline reason must name every area that grew by at least this many minified
// bytes in some fixture.
const AREA_NAMING_FLOOR = 2048;

function log(msg) {
  process.stdout.write(`[verify:consumer-bundle] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[verify:consumer-bundle] FAIL: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { updateBaseline: false, seedNew: false, setAnchor: '', reason: '', budget: 0.1, top: 8 };
  for (const a of argv) {
    if (a === '--update-baseline') args.updateBaseline = true;
    else if (a.startsWith('--set-anchor=')) args.setAnchor = resolve(a.slice('--set-anchor='.length));
    else if (a === '--seed-new') args.seedNew = true;
    else if (a.startsWith('--reason=')) args.reason = a.slice('--reason='.length).trim();
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

// `root` is the checkout whose dist is bundled: this one, or a release checkout for --set-anchor.
async function measure(workdir, name, { imports, namespaces = {}, body }, root = FACTORY_ROOT) {
  const esmDir = join(root, 'dist/esm');
  const lines = [`import { ${imports.join(', ')} } from ${JSON.stringify(join(esmDir, 'index.mjs'))};`];
  for (const [local, locate] of Object.entries(namespaces)) {
    const target = locate(root);
    if (!target || !existsSync(target)) throw new Error(`${name}: no ${local} module in ${root}`);
    lines.push(`import * as ${local} from ${JSON.stringify(target)};`);
  }
  const entry = join(workdir, `${name.replaceAll(/\W+/g, '_')}.mjs`);
  writeFileSync(entry, `${lines.join('\n')}\n${body}\n`);

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
    const path = relative(esmDir, resolve(FACTORY_ROOT, input)).replaceAll('\\', '/');
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

const previous = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const anchor = existsSync(ANCHOR) ? JSON.parse(readFileSync(ANCHOR, 'utf8')) : { fixtures: {} };

function writeAnchor(next) {
  mkdirSync(dirname(ANCHOR), { recursive: true });
  writeFileSync(ANCHOR, JSON.stringify(next, null, 2) + '\n');
}

function seedAnchor(name, date) {
  const { raw, gzip } = current[name];
  return { raw, gzip, seeded: date };
}

async function setAnchor(checkout) {
  if (!existsSync(join(checkout, 'dist/esm/index.mjs')))
    fail(`${checkout} has no built dist — run \`pnpm build\` there`);
  const { version } = JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8'));
  const git = (...cmd) =>
    execFileSync('git', ['-C', checkout, ...cmd], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    }).trim();
  const tagAtHead = () => {
    try {
      return git('describe', '--exact-match', '--tags', 'HEAD');
    } catch {
      return '';
    }
  };
  const tag = tagAtHead();
  if (tag !== `v${version}`)
    fail(`${checkout} is not checked out at the release tag v${version} (HEAD tag: ${tag || 'none'})`);
  const date = new Date().toISOString().slice(0, 10);
  const fixtures = {};
  const dir = mkdtempSync(join(tmpdir(), 'factory-consumer-anchor-'));
  try {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      try {
        const { raw, gzip } = await measure(dir, name, fixture, checkout);
        fixtures[name] = { raw, gzip };
      } catch {
        fixtures[name] = seedAnchor(name, date);
        log(`${name}: cannot be built from ${tag}; anchor seeded from the current build`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  writeAnchor({ release: tag, commit: git('rev-parse', 'HEAD'), measured: date, fixtures });
  log(`anchor set to ${tag} for ${Object.keys(fixtures).length} fixture(s) → ${ANCHOR}`);
  process.exit(0);
}

if (args.setAnchor) await setAnchor(args.setAnchor);

// Areas that grew by AREA_NAMING_FLOOR or more in a fixture that already has a baseline.
function grownAreas(name) {
  const base = previous[name];
  if (!base?.areas) return {};
  const grown = {};
  for (const [area, bytes] of Object.entries(current[name].areas)) {
    const delta = bytes - (base.areas[area] ?? 0);
    if (delta >= AREA_NAMING_FLOOR) grown[area] = delta;
  }
  return grown;
}

function acknowledge(names) {
  if (!args.reason) fail('a baseline change needs --reason="..." naming the areas that grew');
  const grownByFixture = Object.fromEntries(names.map((name) => [name, grownAreas(name)]));
  const mustName = [...new Set(Object.values(grownByFixture).flatMap((grown) => Object.keys(grown)))];
  const unnamed = mustName.filter((area) => !args.reason.includes(area));
  if (unnamed.length) {
    fail(
      `the reason does not name ${unnamed.length} area(s) that grew by ${formatBytes(AREA_NAMING_FLOOR)} or more: ` +
        unnamed.join(', '),
    );
  }
  const date = new Date().toISOString().slice(0, 10);
  const next = { ...previous };
  for (const name of names) {
    const { raw, gzip, modules, areas } = current[name];
    const acknowledged = { date, reason: args.reason, previousGzip: previous[name]?.gzip ?? null };
    if (Object.keys(grownByFixture[name]).length) acknowledged.grew = grownByFixture[name];
    next[name] = { raw, gzip, modules, acknowledged, areas };
  }
  for (const name of Object.keys(next)) if (!current[name]) delete next[name];
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
  log(`baseline updated for ${names.length} fixture(s) → ${BASELINE}`);
  // A fixture new since the last release has no anchor; it is anchored where it starts.
  const unanchored = Object.keys(current).filter((name) => !anchor.fixtures?.[name]);
  if (unanchored.length) {
    const fixtures = { ...anchor.fixtures };
    for (const name of unanchored) fixtures[name] = seedAnchor(name, date);
    writeAnchor({ ...anchor, fixtures });
    log(`anchor seeded for ${unanchored.length} fixture(s): ${unanchored.join(', ')}`);
  }
  process.exit(0);
}

if (args.updateBaseline) acknowledge(Object.keys(current));
if (args.seedNew) acknowledge(Object.keys(current).filter((name) => !previous[name]));

if (!existsSync(BASELINE)) fail(`no baseline at ${BASELINE}. Run with --update-baseline to seed it.`);

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const failures = [];

for (const [name, cur] of Object.entries(current)) {
  const base = baseline[name];
  if (!base) {
    failures.push(`${name}: no baseline entry — run with --seed-new --reason="..." to seed it`);
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

const growthFailures = failures.length;
for (const [name, cur] of Object.entries(current)) {
  const anchored = anchor.fixtures?.[name];
  if (!anchored) {
    failures.push(`${name}: no anchor — run with --seed-new --reason="..." to seed it`);
    continue;
  }
  const rawGrowth = percent(cur.raw, anchored.raw);
  const gzGrowth = percent(cur.gzip, anchored.gzip);
  log(
    `${name}: ${gzGrowth.toFixed(1)}% gz, ${rawGrowth.toFixed(1)}% raw over ${anchor.release ?? 'the anchor'}` +
      `${anchored.seeded ? ` (seeded ${anchored.seeded})` : ''}`,
  );
  if (rawGrowth > ANCHOR_BUDGET * 100 || gzGrowth > ANCHOR_BUDGET * 100) {
    failures.push(
      `${name}: raw ${rawGrowth.toFixed(1)}%, gz ${gzGrowth.toFixed(1)}% over ${anchor.release ?? 'the anchor'} — ` +
        `exceeds the +${(ANCHOR_BUDGET * 100).toFixed(0)}% anchor budget`,
    );
  }
}
const anchorFailures = failures.length - growthFailures;

const reference = current[REFERENCE_FIXTURE];
for (const [name, ceiling] of Object.entries(SHAKE_CEILINGS)) {
  const share = current[name].gzip / reference.gzip;
  log(`${name}: ${(share * 100).toFixed(1)}% of ${REFERENCE_FIXTURE} gz (ceiling ${(ceiling * 100).toFixed(0)}%)`);
  if (share > ceiling) {
    failures.push(
      `${name}: ${(share * 100).toFixed(1)}% of ${REFERENCE_FIXTURE} gz exceeds its ${(ceiling * 100).toFixed(0)}% shake ceiling — ` +
        'an import that should shake now retains most of the library',
    );
  }
}

if (failures.length) {
  process.stderr.write(`\n[verify:consumer-bundle] FAIL — ${failures.length} budget violation(s):\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  if (growthFailures) {
    process.stderr.write(
      `\nIf the growth is intentional, run \`pnpm verify:consumer-bundle -- --update-baseline --reason="..."\`, naming the areas that grew.\n`,
    );
  }
  if (anchorFailures) {
    process.stderr.write(
      `\nThe anchor moves only at a release (--set-anchor, see scripts/verify/README.md); no baseline flag raises it.\n`,
    );
  }
  if (failures.length > growthFailures + anchorFailures) {
    process.stderr.write(
      '\nA shake ceiling is not a budget: find the import that pulls the library in. No flag raises it.\n',
    );
  }
  process.exit(1);
}

log(
  `OK — ${Object.keys(current).length} consumer fixtures within +${(args.budget * 100).toFixed(0)}% of the baseline ` +
    `and +${(ANCHOR_BUDGET * 100).toFixed(0)}% of ${anchor.release}, ${Object.keys(SHAKE_CEILINGS).length} under their shake ceilings`,
);

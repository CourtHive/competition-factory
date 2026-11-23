#!/usr/bin/env node
/**
 * `verify:docs-methods` — every engine method a doc calls must exist on that engine.
 *
 * WHY THIS IS SEPARATE FROM `verify:docs-imports`
 *
 * That check proves the IMPORT resolves. It says nothing about what you then call: a doc can import
 * `tournamentEngine` perfectly and invoke a method that has never existed. One did — `getMatchUps`,
 * corrected to `allTournamentMatchUps` in #4808 — and 83 more were found once this was measured.
 *
 * A documented method name is not a typo in prose. It is the name a reader will send, and for a
 * consumer driving the engine over a wire it fails as METHOD_NOT_FOUND at the far side, surfacing as
 * "the mutation didn't work" with nothing naming the cause. TMX shipped exactly that bug
 * (`resetMatchUpLinesUps`), live in two UI actions, for as long as the constant had existed.
 *
 * TWO TRAPS, both hit while prototyping this
 *
 * 1. A bare `engine.` is AMBIGUOUS. The docs use it for the availability engine and the ScoringEngine
 *    as well as a factory engine, so resolving it to `tournamentEngine` invented 127 failures out of
 *    213. Named engines are checked against that engine; a bare `engine.x()` is checked only against
 *    the UNION of everything the package exports (and the members of every exported class), so it fails
 *    only when no surface at all has `x` — `engine.addFlights`, `engine.getPlayoffFinishingPositionRanges`.
 *    Nothing is guessed. `tools.x()` / `tools.a.b()` and `<name>Governor.x()` are checked exactly.
 * 2. `asyncEngine` exposes ZERO enumerable keys — the export is an uninstantiated factory function,
 *    not an engine. A surface with no enumerable keys is SKIPPED and reported as skipped, because
 *    failing against it would mark every call missing.
 *
 * It reads the built package, so it measures what a consumer gets rather than what source implies.
 */
import { REPO_ROOT } from '../lib/repoRoot.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DOCS = path.join(REPO_ROOT, 'documentation', 'docs');
const DIST = path.join(ROOT, 'dist', 'index.js');
const BASELINE = path.join(ROOT, 'scripts', 'verify', 'docMethods.baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

if (!fs.existsSync(DIST)) {
  console.error(`[docs-methods] ${path.relative(ROOT, DIST)} not found — run \`pnpm build\` first.`);
  process.exit(2);
}
const pkg = require(DIST);

/** Deliberately explicit. A bare `engine` is not here, and must not be added. */
const ENGINE_NAMES = [
  'tournamentEngine',
  'competitionEngine',
  'syncEngine',
  'asyncEngine',
  'mocksEngine',
  'scaleEngine',
  'askEngine',
  'sanctioningEngine',
  'matchUpEngine',
  'officiatingEngine',
];

const surfaces = new Map();
const skipped = [];
for (const name of ENGINE_NAMES) {
  const surface = pkg[name];
  if (!surface) continue;
  const keys = Object.keys(surface);
  if (!keys.length) {
    skipped.push(name);
    continue;
  }
  surfaces.set(name, new Set(keys));
}

// A bare `engine.x()` must exist SOMEWHERE: an export, a key of an export (two levels: scoreGovernor.ScoringEngine),
// or a member of an exported class (ScoringEngine, AvailabilityEngine instances).
const isClass = (value) => typeof value === 'function' && /^class\b/.test(Function.prototype.toString.call(value));
const anywhere = new Set(Object.keys(pkg));
function absorb(value, depth) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return;
  Object.keys(value).forEach((key) => anywhere.add(key));
  if (isClass(value)) {
    for (let proto = value.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto))
      Object.getOwnPropertyNames(proto).forEach((member) => anywhere.add(member));
  }
  if (depth > 0 && typeof value === 'object') Object.values(value).forEach((child) => absorb(child, depth - 1));
}
Object.values(pkg).forEach((value) => absorb(value, 1));
const governors = new Map(
  Object.keys(pkg)
    .filter((name) => /Governor$/.test(name) && pkg[name] && typeof pkg[name] === 'object')
    .map((name) => [name, pkg[name]]),
);
const TOOLS_CALL = /\btools\.([a-zA-Z_$][\w$]*)(?:\.([a-zA-Z_$][\w$]*))?\s*\(/g;
const counts = { engine: 0, tools: 0, governors: 0 };

const IGNORE = /doc-methods:ignore/;
const FENCE = /^```(js|javascript|ts|typescript|jsx|tsx)\b/i;
const CALL = /\b([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)\s*\(/g;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.mdx?$/.test(entry.name) ? [full] : [];
  });
}

const failures = [];
let checked = 0;
let ignoredFences = 0;

for (const file of walk(DOCS)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let open = null;
  lines.forEach((line, index) => {
    if (open) {
      if (/^```\s*$/.test(line)) {
        open = null;
        return;
      }
      if (open.ignored) return;
      const at = `${path.relative(REPO_ROOT, file)}:${index + 1}`;
      for (const [, member, nested] of line.matchAll(TOOLS_CALL)) {
        counts.tools += 1;
        const found = nested ? pkg.tools?.[member] && nested in pkg.tools[member] : pkg.tools && member in pkg.tools;
        if (!found) failures.push(`${at}  tools.${member}${nested ? '.' + nested : ''}()`);
      }
      for (const [, object, method] of line.matchAll(CALL)) {
        if (object === 'engine') {
          counts.engine += 1;
          if (!anywhere.has(method)) failures.push(`${at}  engine.${method}()`);
          continue;
        }
        if (governors.has(object)) {
          counts.governors += 1;
          if (!(method in governors.get(object))) failures.push(`${at}  ${object}.${method}()`);
          continue;
        }
        const surface = surfaces.get(object);
        if (!surface) continue;
        checked += 1;
        if (!surface.has(method)) {
          failures.push(`${path.relative(REPO_ROOT, file)}:${index + 1}  ${object}.${method}()`);
        }
      }
      return;
    }
    if (FENCE.test(line)) {
      const previous = lines.slice(Math.max(0, index - 2), index).join('\n');
      const ignored = IGNORE.test(previous);
      if (ignored) ignoredFences += 1;
      open = { ignored };
    }
  });
}

const key = (failure) => {
  const [where, ...rest] = failure.split('  ');
  return JSON.stringify([where.replace(/:\d+$/, ''), rest.join('  ')]);
};

console.log(
  `[docs-methods] ${checked} engine call(s) checked across ${surfaces.size} engines` +
    `; ${counts.engine} bare engine., ${counts.tools} tools. and ${counts.governors} governor call(s) checked` +
    (skipped.length ? `; skipped ${skipped.join(', ')} (no enumerable methods — proxy surface)` : '') +
    (ignoredFences ? `; ${ignoredFences} fence(s) ignored` : ''),
);

if (UPDATE) {
  const entries = [...new Set(failures.map(key))].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        comment:
          'Documented engine calls that do not exist on the engine. Shrink this by fixing them — ' +
          'never grow it to silence a finding. Regenerate: pnpm verify:docs-methods --update-baseline',
        generated: 'node scripts/verify/docMethods.mjs --update-baseline',
        count: entries.length,
        entries,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[docs-methods] baseline rewritten with ${entries.length} entr(ies)`);
  process.exit(0);
}

const baselined = new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries : []);
const fresh = failures.filter((failure) => !baselined.has(key(failure)));
const stale = [...baselined].filter((entry) => !failures.some((failure) => key(failure) === entry));
if (stale.length)
  console.log(`[docs-methods] ${stale.length} baseline entr(ies) now fixed — rerun with --update-baseline`);

if (fresh.length) {
  console.error(`\n[docs-methods] ${fresh.length} documented call(s) name no engine method:\n`);
  for (const failure of fresh) console.error('  ' + failure);
  console.error(
    '\nThe engine answers an unknown name with METHOD_NOT_FOUND. A reader who copies one of these\n' +
      'gets a call that silently does nothing. For an illustrative placeholder, mark the fence with\n' +
      '`<!-- doc-methods:ignore -->` rather than baselining it.',
  );
  process.exit(1);
}

console.log(`[docs-methods] OK — ${baselined.size} known, 0 new`);

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
 *    213. Only explicitly named engines are checked; nothing is guessed.
 * 2. `asyncEngine` exposes ZERO enumerable keys — it is a proxy. A surface with no enumerable keys is
 *    SKIPPED and reported as skipped, because failing against it would mark every call missing.
 *
 * It reads the built package, so it measures what a consumer gets rather than what source implies.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DOCS = path.join(ROOT, 'documentation', 'docs');
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
      for (const [, object, method] of line.matchAll(CALL)) {
        const surface = surfaces.get(object);
        if (!surface) continue;
        checked += 1;
        if (!surface.has(method)) {
          failures.push(`${path.relative(ROOT, file)}:${index + 1}  ${object}.${method}()`);
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

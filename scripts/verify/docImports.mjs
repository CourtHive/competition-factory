#!/usr/bin/env node
/**
 * `verify:docs-imports` — every import a doc tells a reader to write must actually resolve.
 *
 * WHY THIS EXISTS
 *
 * The policy docs contained 68 import statements across 17 files that resolve to `undefined`:
 * `import { POLICY_SEEDING_ITF } from 'tods-competition-factory'` names something that is not a root
 * export. Nothing caught it, for a specific and repeatable reason — `src/tests/documentation/*`
 * import by MODULE PATH (`@Fixtures/policies/POLICY_SEEDING_ITF`), so they stay green while the
 * documented package-level path is broken. A test that never crosses the public surface cannot see a
 * public-surface defect. That is the same shape as the LADDER reachability gap.
 *
 * It matters more than a typo because the failure is SILENT. `policyDefinitions: undefined` reads as
 * "no policy supplied", so generation falls back to its own defaults and reports nothing. A reader
 * who follows the docs gets a draw that looks fine and is seeded by the wrong rules.
 *
 * WHAT IT CHECKS
 *
 * Code fences tagged js/javascript/ts/typescript, for imports from the bare package specifier only.
 * Each named binding must exist on the built package; a default import fails because there is no
 * default export. Subpath specifiers are out of scope.
 *
 * OPTING OUT
 *
 * A fence that deliberately shows a WRONG import (the "these do not work" block in
 * policies/seedingPolicy.md) is skipped when the line before it is `<!-- doc-imports:ignore -->` or,
 * in MDX, `{/* doc-imports:ignore *\/}`.
 *
 * Requires a build first — it reads `dist/index.js`, not source, because the question is what a
 * CONSUMER gets.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DOCS = path.join(ROOT, 'documentation', 'docs');
const PACKAGE_SPECIFIER = 'tods-competition-factory';
const DIST = path.join(ROOT, 'dist', 'index.js');
const BASELINE = path.join(ROOT, 'scripts', 'verify', 'docImports.baseline.json');
const CI = process.argv.includes('--ci');
const UPDATE = process.argv.includes('--update-baseline');

if (!fs.existsSync(DIST)) {
  console.error(`[docs-imports] ${path.relative(ROOT, DIST)} not found — run \`pnpm build\` first.`);
  process.exit(2);
}

const pkg = require(DIST);
const IGNORE = /doc-imports:ignore/;
const FENCE = /^```(js|javascript|ts|typescript|jsx|tsx)\b/i;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every fenced code block, with the line it starts on and whether it was opted out. */
function codeBlocks(lines) {
  const blocks = [];
  let open = null;
  lines.forEach((line, index) => {
    if (open) {
      if (/^```\s*$/.test(line)) {
        blocks.push(open);
        open = null;
      } else open.body.push(line);
      return;
    }
    if (FENCE.test(line)) {
      const previous = lines.slice(Math.max(0, index - 2), index).join('\n');
      open = { startLine: index + 1, body: [], ignored: IGNORE.test(previous) };
    }
  });
  return blocks;
}

/** Import statements in a block that target the bare package specifier. */
function packageImports(body) {
  const source = body.join('\n');
  const found = [];
  const re = new RegExp(String.raw`import\s+([\s\S]*?)\s+from\s+['"]${PACKAGE_SPECIFIER}['"]`, 'g');
  let match;
  while ((match = re.exec(source)) !== null) {
    const clause = match[1].trim();
    // A non-greedy clause can still run past an EARLIER import's specifier when two imports share a
    // fence — `import { it } from 'vitest'` followed by a factory import would otherwise be read as
    // one clause, and `it` reported as a missing factory export. A real clause never contains `from`.
    if (/\bfrom\b/.test(clause)) continue;
    const offset = source.slice(0, match.index).split('\n').length - 1;
    found.push({ clause, offset });
  }
  return found;
}

/** Bindings a clause requests: named bindings, plus a marker for a default import. */
function bindings(clause) {
  const named = [];
  let hasDefault = false;
  let namespaced = false;

  // `import type { X }` asks for a compile-time binding. It never has to exist at runtime, and the
  // leading `type` would otherwise be misread as a default import.
  if (/^type\s/.test(clause)) return { named, hasDefault, namespaced, typeOnly: true };

  const braced = clause.match(/\{([\s\S]*)\}/);
  if (braced) {
    for (const part of braced[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      // `import { type Foo }` asks for a type, which never exists at runtime.
      if (name && !name.startsWith('type ')) named.push(name);
    }
  }
  const beforeBrace = clause.split('{')[0].trim().replace(/,$/, '').trim();
  if (beforeBrace) {
    if (/^\*\s+as\s+/.test(beforeBrace)) namespaced = true;
    else if (beforeBrace) hasDefault = true;
  }
  return { named, hasDefault, namespaced };
}

const failures = [];
let checked = 0;
let ignored = 0;

for (const file of walk(DOCS)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const block of codeBlocks(lines)) {
    for (const { clause, offset } of packageImports(block.body)) {
      if (block.ignored) {
        ignored += 1;
        continue;
      }
      checked += 1;
      const line = block.startLine + offset + 1;
      const where = `${path.relative(ROOT, file)}:${line}`;
      const { named, hasDefault, typeOnly } = bindings(clause);
      if (typeOnly) continue;
      if (hasDefault) {
        failures.push(`${where}  default import — the package has no default export`);
      }
      for (const name of named) {
        if (pkg[name] === undefined) failures.push(`${where}  { ${name} } is not a root export`);
      }
    }
  }
}

console.log(`[docs-imports] ${checked} package import(s) checked, ${ignored} deliberately ignored`);

// The baseline records what was already broken when the check landed, so the gate could be turned on
// without a 60-file rewrite in the same change. It is a RATCHET: shrink it by fixing entries, never
// grow it to silence a finding. Line numbers move, so an entry is keyed on file + binding only.
const key = (failure) => {
  const [where, ...rest] = failure.split('  ');
  return JSON.stringify([where.replace(/:\d+$/, ''), rest.join('  ')]);
};

if (UPDATE) {
  const entries = [...new Set(failures.map(key))].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        comment:
          'Documented imports that do not resolve against the built package. Shrink this by fixing ' +
          'them — never grow it to silence a finding. Regenerate: pnpm verify:docs-imports --update-baseline',
        generated: 'node scripts/verify/docImports.mjs --update-baseline',
        count: entries.length,
        entries,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[docs-imports] baseline rewritten with ${entries.length} entr(ies)`);
  process.exit(0);
}

const baselined = new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).entries : []);
const fresh = failures.filter((failure) => !baselined.has(key(failure)));
const stale = [...baselined].filter((entry) => !failures.some((failure) => key(failure) === entry));

if (stale.length) {
  console.log(`[docs-imports] ${stale.length} baseline entr(ies) now fixed — rerun with --update-baseline to shrink`);
}

if (fresh.length) {
  console.error(`\n[docs-imports] ${fresh.length} NEW unresolvable binding(s):\n`);
  for (const failure of fresh) console.error('  ' + failure);
  console.error(
    '\nRoot exports are namespaces, not flat names. Use `fixtures.policies.X`, `policyConstants.X`,\n' +
      '`drawDefinitionConstants.X`, or a governor — and `import { tournamentEngine }`, not a default\n' +
      'import. An unresolved policy import fails SILENTLY: `policyDefinitions: undefined` reads as\n' +
      '"none supplied" and generation quietly uses its own defaults.\n' +
      '\nDo NOT run --update-baseline to silence this.',
  );
  process.exit(1);
}

console.log(`[docs-imports] OK — ${baselined.size} known, 0 new` + (CI ? '' : ' (pass --ci in automation)'));

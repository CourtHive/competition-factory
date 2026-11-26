#!/usr/bin/env node
/**
 * `verify:docs-provenance` — public text states rules, not who decided them or where that was recorded.
 *
 * ## What this guards
 *
 * The published documentation, the READMEs and the CHANGELOG are read by people outside the project. They used to
 * carry the project's internal governance trail: who ruled on a behaviour and when ("(CA 2026-10-18)", "ruling 33",
 * "ruling OPEN-4"), pointers into the private planning repository (its paths, its task list, plan and finding ids
 * such as P58 or F-042), and the "controlling session" phrase. None of that is checkable by a reader, and a rule
 * written as "X, per ruling N" tells them less than the rule written plainly. They were rewritten to state the
 * behaviour itself; this gate stops them coming back.
 *
 * ## What it checks
 *
 * Every tracked text file under `documentation/` (the lockfile and binaries aside), the repository README, and the
 * package README and CHANGELOG, line by line, against `RULES` (`scripts/lib/provenanceRules.mjs`, which
 * `verify:source-provenance` shares for comments and test titles everywhere else). Each rule uses word boundaries so an identifier that
 * merely contains the letters (`CAPS`, `documentation`, the `P32` of `SET1-S:P32`) is not a hit.
 *
 * ## Why the whole CHANGELOG, with no marker or baseline
 *
 * release-please prepends each release's notes from commit subjects, so a reference in a commit subject reaches the
 * CHANGELOG on the next release. The historical entries were cleaned in the same change that added this gate, so the
 * whole file is checked: that is strictly stronger than checking only entries above a marker, and it leaves nothing
 * (a marker line, a recorded baseline) for a later edit or a release-please rewrite to move or go stale. A new entry
 * that carries a reference fails the release PR; reword it there (or, better, keep it out of the commit subject).
 *
 * ## Allowing a legitimate use
 *
 * Add an entry to `ALLOW`: the rule, a regex the whole LINE must match, and why. An entry that no longer matches any
 * line fails as STALE, so the list only shrinks by deletion and cannot keep a dead permission.
 *
 * Self-test:  node scripts/verify/docsProvenance.mjs --self-test   (fires on each rule, quiet on the near misses)
 */
import { REPO_ROOT, repoPath } from '../lib/repoRoot.mjs';
import { RULES } from '../lib/provenanceRules.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TAG = '[verify:docs-provenance]';

/** Each governance reference, by name; shared with `verify:source-provenance`. */
export { RULES };

/**
 * Legitimate lines a rule would otherwise flag. `file` is repo-relative; `line` must match the whole line's text.
 * Two-letter `CA` is also California, as a mock nationality or state code.
 */
export const ALLOW = [
  {
    rule: 'ca',
    file: 'documentation/docs/policies/avoidance.md',
    line: /'USA-CA'/,
    why: 'ISO 3166-2 subdivision code (California) in an avoidance example',
  },
  {
    rule: 'ca',
    file: 'documentation/docs/testing/mocks-engine-participants.md',
    line: /^\s*CA: \d+,/,
    why: 'state code key (California) in a mocks participant distribution',
  },
  {
    rule: 'ca',
    file: 'documentation/docs/testing/mocks-engine-patterns.md',
    line: /^\s*CA: \d+,/,
    why: 'state code key (California) in a mocks participant distribution',
  },
];

const TEXT = /\.(md|mdx|json|jsonc|js|jsx|mjs|cjs|ts|tsx|css|scss|ya?ml|txt|html|svg)$/i;
const SKIP = [/(^|\/)pnpm-lock\.yaml$/, /(^|\/)package-lock\.json$/];

/** The files the gate reads, repo-relative: tracked text under documentation/, the READMEs and the CHANGELOG. */
function targets() {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'documentation'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const docs = out
    .split('\0')
    .filter(Boolean)
    .filter((file) => TEXT.test(file) && !SKIP.some((skip) => skip.test(file)));
  const extra = ['README.md', repoPath('README.md'), repoPath('CHANGELOG.md')];
  return [...new Set([...docs, ...extra])];
}

/** Every hit in `files` ({ path: text }), allowlist applied; plus the allowlist entries that matched nothing. */
export function check(files, { rules = RULES, allow = ALLOW } = {}) {
  const hits = [];
  const used = new Set();
  for (const [file, text] of Object.entries(files)) {
    text.split('\n').forEach((line, index) => {
      for (const rule of rules) {
        const match = rule.pattern.exec(line);
        if (!match) continue;
        const permit = allow.findIndex((a) => a.rule === rule.name && a.file === file && a.line.test(line));
        if (permit >= 0) {
          used.add(permit);
          continue;
        }
        hits.push({ file, line: index + 1, col: match.index + 1, rule: rule.name, what: rule.what, text: line.trim() });
      }
    });
  }
  const stale = allow.filter((entry, index) => !used.has(index) && entry.file in files);
  return { hits, stale };
}

function selfTest() {
  const assert = (ok, what) => {
    if (!ok) {
      console.error(`${TAG} self-test FAILED — ${what}`);
      process.exit(1);
    }
  };
  const fires = (text, rule) => check({ 'x.md': text }, { allow: [] }).hits.some((hit) => hit.rule === rule);
  const quiet = (text) => check({ 'x.md': text }, { allow: [] }).hits.length === 0;

  // each rule fires on the forms that were in the docs
  const positives = [
    ['a closed segment takes no input (CA 2026-10-18)', 'ca'],
    ["v1 meets CA's rulings", 'ca'],
    ['One exception (CA, ruling 33): when', 'ca'],
    ['a match clock with overtime (`-M:`; Ruling 1)', 'ruling-id'],
    ['a BYE is a BYE (ruling OPEN-1)', 'ruling-id'],
    ['instead of a BYE (ruling (A), 2026-10-21)', 'ruling-id'],
    ['(hydration OPEN-14)', 'open-id'],
    ['the ledger is being retired, Mentat P58', 'mentat'],
    ['see `Mentat/planning/SCHEDULING_PIPELINE_VNEXT.md`', 'mentat'],
    ['as agreed in the controlling session', 'controlling-session'],
    ['tracked separately in TASKS.', 'tasks'],
    ['Resolved (P58, 2026-10-22)', 'plan-id'],
    ['P59 remains open', 'plan-id'],
    ['under a standing dual award (F-042)', 'finding-id'],
    ['opens none: SE2a-D3b', 'decision-id'],
    ['the order is debate-ruled', 'debate-ruled'],
    ['renumbers them all (SE2c-D6)', 'decision-id'],
  ];
  for (const [text, rule] of positives) assert(fires(text, rule), `${rule} should fire on: ${text}`);

  // near misses stay quiet: identifiers, format codes, ordinary words
  const negatives = [
    'CAPS and CANCELLED and ABC_CA_X',
    'the documentation and its implementation',
    '`SET1-S:P32` stops at a combined total; plain `P32` permits a tie',
    'Round 1: P1 vs P2, P3 vs P4, P5 vs P6',
    "a default is a referee's ruling against a named participant",
    'policy for controlling consolation behavior',
    'issue F-1 and F-42 and F-0420',
    'tasks are queued',
  ];
  for (const text of negatives) assert(quiet(text), `should be quiet on: ${text}`);

  // the allowlist: a matching line passes, a non-matching line on the same file still fails, an unused entry is stale
  const allow = [{ rule: 'ca', file: 'a.md', line: /'USA-CA'/, why: 'test' }];
  const allowed = check({ 'a.md': "key: 'USA-CA'" }, { allow });
  assert(allowed.hits.length === 0 && allowed.stale.length === 0, 'an allowlisted line passes');
  const other = check({ 'a.md': "key: 'USA-CA'\n(CA 2026-10-18)" }, { allow });
  assert(other.hits.length === 1 && other.hits[0].line === 2, 'the allowlist covers its line only');
  assert(check({ 'b.md': "key: 'USA-CA'" }, { allow }).hits.length === 1, 'the allowlist covers its file only');
  assert(check({ 'a.md': 'nothing here' }, { allow }).stale.length === 1, 'an unused allowlist entry is STALE');

  // the live allowlist's own lines are what it says they are
  for (const entry of ALLOW)
    assert(
      RULES.some((rule) => rule.name === entry.rule),
      `ALLOW names a rule: ${entry.rule}`,
    );

  console.log(
    `${TAG} self-test OK — ${positives.length} references fire across ${RULES.length} rules; ${negatives.length} near misses quiet; allowlist scoped by rule, file and line, stale entries fail`,
  );
}

function run() {
  const paths = targets();
  // The control: a gate that read nothing reports clean. Assert the walk found the docs and the CHANGELOG.
  const required = ['documentation/docs/concepts/outcome-pipeline.md', repoPath('CHANGELOG.md'), repoPath('README.md')];
  const missing = required.filter((path) => !paths.includes(path));
  if (paths.length < 200 || missing.length) {
    console.error(
      `${TAG} only ${paths.length} files found (missing: ${missing.join(', ') || 'none'}) — the walk is wrong`,
    );
    process.exit(1);
  }
  const files = Object.fromEntries(paths.map((path) => [path, readFileSync(join(REPO_ROOT, path), 'utf8')]));
  const { hits, stale } = check(files);
  if (hits.length || stale.length) {
    if (hits.length) {
      console.error(`${TAG} FAIL — ${hits.length} internal governance reference(s) in public text:`);
      for (const hit of hits)
        console.error(`  ${hit.file}:${hit.line}:${hit.col}  [${hit.rule}] ${hit.what}\n      ${hit.text}`);
      console.error(
        'State the behaviour, rule or rationale itself in plain technical language: drop who decided it, the ruling or plan id, and any pointer into the planning repository. A legitimate use goes in ALLOW in scripts/verify/docsProvenance.mjs, with a reason.',
      );
    }
    for (const entry of stale)
      console.error(`  STALE allowlist entry: [${entry.rule}] ${entry.file} ${entry.line} — delete it`);
    process.exit(1);
  }
  console.log(
    `${TAG} OK — ${paths.length} files, no internal governance references (${ALLOW.length} allowlisted lines)`,
  );
}

if (process.argv.includes('--self-test')) selfTest();
else run();

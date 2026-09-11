#!/usr/bin/env node
/**
 * verify:audit — fail on high/critical advisories.
 *
 * Factory has zero runtime deps, so this is almost entirely about dev-tree
 * awareness. We only fail on `high` or `critical` advisories; moderate/low
 * are surfaced for visibility but don't gate publish.
 *
 * SCOPE — audits every lockfile in the repo, not just the package's.
 * `documentation/` carries its own lockfile and is not a pnpm workspace member,
 * so an audit run only at FACTORY_ROOT never saw it. That reported "no
 * high/critical advisories" for the repo while two high advisories sat open in
 * the docs tree — a check whose scope silently excluded where the finding was,
 * which is worse than no check because it settles the question.
 *
 * WAIVERS — `audit-waivers.json` lists advisories this gate will not fail on.
 * The alternative was leaving `documentation/` unaudited, which is the bug this
 * fixes, or a permanently-red gate that every PR has to be merged around, which
 * trains people to ignore it. Every waiver is printed on every run, and a waiver
 * that no longer matches an open advisory FAILS — so the list cannot quietly
 * accumulate exceptions after the advisories behind them are resolved.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const WAIVERS_PATH = join(__dirname, 'audit-waivers.json');

/** Every tree with its own lockfile. `name` is what a waiver's `tree` matches. */
const TREES = [
  { name: 'package', cwd: FACTORY_ROOT },
  { name: 'documentation', cwd: join(FACTORY_ROOT, 'documentation') },
];

const BLOCKING = new Set(['high', 'critical']);

function log(msg) {
  process.stdout.write(`[verify:audit] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[verify:audit] ${msg}\n`);
  process.exit(1);
}

/** Run `pnpm audit --json` in one tree and return its parsed report. */
function auditTree(cwd) {
  let json;
  try {
    json = execSync('pnpm audit --json', { cwd, encoding: 'utf8' });
  } catch (err) {
    // pnpm audit exits non-zero when ANY advisory is found; the JSON is still
    // on stdout for parsing.
    json = err.stdout || '';
    if (!json) fail(`could not run pnpm audit in ${cwd}: ${err.message}`);
  }
  try {
    return JSON.parse(json);
  } catch {
    return fail(`pnpm audit produced non-JSON output in ${cwd}:\n${json}`);
  }
}

const waiverFile = existsSync(WAIVERS_PATH) ? JSON.parse(readFileSync(WAIVERS_PATH, 'utf8')) : { waivers: [] };
const waivers = waiverFile.waivers ?? [];
const matchedWaivers = new Set();

const blocking = [];
const waived = [];
const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };

for (const tree of TREES) {
  if (!existsSync(join(tree.cwd, 'pnpm-lock.yaml'))) {
    log(`skipping ${tree.name} — no pnpm-lock.yaml`);
    continue;
  }

  const report = auditTree(tree.cwd);
  const meta = report.metadata?.vulnerabilities ?? {};
  for (const key of Object.keys(counts)) counts[key] += meta[key] ?? 0;

  for (const advisory of Object.values(report.advisories ?? {})) {
    if (!BLOCKING.has(advisory.severity)) continue;

    const ghsa = advisory.github_advisory_id;
    const waiver = waivers.find((w) => w.ghsa === ghsa && w.module === advisory.module_name && w.tree === tree.name);

    const entry = { tree: tree.name, ghsa, module: advisory.module_name, title: advisory.title, url: advisory.url };
    if (waiver) {
      matchedWaivers.add(waiver.ghsa);
      waived.push({ ...entry, reason: waiver.reason });
    } else {
      blocking.push(entry);
    }
  }
}

log(
  `advisories across ${TREES.map((t) => t.name).join(' + ')} — ` +
    `critical: ${counts.critical}, high: ${counts.high}, moderate: ${counts.moderate}, ` +
    `low: ${counts.low}, info: ${counts.info}`,
);

// Print waived advisories every run. A waiver that stops being visible is a
// waiver nobody revisits.
for (const w of waived) {
  log(`WAIVED ${w.ghsa} — ${w.module} (${w.tree}): ${w.title}`);
  log(`        ${w.reason}`);
}

// A waiver matching nothing means the advisory was resolved (or the entry was
// wrong). Either way it must go, or the list only ever widens what is ignored.
const stale = waivers.filter((w) => !matchedWaivers.has(w.ghsa));
if (stale.length) {
  for (const w of stale) {
    process.stderr.write(`[verify:audit] STALE WAIVER ${w.ghsa} (${w.module}, ${w.tree}) matches no open advisory.\n`);
  }
  fail(`FAIL — ${stale.length} stale waiver(s) in scripts/verify/audit-waivers.json. Delete them.`);
}

if (blocking.length) {
  for (const b of blocking) {
    process.stderr.write(`[verify:audit] ${b.ghsa} — ${b.module} (${b.tree}): ${b.title}\n${b.url}\n`);
  }
  fail(`FAIL — ${blocking.length} unwaived high/critical advisory(ies). Resolve before publish.`);
}

log(`OK — no unwaived high/critical advisories${waived.length ? ` (${waived.length} waived)` : ''}`);

#!/usr/bin/env node
/**
 * Every BREAKING commit since the last release must appear in the migration guide.
 *
 * The CHANGELOG cannot do this job. release-please builds it from `BREAKING CHANGE:` footers, and a
 * PR that carries three breaking changes under one footer yields one entry — which is exactly how
 * 7.0.0 came to have 8 breaking changes in its guide and 6 in its changelog. #4782 declared one
 * footer for three, #4783 one for two. The guide is hand-maintained and was right; the generated
 * file was the lossy view.
 *
 * So this gates the guide, not the changelog: a breaking commit whose PR number is absent from
 * `documentation/docs/migration-<next major>.0.0.md` fails the run.
 *
 * THIS CHECK MUST NOT BE ABLE TO PASS QUIETLY. A shallow clone has neither the base tag nor the
 * history, and a naive implementation would find zero breaking commits and report success — a check
 * that cannot report dirty. Every precondition below is therefore an error, not a skip.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = join(ROOT, '.release-please-manifest.json');

const log = (m) => process.stdout.write(`[verify:migration-coverage] ${m}\n`);
const fail = (m) => {
  process.stderr.write(`[verify:migration-coverage] FAIL — ${m}\n`);
  process.exit(1);
};

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 });

if (!existsSync(MANIFEST)) fail(`no release manifest at ${MANIFEST}`);
const released = JSON.parse(readFileSync(MANIFEST, 'utf8'))['.'];
if (!/^\d+\.\d+\.\d+$/.test(released ?? '')) fail(`manifest '.' is not a version: ${released}`);

const baseTag = `v${released}`;
const nextMajor = Number(released.split('.')[0]) + 1;
const guidePath = `documentation/docs/migration-${nextMajor}.0.0.md`;

// Precondition, not a skip: without the base tag there is nothing to diff against.
try {
  execFileSync('git', ['rev-parse', '--verify', `${baseTag}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
} catch {
  fail(
    `base tag ${baseTag} is not present. This is usually a shallow clone —\n` +
      `  a shallow checkout finds zero breaking commits and would report success, so it errors instead.\n` +
      `  CI must check out with \`fetch-depth: 0\`.`,
  );
}

const RECORD = '\x1e';
const UNIT = '\x1f';
const raw = git(['log', `--format=%H${UNIT}%s${UNIT}%b${RECORD}`, `${baseTag}..HEAD`]);
const commits = raw
  .split(RECORD)
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [sha, subject, body] = c.split(UNIT);
    return { sha: sha.slice(0, 9), subject: subject ?? '', body: body ?? '' };
  });

const isBreaking = (c) => /^[a-z]+(\([^)]*\))?!:/.test(c.subject) || /^BREAKING CHANGE:/m.test(c.body);
const breaking = commits.filter(isBreaking);

log(`base ${baseTag} · ${commits.length} commits · ${breaking.length} breaking`);

if (!breaking.length) {
  log('OK — no breaking commits since the last release');
  process.exit(0);
}

if (!existsSync(join(ROOT, guidePath))) {
  fail(`${breaking.length} breaking commit(s) since ${baseTag} but no ${guidePath}`);
}
const guide = readFileSync(join(ROOT, guidePath), 'utf8');

/**
 * The PR this run belongs to, when it is a `pull_request` build.
 *
 * WHY THIS EXISTS, and it is a defect this gate caused rather than found. A breaking commit on an
 * OPEN pr carries no `(#NNNN)` — GitHub appends that on squash-merge — so the `unreferenced` check
 * below could not pass before merge, and the only way to make CI green was to type the number into
 * the subject by hand. The squash then appended a second one, and release-please emitted BOTH:
 *
 *   fix(scoring)!: take back the exits a matchUp produced … (#4855) (#4855)
 *
 * shipping a doubled reference into the published 7.0.0 changelog. Measured 2026-09-13: #4827,
 * #4855 and #4858 all carry it, by three different sessions, which makes it the gate's behaviour
 * rather than anyone's slip.
 *
 * On a `pull_request` build GitHub sets `GITHUB_REF` to `refs/pull/<N>/merge`, so the number is
 * already available and does not need to be in the subject. An un-numbered breaking commit in such a
 * build is exactly one the open PR is adding, so attributing it to that PR is not a guess.
 */
const prFromEnv = process.env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\/merge$/)?.[1];

const missing = [];
const unreferenced = [];
for (const commit of breaking) {
  // `?? prFromEnv` and NOT `||` — a subject that already carries the number always wins, so a
  // merged commit is still checked against its own PR rather than the build's.
  const pr = commit.subject.match(/\(#(\d+)\)\s*$/)?.[1] ?? prFromEnv;
  if (!pr) {
    unreferenced.push(commit);
    continue;
  }
  if (!guide.includes(`#${pr}`)) missing.push({ ...commit, pr });
}

if (unreferenced.length) {
  process.stderr.write(`\n[verify:migration-coverage] ${unreferenced.length} breaking commit(s) carry no (#PR):\n`);
  for (const c of unreferenced) process.stderr.write(`  ${c.sha}  ${c.subject}\n`);
  process.stderr.write(
    `\n  On a pull_request build the number is read from GITHUB_REF, so it does NOT belong in the\n` +
      `  commit subject — the squash-merge appends it and you get "(#1234) (#1234)" in the changelog.\n` +
      `  Running locally there is no PR yet: reference the number in the guide once the PR is open,\n` +
      `  and let CI do the matching.\n`,
  );
}
if (missing.length) {
  process.stderr.write(
    `\n[verify:migration-coverage] ${missing.length} breaking commit(s) absent from ${guidePath}:\n`,
  );
  for (const c of missing) process.stderr.write(`  #${c.pr}  ${c.sha}  ${c.subject}\n`);
}

if (missing.length || unreferenced.length) {
  process.stderr.write(
    `\nA breaking change that is not in the migration guide ships undocumented. The CHANGELOG does not\n` +
      `cover for it: it is generated from BREAKING CHANGE footers, and a PR carrying several breaking\n` +
      `changes under one footer produces one entry.\n\n` +
      `Add a section to ${guidePath} referencing the PR number, e.g. "(#1234)". Do NOT add the\n` +
      `number to the commit subject — the squash-merge appends it.\n`,
  );
  process.exit(1);
}

log(`OK — all ${breaking.length} breaking commit(s) are represented in ${guidePath}`);

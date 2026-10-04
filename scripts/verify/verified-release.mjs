#!/usr/bin/env node
/**
 * verify:verified-release — the publish gate: the code being published is code a full `verify` passed.
 *
 * WHY (CA, 2026-10-04): `prepublishOnly` re-ran the whole `pnpm verify` chain at tag time, ~45 minutes on
 * one runner, on a commit whose code the checkpoint into `master` had just verified. With the release PR's
 * own ~55 minute run, a publish trailed a green checkpoint by about 100 minutes and tested the same tree
 * twice more. A release commit is release-please's: it changes the version and the changelog and nothing
 * else. So instead of re-testing that tree, this proves it was tested:
 *
 *   1. The release commit R changes only the version files: `package.json`'s `"version"` line,
 *      `CHANGELOG.md` and `.release-please-manifest.json`.
 *   2. Its parent P, the `master` tip the release was cut on, was verified, by either
 *      a. a successful `Verify` push run on P (the full Node matrix, under the differential), or
 *      b. P being a checkpoint merge whose PR head P^2 has a successful `Verify` pull_request run that
 *         STARTED AFTER P^1 landed. `master` advances only by merges, so P^1 was the base that run merged
 *         onto, and P's tree is the tree it tested.
 *      Either run must show `verify:coverage` succeeding, so a run whose heavy steps were skipped never
 *      counts.
 *
 * If neither holds yet, it waits for (a) up to `--wait` minutes (the push run on `master` starts when the
 * checkpoint merges), then fails. Anything else fails at once: an unverified tree is never published.
 *
 * Usage: node scripts/verify/verified-release.mjs [--ref <release commit>] [--wait <minutes>] [--dry]
 *   needs GITHUB_TOKEN (or GH_TOKEN) with actions:read, and GITHUB_REPOSITORY (owner/name).
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const ref = option('ref', 'HEAD');
const waitMinutes = Number(option('wait', '0'));
const repository = process.env.GITHUB_REPOSITORY ?? 'CourtHive/competition-factory';
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const VERSION_FILES = new Set(['package.json', 'CHANGELOG.md', '.release-please-manifest.json']);

const log = (message) => console.log(`[verified-release] ${message}`);
const fail = (message) => {
  console.error(`[verified-release] FAIL — ${message}`);
  process.exit(1);
};
const git = (...gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8' }).trim();

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: { Accept: 'application/vnd.github+json', ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (!response.ok) fail(`GET ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

// 1. the release commit changes the version and the changelog, nothing else
function checkReleaseCommit(release) {
  const changed = git('diff', '--name-only', `${release}^`, release).split('\n').filter(Boolean);
  const outside = changed.filter((file) => !VERSION_FILES.has(file));
  if (!changed.length) fail(`${release} changes nothing`);
  if (outside.length) fail(`${release} changes more than the version files: ${outside.join(', ')}`);
  const packageLines = git('diff', '-U0', `${release}^`, release, '--', 'package.json')
    .split('\n')
    .filter((line) => /^[-+](?![-+])/.test(line));
  const notVersion = packageLines.filter((line) => !/^[-+]\s*"version":/.test(line));
  if (notVersion.length) fail(`${release} changes package.json beyond its version: ${notVersion.join(' | ')}`);
  log(`release commit ${release.slice(0, 10)} changes only ${changed.join(', ')}`);
}

const coverageSucceeded = async (run) => {
  const { jobs } = await api(`/actions/runs/${run.id}/jobs?per_page=100`);
  return jobs.some((job) =>
    job.steps?.some((step) => step.name === 'verify:coverage' && step.conclusion === 'success'),
  );
};

async function verifiedRuns(headSha, event) {
  const query = `head_sha=${headSha}&event=${event}&status=success&per_page=50`;
  const { workflow_runs: runs } = await api(`/actions/workflows/verify.yml/runs?${query}`);
  const verified = [];
  for (const run of runs ?? []) if (await coverageSucceeded(run)) verified.push(run);
  return verified;
}

// 2a. a push run on P itself
async function pushRunVerifies(parent) {
  const [run] = await verifiedRuns(parent, 'push');
  if (run) log(`parent ${parent.slice(0, 10)} verified by push run ${run.id}`);
  return !!run;
}

// 2b. the checkpoint PR's own run, started after the base it merged onto had landed
async function checkpointRunVerifies(parent) {
  const parents = git('rev-list', '--parents', '-n', '1', parent).split(' ').slice(1);
  if (parents.length !== 2) return false;
  const [base, head] = parents;
  const baseLanded = new Date(git('show', '-s', '--format=%cI', base));
  const runs = await verifiedRuns(head, 'pull_request');
  const run = runs.find((candidate) => new Date(candidate.run_started_at ?? candidate.created_at) > baseLanded);
  if (run)
    log(
      `parent ${parent.slice(0, 10)} is a checkpoint merge; its PR head ${head.slice(0, 10)} verified by run ${run.id}, started after ${base.slice(0, 10)} landed`,
    );
  return !!run;
}

const release = git('rev-parse', ref);
const parent = git('rev-parse', `${release}^`);
checkReleaseCommit(release);
if (args.includes('--dry')) log('dry run: checking runs read-only');

const deadline = Date.now() + waitMinutes * 60_000;
for (;;) {
  if ((await checkpointRunVerifies(parent)) || (await pushRunVerifies(parent))) {
    log('OK — the published tree is a tree `verify` passed');
    process.exit(0);
  }
  if (Date.now() >= deadline)
    fail(`no successful Verify run covers ${parent.slice(0, 10)} (waited ${waitMinutes} min)`);
  log(`no verified run for ${parent.slice(0, 10)} yet; waiting for the push run on master`);
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}

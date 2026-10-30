#!/usr/bin/env node
/**
 * Collapse `gh-pages` to a single commit holding exactly the current site.
 *
 *   node scripts/squashGhPages.mjs          # from the factory repo or documentation/
 *   node scripts/squashGhPages.mjs --dry    # show what would be pushed, push nothing
 *
 * `docusaurus deploy` clones gh-pages at depth 1 and commits each build ON TOP of the previous one, so every
 * `docpub` adds a commit and nothing ever leaves. By 2026-10-19 that was 503 builds since 2021-03-31, holding about
 * 310 MiB of the repo's 426 MiB pack. GitHub Pages serves only the tip, so the history has no reader.
 *
 * This replaces the tip with a parentless commit of the SAME tree (checked before pushing, so the live site
 * cannot change) and force-pushes it leased to the tip it read, so a publish that lands in between is never
 * overwritten. Nothing is checked out. Run by `docpub` after each deploy; idempotent: a single-commit gh-pages is
 * left as it is.
 */
import { execFileSync } from 'node:child_process';

const BRANCH = 'gh-pages';
const dry = process.argv.includes('--dry');
// a deadline on every child (punch list P62): a fetch or push that hangs fails the script instead of stalling it
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', timeout: 300_000, killSignal: 'SIGKILL' }).trim();

git('fetch', '--quiet', 'origin', BRANCH);
const tip = git('rev-parse', `origin/${BRANCH}`);
const count = Number(git('rev-list', '--count', tip));
if (count === 1) {
  console.log(`[squash-gh-pages] ${BRANCH} is already a single commit (${tip.slice(0, 10)}); nothing to do`);
  process.exit(0);
}

const tree = git('rev-parse', `${tip}^{tree}`);
const subject = git('log', '-1', '--format=%s', tip);
const squashed = git(
  'commit-tree',
  tree,
  '-m',
  subject,
  '-m',
  `${BRANCH} squashed to one commit by scripts/squashGhPages.mjs; it replaced ${count} deploy commits.`,
);
if (git('rev-parse', `${squashed}^{tree}`) !== tree) throw new Error('squashed commit does not hold the deployed tree');

console.log(
  `[squash-gh-pages] ${count} commits -> 1: ${tip.slice(0, 10)} -> ${squashed.slice(0, 10)} (tree ${tree.slice(0, 10)})`,
);
if (dry) {
  console.log('[squash-gh-pages] --dry: nothing pushed');
  process.exit(0);
}
git('push', `--force-with-lease=refs/heads/${BRANCH}:${tip}`, 'origin', `${squashed}:refs/heads/${BRANCH}`);
console.log(`[squash-gh-pages] pushed; ${BRANCH} is ${squashed.slice(0, 10)}`);

#!/usr/bin/env node
/**
 * Fail if `pnpm-lock.yaml` records the pnpm BINARY distribution as a package-manager dependency.
 *
 * pnpm 12 writes the package manager itself into the lockfile under `packageManagerDependencies`.
 * Which entry it writes depends on how the running pnpm was installed: the Node distribution records
 * `pnpm`, the standalone binary records `@pnpm/exe` plus one optional platform package per OS/arch.
 *
 * Only `pnpm` belongs here. An `@pnpm/exe` block is written by an invocation that does not match the
 * `packageManager` pin, and a matching pnpm strips it out again — so the checkout goes permanently
 * dirty for everyone whose pnpm IS correct, and `git status` stops distinguishing churn from real
 * work. It was cleaned out of six repos on 2026-09-08 (#29 CourtHive.com, #1426 TMX, #967
 * competition-factory-server, #53 courthive-query, #326 epixodic, #90 provider-config); factory never
 * carried it and must not gain it.
 *
 * This guard exists because HUNTING THE WRITER FAILED. On 2026-09-13 the block reappeared in the
 * shared checkout, and none of the four invocation paths available on that machine reproduced it:
 * the fnm/corepack shim, `~/Library/pnpm/bin/pnpm`, `/opt/homebrew/bin/pnpm`, and `corepack pnpm`
 * all left the lockfile free of it. Whatever writes it is transient or lives outside those paths, so
 * detection is the durable answer and attribution is not required.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCKFILE = resolve(process.cwd(), 'pnpm-lock.yaml');

/**
 * The BARE `@pnpm/exe` only — never the per-platform siblings.
 *
 * `@pnpm/exe.darwin-arm64`, `@pnpm/exe.linux-x64` and the rest are legitimate OPTIONAL dependencies
 * of `pnpm@12.x` and appear in a perfectly clean lockfile; this repo's committed one carries 24 such
 * lines. Matching `@pnpm/exe` as a substring therefore fails a clean lockfile — caught here by the
 * positive control below rather than in CI, which is the whole reason that control exists. The
 * negative lookahead excludes anything continuing the package name.
 */
const FORBIDDEN = /@pnpm\/exe(?![.\w-])/;

let contents;
try {
  contents = readFileSync(LOCKFILE, 'utf8');
} catch {
  console.error(`[verify:lockfile] cannot read ${LOCKFILE}`);
  process.exit(1);
}

// The control: a lockfile that does not record the package manager at all would pass this check
// vacuously, and that is a different problem worth failing on rather than ignoring.
if (!contents.includes('packageManagerDependencies:')) {
  console.error('[verify:lockfile] no `packageManagerDependencies` block — is this a pnpm 12 lockfile?');
  process.exit(1);
}

const offending = contents
  .split('\n')
  .map((line, index) => ({ line: line.trim(), number: index + 1 }))
  .filter(({ line }) => FORBIDDEN.test(line));

if (offending.length) {
  console.error(`[verify:lockfile] ${offending.length} line(s) record the pnpm binary distribution:`);
  for (const { line, number } of offending.slice(0, 10)) console.error(`  ${number}: ${line}`);
  console.error('');
  console.error('  The pnpm BINARY distribution must not be recorded in this lockfile — only `pnpm`.');
  console.error('  Discard it by name and do not stage it:');
  console.error('');
  console.error('      git checkout -- pnpm-lock.yaml');
  console.error('');
  console.error('  If the block keeps returning, the pnpm that wrote it does not match the');
  console.error('  `packageManager` pin in package.json. Never `git checkout .` to clear it.');
  process.exit(1);
}

console.log('[verify:lockfile] OK — package manager recorded as `pnpm`, no bare `@pnpm/exe`');

/**
 * Where the repository and the package are, for tests that read files outside the package.
 *
 * The test-side twin of `scripts/lib/repoRoot.mjs` (same rules; `repoRoot.test.ts` holds the two to the same
 * answers). A test that reads `documentation/` reads it from REPO_ROOT, not from the current directory, so it
 * passes both today, with the package at the repository root, and after the move to
 * `packages/competition-factory`.
 *
 *   REPO_ROOT     the nearest ancestor holding `.release-please-manifest.json`
 *   PACKAGE_ROOT  the nearest ancestor holding a `package.json` named `tods-competition-factory`
 *
 * Both walk up from this file, never from the current directory. A root that cannot be found throws.
 */
import { dirname, join, relative, sep } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PACKAGE_NAME = 'tods-competition-factory';
export const RELEASE_MANIFEST = '.release-please-manifest.json';

function findUp(start: string, test: (dir: string) => boolean): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    if (test(dir)) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

function isPackageRoot(dir: string): boolean {
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) return false;
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

export type Roots = { REPO_ROOT: string; PACKAGE_ROOT: string; PACKAGE_PATH: string };

/** The roots seen from `fromDir`. Throws when either is missing. */
export function findRoots(fromDir: string): Roots {
  const packageRoot = findUp(fromDir, isPackageRoot);
  if (!packageRoot) throw new Error(`no package.json named ${PACKAGE_NAME} at or above ${fromDir}`);
  const repoRoot = findUp(fromDir, (dir) => existsSync(join(dir, RELEASE_MANIFEST)));
  if (!repoRoot) throw new Error(`no ${RELEASE_MANIFEST} at or above ${fromDir}`);
  const packagePath = relative(repoRoot, packageRoot).split(sep).join('/') || '.';
  if (packagePath.startsWith('..')) throw new Error(`package ${packageRoot} is outside the repository ${repoRoot}`);
  return { REPO_ROOT: repoRoot, PACKAGE_ROOT: packageRoot, PACKAGE_PATH: packagePath };
}

export const { REPO_ROOT, PACKAGE_ROOT, PACKAGE_PATH } = findRoots(dirname(fileURLToPath(import.meta.url)));

/** A file named from the repository root, e.g. `repoFile('documentation/docs/concepts/randomness.md')`. */
export const repoFile = (path: string): string => join(REPO_ROOT, path);

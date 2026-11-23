/**
 * Where the repository and the package are, for scripts that reach outside the package.
 *
 * WHY THIS EXISTS. The package is moving from the repository root to `packages/competition-factory`
 * (Mentat/planning/FACTORY_LAYOUT_MOVE_PLAN.md). Most scripts resolve paths inside the package, from
 * their own location, and keep working wherever the package sits. A few reach things that stay at
 * the repository root: `documentation/`, the workspace lockfile, the release-please manifest and the
 * sibling checkouts. Those resolve from here, so they are right on both layouts.
 *
 *   REPO_ROOT     the nearest ancestor holding `.release-please-manifest.json`
 *   PACKAGE_ROOT  the nearest ancestor holding a `package.json` named `tods-competition-factory`
 *   PACKAGE_PATH  PACKAGE_ROOT relative to REPO_ROOT, posix: `.` today, `packages/competition-factory`
 *                 after the move. It is the package's key in the release-please manifest, and the
 *                 prefix git prints on the package's files.
 *
 * Both walk up from THIS file, never from the current directory, so a script finds the same roots
 * from any working directory. A root that cannot be found throws: a script must not fall back to a
 * guess and then check the wrong tree.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_NAME = 'tods-competition-factory';
export const RELEASE_MANIFEST = '.release-please-manifest.json';

function findUp(start, test) {
  for (let dir = start; ; dir = dirname(dir)) {
    if (test(dir)) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

function isPackageRoot(dir) {
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) return false;
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).name === PACKAGE_NAME;
  } catch {
    return false;
  }
}

/** The roots seen from `fromDir`: `{ REPO_ROOT, PACKAGE_ROOT, PACKAGE_PATH }`. Throws when either is missing. */
export function findRoots(fromDir) {
  const packageRoot = findUp(fromDir, isPackageRoot);
  if (!packageRoot) throw new Error(`no package.json named ${PACKAGE_NAME} at or above ${fromDir}`);
  const repoRoot = findUp(fromDir, (dir) => existsSync(join(dir, RELEASE_MANIFEST)));
  if (!repoRoot) throw new Error(`no ${RELEASE_MANIFEST} at or above ${fromDir}`);
  const packagePath = relative(repoRoot, packageRoot).split(sep).join('/') || '.';
  if (packagePath.startsWith('..')) throw new Error(`package ${packageRoot} is outside the repository ${repoRoot}`);
  return { REPO_ROOT: repoRoot, PACKAGE_ROOT: packageRoot, PACKAGE_PATH: packagePath };
}

export const { REPO_ROOT, PACKAGE_ROOT, PACKAGE_PATH } = findRoots(dirname(fileURLToPath(import.meta.url)));

/** A package-relative path as git names it from REPO_ROOT: `package.json` today, `packages/…/package.json` later. */
export const repoPath = (packageRelative) =>
  PACKAGE_PATH === '.' ? packageRelative : `${PACKAGE_PATH}/${packageRelative}`;

import * as scriptRoots from '../../../scripts/lib/repoRoot.mjs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as roots from './repoRoot';

/**
 * The two root helpers (scripts/lib/repoRoot.mjs, src/tests/testHarness/repoRoot.ts) give the same answers, on
 * today's layout and on the `packages/competition-factory` layout the package is moving to.
 */
const sandbox = mkdtempSync(join(tmpdir(), 'factory-repo-root-'));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function layout(name: string, packagePath: string) {
  const repo = join(sandbox, name);
  const pkg = join(repo, packagePath);
  const deep = join(pkg, 'src', 'tests', 'testHarness');
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(repo, '.release-please-manifest.json'), JSON.stringify({ [packagePath]: '1.0.0' }));
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'tods-competition-factory' }));
  return { repo, pkg, deep };
}

describe('repository and package roots', () => {
  it('both helpers agree on this checkout, and the package sits inside the repository', () => {
    expect(roots.REPO_ROOT).toEqual(scriptRoots.REPO_ROOT);
    expect(roots.PACKAGE_ROOT).toEqual(scriptRoots.PACKAGE_ROOT);
    expect(roots.PACKAGE_PATH).toEqual(scriptRoots.PACKAGE_PATH);
    expect(roots.PACKAGE_ROOT.startsWith(roots.REPO_ROOT)).toBe(true);
    expect(scriptRoots.repoPath('package.json')).toEqual(
      roots.PACKAGE_PATH === '.' ? 'package.json' : `${roots.PACKAGE_PATH}/package.json`,
    );
  });

  it('finds the package at the repository root (the layout before the move)', () => {
    const { repo, deep } = layout('flat', '.');
    for (const find of [roots.findRoots, scriptRoots.findRoots]) {
      expect(find(deep)).toEqual({ REPO_ROOT: repo, PACKAGE_ROOT: repo, PACKAGE_PATH: '.' });
    }
  });

  it('finds the package under packages/competition-factory (the layout after the move)', () => {
    const { repo, pkg, deep } = layout('workspace', 'packages/competition-factory');
    // a private workspace root manifest must not be mistaken for the package
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'competition-factory-workspace', private: true }));
    for (const find of [roots.findRoots, scriptRoots.findRoots]) {
      expect(find(deep)).toEqual({ REPO_ROOT: repo, PACKAGE_ROOT: pkg, PACKAGE_PATH: 'packages/competition-factory' });
    }
  });

  it('throws rather than guessing when a root is missing', () => {
    const orphan = join(sandbox, 'orphan', 'src');
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(sandbox, 'orphan', 'package.json'), JSON.stringify({ name: 'tods-competition-factory' }));
    for (const find of [roots.findRoots, scriptRoots.findRoots]) {
      expect(() => find(orphan)).toThrow(/release-please-manifest/);
      expect(() => find(sandbox)).toThrow(/tods-competition-factory/);
    }
  });
});

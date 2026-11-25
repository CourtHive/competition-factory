// Both diagnostic loaders use the same source edits and canonical module IDs. Apply the patch to four private
// temporary copies. A stale hunk fails the build before any worker starts. The ordinary build never loads this file.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const patch = readFileSync(new URL('wiring.patch', import.meta.url), 'utf8');
const files = [...patch.matchAll(/^\+\+\+ b\/(src\/[^\n]+\.ts)$/gm)].map((match) => match[1]);

export function patchedSources() {
  const directory = mkdtempSync(join(tmpdir(), 'factory-notice-diagnostics-'));
  try {
    for (const file of files) {
      const copy = join(directory, file);
      mkdirSync(dirname(copy), { recursive: true });
      copyFileSync(join(packageRoot, file), copy);
    }
    execFileSync('git', ['apply', '--no-index', '--whitespace=nowarn', '-'], { cwd: directory, input: patch });
    return new Map(files.map((file) => [resolve(packageRoot, file), readFileSync(join(directory, file), 'utf8')]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** @returns {import('vite').Plugin} */
export function noticeDiagnosticPlugin() {
  const sources = patchedSources();
  return {
    name: 'factory-notice-diagnostics',
    enforce: 'pre',
    load(id) {
      return sources.get(id);
    },
  };
}

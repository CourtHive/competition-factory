// The built package loads under both module systems, holds every entry, and imports nothing.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const fail = (message) => {
  console.error(`[catalogue:verify-dist] ${message}`);
  process.exit(1);
};

const esm = await import('../dist/index.mjs');
const cjs = createRequire(import.meta.url)('../dist/index.cjs');

for (const [label, mod] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  const { catalogueEntries, entryVersions, resolveTieFormat, tieFormats } = mod;
  if (!Array.isArray(catalogueEntries) || catalogueEntries.length !== 50) {
    fail(`${label}: expected 50 entries, found ${catalogueEntries?.length}`);
  }
  for (const entry of catalogueEntries) {
    if (!entry.definition || entryVersions[entry.name] !== entry.version) fail(`${label}: ${entry.name} is incomplete`);
  }
  for (const name of Object.keys(tieFormats)) {
    const tieFormat = resolveTieFormat(name);
    if (!tieFormat?.collectionDefinitions?.length)
      fail(`${label}: resolveTieFormat('${name}') returned no collections`);
  }
}

for (const file of ['dist/index.mjs', 'dist/index.cjs']) {
  const code = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  if (/\brequire\(|^\s*import\s/m.test(code)) fail(`${file} imports a module`);
}
for (const file of ['dist/index.d.mts', 'dist/index.d.cts']) {
  const declarations = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  if (/from\s+['"]/.test(declarations)) fail(`${file} imports a module`);
}

console.log('[catalogue:verify-dist] OK: 50 entries under ESM and CJS; no imports');

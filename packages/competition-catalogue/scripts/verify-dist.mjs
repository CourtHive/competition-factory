// The built package loads under both module systems, holds every entry with its provenance, names no export as an
// engine default, and imports nothing.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const fail = (message) => {
  console.error(`[catalogue:verify-dist] ${message}`);
  process.exit(1);
};

const ENTRIES = 57;

const esm = await import('../dist/index.mjs');
const cjs = createRequire(import.meta.url)('../dist/index.cjs');

for (const [label, mod] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  const { catalogueEntries, entryVersions, policies, provenance, resolveTieFormat, tieFormats } = mod;
  if (!Array.isArray(catalogueEntries) || catalogueEntries.length !== ENTRIES) {
    fail(`${label}: expected ${ENTRIES} entries, found ${catalogueEntries?.length}`);
  }
  for (const entry of catalogueEntries) {
    if (!entry.definition || entryVersions[entry.name] !== entry.version) fail(`${label}: ${entry.name} is incomplete`);
    const p = entry.provenance;
    const stated =
      p?.status === 'template' &&
      typeof p.modelledOn === 'string' &&
      p.modelledOn.length > 0 &&
      p.maintainer === 'CourtHive' &&
      p.maintained === false &&
      p.endorsed === false;
    if (!stated) fail(`${label}: ${entry.name} has no template provenance`);
    if (provenance[entry.name] !== p) fail(`${label}: ${entry.name}'s provenance is not the exported one`);
  }
  if (Object.keys(provenance).length !== ENTRIES) fail(`${label}: provenance names an entry the catalogue lacks`);

  // POLICY_ names the factory's own engine defaults; a catalogue policy is a TEMPLATE_
  const policyDefault = Object.keys(mod).filter((name) => name.startsWith('POLICY_'));
  if (policyDefault.length) fail(`${label}: exports named like engine defaults: ${policyDefault.join(', ')}`);
  for (const name of Object.keys(policies)) {
    if (!name.startsWith('TEMPLATE_') || mod[name] !== policies[name])
      fail(`${label}: policy ${name} is not a TEMPLATE_ export`);
  }
  for (const name of Object.keys(mod.ratingsPresets)) {
    if (!name.startsWith('TEMPLATE_')) fail(`${label}: ratings preset ${name} is not a TEMPLATE_ name`);
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

console.log(
  `[catalogue:verify-dist] OK: ${ENTRIES} entries with template provenance under ESM and CJS; no POLICY_ export; no imports`,
);

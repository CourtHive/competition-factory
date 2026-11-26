#!/usr/bin/env node
/**
 * Codegen: `defaultsHash` and `defaultsHashes`, the content hashes of the policies the engine falls back to
 * (`src/fixtures/policies/engineDefaultPolicies.ts`), written as constants into `src/fixtures/policies/defaultsHash.ts`.
 *
 * Computed here, at build time, so the engine never hashes anything at runtime: a new tournament and `attachPolicies`
 * copy two constants onto the record.
 *
 * Each policy type's hash is the first 16 hex digits of the SHA-256 of the RFC 8785 canonical JSON
 * (`tools.canonicalJson`) of its definition (`engineDefaultHashInput`). `defaultsHash` is the same over the
 * canonical JSON of `defaultsHashes`, so it changes exactly when one of the defaults does.
 *
 * Regenerate via `pnpm gen:defaults-hash` (prebuild runs it). `pnpm check:defaults-hash`, part of `verify:generated`,
 * re-runs it with --check and fails when a default changed and the constants were not regenerated.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src/fixtures/policies/defaultsHash.ts');
const check = process.argv.includes('--check');

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

async function loadDefaults() {
  const tmp = mkdtempSync(join(tmpdir(), 'factory-defaults-'));
  try {
    const entry = join(tmp, 'entry.ts');
    writeFileSync(
      entry,
      [
        `export { ENGINE_DEFAULT_POLICIES, engineDefaultHashInput } from ${JSON.stringify(join(ROOT, 'src/fixtures/policies/engineDefaultPolicies.ts'))};`,
        `export { canonicalJson } from ${JSON.stringify(join(ROOT, 'src/tools/canonicalJson.ts'))};`,
      ].join('\n'),
    );
    const outfile = join(tmp, 'defaults.mjs');
    await esbuild.build({
      entryPoints: [entry],
      tsconfig: join(ROOT, 'tsconfig.json'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile,
      logLevel: 'silent',
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const { ENGINE_DEFAULT_POLICIES, engineDefaultHashInput, canonicalJson } = await loadDefaults();
const policyTypes = Object.keys(ENGINE_DEFAULT_POLICIES).sort();
const defaultsHashes = Object.fromEntries(
  policyTypes.map((policyType) => {
    const input = engineDefaultHashInput(policyType);
    if (input === undefined) throw new Error(`no default definition for policy type ${policyType}`);
    return [policyType, hash(canonicalJson(input))];
  }),
);
const defaultsHash = hash(canonicalJson(defaultsHashes));

const body = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: src/fixtures/policies/engineDefaultPolicies.ts
 * Regenerate: pnpm gen:defaults-hash
 * Drift guard: pnpm check:defaults-hash
 */

/**
 * The content hash of the policies the engine falls back to when a record pins none. It changes only when one of
 * those defaults changes, never with the factory version. New tournaments and \`attachPolicies\` record it, and
 * \`getDefaultsDrift\` compares a record's stamp with it.
 */
export const defaultsHash = '${defaultsHash}';

/** The same hash for each policy type the engine has a default for: which defaults a change touched. */
export const defaultsHashes: { readonly [policyType: string]: string } = Object.freeze({
${policyTypes.map((policyType) => `  ${policyType}: '${defaultsHashes[policyType]}',`).join('\n')}
});
`;

let current = '';
try {
  current = readFileSync(OUT, 'utf8');
} catch {
  current = '';
}

if (check) {
  if (current !== body) {
    console.error('[check:defaults-hash] src/fixtures/policies/defaultsHash.ts is stale: run `pnpm gen:defaults-hash`');
    process.exit(1);
  }
  console.log(`[check:defaults-hash] current (${defaultsHash})`);
} else if (current !== body) {
  writeFileSync(OUT, body);
  console.log(`[gen:defaults-hash] wrote ${defaultsHash}`);
}

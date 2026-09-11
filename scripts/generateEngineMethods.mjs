#!/usr/bin/env node
/**
 * Codegen: emit src/types/factoryEngineMethods.ts containing a string-literal
 * union of every function-typed property on the singleton `tournamentEngine`.
 *
 * Runs the real engine assembly through esbuild (bundled in-memory to
 * introspect the runtime surface) and introspects `Object.keys(engine)`
 * filtered to `typeof === 'function'`. This is the source of truth — what
 * `importMethods(governors, true, 1)` actually exposes at runtime.
 *
 * Regenerate via `pnpm gen:engine-methods`. CI runs `pnpm check:engine-methods`
 * which re-runs this and fails on any diff.
 */

import * as esbuild from 'esbuild';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src/types/factoryEngineMethods.ts');

async function bundleEngine() {
  const tmp = mkdtempSync(join(tmpdir(), 'factory-engine-'));
  const outfile = join(tmp, 'engine.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/tests/engines/syncEngine/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  });
  return outfile;
}

async function collectMethodNames() {
  const outfile = await bundleEngine();
  const mod = await import(pathToFileURL(outfile).href);
  const engine = mod.tournamentEngine ?? mod.default;
  if (!engine || typeof engine !== 'object') {
    throw new Error('Bundled engine did not export tournamentEngine');
  }
  const names = Object.keys(engine).filter((k) => typeof engine[k] === 'function');
  return names.sort((a, b) => a.localeCompare(b));
}

function renderUnionFile(names) {
  const banner = [
    '/**',
    ' * AUTO-GENERATED — do not edit by hand.',
    ' * Source: src/tests/engines/syncEngine + src/assemblies/governors',
    ' * Regenerate: pnpm gen:engine-methods',
    ' * Drift guard:  pnpm check:engine-methods',
    ' */',
    '',
  ].join('\n');
  const union = names.map((n) => `  | '${n}'`).join('\n');
  return `${banner}export type FactoryEngineMethod =\n${union};\n\nexport const FACTORY_ENGINE_METHODS: readonly FactoryEngineMethod[] = [\n${names
    .map((n) => `  '${n}',`)
    .join('\n')}\n] as const;\n`;
}

const args = new Set(process.argv.slice(2));
const check = args.has('--check');

const names = await collectMethodNames();
const next = renderUnionFile(names);

if (check) {
  if (!existsSync(OUT)) {
    console.error(`[engine-methods] ${OUT} does not exist; run \`pnpm gen:engine-methods\`.`);
    process.exit(1);
  }
  const current = readFileSync(OUT, 'utf8');
  if (current !== next) {
    console.error('[engine-methods] generated file is stale; run `pnpm gen:engine-methods`.');
    process.exit(1);
  }
  console.log(`[engine-methods] OK (${names.length} methods)`);
  process.exit(0);
}

writeFileSync(OUT, next);
console.log(`[engine-methods] wrote ${OUT} (${names.length} methods)`);

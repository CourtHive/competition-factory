#!/usr/bin/env node
/**
 * Codegen: emit `src/types/methodSignatures.ts` from governor barrels +
 * engineStart's lambda wrappers.
 *
 * Reads `src/types/factoryEngineMethods.ts` for the canonical list of names
 * on the live tournamentEngine. For each name, locates the source function
 * by walking governor `export { ... } from '@<Alias>/...'` barrels (and
 * engineStart's `engine.X = (...) => Y(...)` mount block). Emits a
 * `MethodSignatures` interface whose entries are `typeof <sourceName>`,
 * grouped + deduplicated by source path so imports stay clean.
 *
 * Methods that don't resolve to a source export (some facades, some
 * dynamically registered methods) silently fall through to the
 * `Record<Exclude<FactoryEngineMethod, ...>, (...args: any[]) => any>`
 * fallback in `factoryTypes.ts`. A coverage report lands on stdout.
 *
 * Regenerate via `pnpm gen:method-signatures`. CI runs
 * `pnpm check:method-signatures` which re-runs this and fails on any diff.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENGINE_METHODS = join(ROOT, 'src/types/factoryEngineMethods.ts');
const GOVERNORS_DIR = join(ROOT, 'src/assemblies/governors');
const ENGINE_START = join(ROOT, 'src/assemblies/engines/parts/engineStart.ts');
const OUT = join(ROOT, 'src/types/methodSignatures.ts');

// Method names that are NOT signature-able through this pipeline. Facades
// (handled by inline declarations on FactoryEngineTyped) + engine internals
// (executionQueue/execute/importMethods — varargs shapes that hand-curation
// would model better than typeof).
const SKIP = new Set([
  'q',
  'on',
  'once',
  'off',
  'waitFor',
  'inspect',
  'build',
  'executionQueue',
  'execute',
  'importMethods',
]);

/** Walk a directory recursively, return all .ts paths. */
function walkTs(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walkTs(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

/** Read the FactoryEngineMethod union (string literal entries). */
function readEngineMethodNames() {
  const src = readFileSync(ENGINE_METHODS, 'utf8');
  // pull the type-union body
  const m = src.match(/export type FactoryEngineMethod =([\s\S]+?);/);
  if (!m) throw new Error('could not locate FactoryEngineMethod union');
  const body = m[1];
  return Array.from(body.matchAll(/'([^']+)'/g))
    .map((mm) => mm[1])
    .filter((n) => !SKIP.has(n));
}

/**
 * Resolve a governor's `from '...'` import path so methodSignatures.ts (which
 * lives in a different directory) can use it. `@Alias/...` paths stay as-is
 * (the alias resolves anywhere in src/). Relative paths get rewritten to be
 * relative to methodSignatures.ts's location.
 */
function resolveImportPath(importPath, governorFile) {
  if (!importPath.startsWith('.')) return importPath; // alias — passes through
  const absolute = resolve(dirname(governorFile), importPath);
  let rel = relative(dirname(OUT), absolute);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

/**
 * Parse a governor file for `export { name1, name2 as publicName, ... } from '@X/...'`
 * Returns array of { publicName, sourceName, sourcePath }.
 */
function parseGovernor(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const out = [];
  const reExportRe = /export\s+(?:type\s+)?\{\s*([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = reExportRe.exec(src))) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const sourcePath = resolveImportPath(m[2], filePath);
    for (const n of names) {
      // skip type-only imports
      if (n.startsWith('type ')) continue;
      const asMatch = n.match(/^(\S+)\s+as\s+(\S+)$/);
      const sourceName = asMatch ? asMatch[1] : n;
      const publicName = asMatch ? asMatch[2] : n;
      out.push({ publicName, sourceName, sourcePath });
    }
  }
  return out;
}

/**
 * Parse engineStart.ts. Looks for `engine.X = ... Y(...)` patterns where Y
 * is one of the imported functions at the top of the file. The lambda wraps
 * Y, so `typeof Y` is more precise than the wrapper's `(params?) => ...`.
 *
 * Returns array of { publicName, sourceName, sourcePath }.
 */
function parseEngineStart() {
  const src = readFileSync(ENGINE_START, 'utf8');
  const out = [];

  // Collect imports: name → path
  const imports = new Map();
  const importRe = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let im;
  while ((im = importRe.exec(src))) {
    const path = im[2];
    for (const n of im[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      // strip `type ` and aliases
      const clean = n
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      imports.set(clean, path);
    }
  }

  // Collect simple-wrapper mounts ONLY: `engine.publicName = (...) => sourceCall(...)`.
  // We require the source call to be the immediate next expression after `=>`
  // (no opening brace, no other statements). Complex multi-line wrappers
  // (engine.reset, engine.setState, engine.newTournamentRecord, etc.) where
  // the public signature differs from any single inner call get skipped and
  // fall through to the `(...args: any[]) => any` fallback. A naive heuristic
  // that grabbed the first inner call would mis-type these (e.g. mapping
  // engine.reset to setTournamentRecords because that's the first body call).
  const mountRe = /engine\.(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*(\w+)\(/g;
  let mm;
  while ((mm = mountRe.exec(src))) {
    const publicName = mm[1];
    const sourceName = mm[3];
    if (publicName === sourceName || !imports.has(sourceName)) continue;
    const sourcePath = imports.get(sourceName);
    // Skip forge-facade mounts (handled inline on FactoryEngineTyped).
    if (['buildQueryFacade', 'buildFacade', 'createEventBus', 'inspect'].includes(sourceName)) continue;
    out.push({ publicName, sourceName, sourcePath });
  }
  return out;
}

// --- build resolver map ---
const resolver = new Map(); // publicName → { sourceName, sourcePath, origin }

for (const file of walkTs(GOVERNORS_DIR)) {
  for (const entry of parseGovernor(file)) {
    if (!resolver.has(entry.publicName)) resolver.set(entry.publicName, { ...entry, origin: file });
  }
}

for (const entry of parseEngineStart()) {
  if (!resolver.has(entry.publicName)) resolver.set(entry.publicName, { ...entry, origin: ENGINE_START });
}

// --- intersect with FactoryEngineMethod ---
const engineMethods = readEngineMethodNames();
const resolved = engineMethods.filter((n) => resolver.has(n)).map((n) => ({ publicName: n, ...resolver.get(n) }));
const unresolved = engineMethods.filter((n) => !resolver.has(n));

// --- group by source path so the import list stays clean ---
const byPath = new Map();
for (const r of resolved) {
  if (!byPath.has(r.sourcePath)) byPath.set(r.sourcePath, []);
  byPath.get(r.sourcePath).push(r);
}

// Sort import paths longest-first (CourtHive convention).
const sortedPaths = Array.from(byPath.keys()).sort((a, b) => b.length - a.length);

// --- emit ---
const lines = [];
lines.push('/**');
lines.push(' * MethodSignatures — per-method typed params + returns for the engine surface.');
lines.push(' *');
lines.push(' * AUTO-GENERATED by `pnpm gen:method-signatures`. CI runs');
lines.push(' * `pnpm check:method-signatures` and fails on drift. Do not hand-edit.');
lines.push(' *');
lines.push(' * Sources: governor barrels under `src/assemblies/governors/` and the');
lines.push(" * engine assembly's lambda mounts (`engineStart.ts`). Each entry wraps");
lines.push(' * `typeof <sourceFn>` with `EngineMethod` so the source signature is');
lines.push(' * transformed into the engine-call shape — auto-resolved keys (event,');
lines.push(' * drawDefinition, tournamentRecord, etc.) become optional, hint keys');
lines.push(' * (drawId, eventId, ...) are admitted, and 0-arg calls are allowed on');
lines.push(' * methods that need nothing beyond engine state. See `EngineMethod`');
lines.push(' * doc in `factoryTypes.ts` for the rationale.');
lines.push(' *');
lines.push(' * Methods not in this map fall through to the `(...args: any[]) => any`');
lines.push(' * fallback on `FactoryEngineTyped`; that set shrinks as the parser');
lines.push(' * resolves more of the public surface over time.');
lines.push(' */');
lines.push('');
lines.push("import type { EngineMethod } from './factoryTypes';");
lines.push('');

for (const path of sortedPaths) {
  const entries = byPath
    .get(path)
    .slice()
    .sort((a, b) => a.sourceName.localeCompare(b.sourceName));
  // dedupe sourceName per path
  const uniq = Array.from(new Map(entries.map((e) => [e.sourceName, e])).values());
  if (uniq.length === 1) {
    lines.push(`import type { ${uniq[0].sourceName} } from '${path}';`);
  } else {
    // Mirror Prettier's collapse behavior (printWidth 120 in .prettierrc.json)
    // so prebuild output stays clean without a follow-up `prettier --write`.
    const single = `import type { ${uniq.map((e) => e.sourceName).join(', ')} } from '${path}';`;
    if (single.length <= 120) {
      lines.push(single);
    } else {
      lines.push(`import type {`);
      for (const e of uniq) lines.push(`  ${e.sourceName},`);
      lines.push(`} from '${path}';`);
    }
  }
}

lines.push('');
lines.push('export interface MethodSignatures {');
const byPublic = resolved.slice().sort((a, b) => a.publicName.localeCompare(b.publicName));
for (const e of byPublic) {
  lines.push(`  ${e.publicName}: EngineMethod<typeof ${e.sourceName}>;`);
}
lines.push('}');
lines.push('');

const content = lines.join('\n');

// --- write or check ---
const checkMode = process.argv.includes('--check');
const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';

if (checkMode) {
  if (existing.trim() !== content.trim()) {
    process.stderr.write('[gen:method-signatures] drift detected. Run `pnpm gen:method-signatures`.\n');
    process.exit(1);
  }
  process.stdout.write(`[gen:method-signatures] up to date (${resolved.length}/${engineMethods.length})\n`);
} else {
  writeFileSync(OUT, content);
  const total = engineMethods.length;
  const covered = resolved.length;
  const pct = ((covered / total) * 100).toFixed(1);
  process.stdout.write(`[gen:method-signatures] wrote ${relative(ROOT, OUT)}\n`);
  process.stdout.write(`  ${covered}/${total} (${pct}%) typed; ${unresolved.length} fall through to Record fallback\n`);
  if (process.env.GEN_VERBOSE && unresolved.length) {
    process.stdout.write(`  unresolved (first 30): ${unresolved.slice(0, 30).join(', ')}\n`);
  }
}

#!/usr/bin/env node
/**
 * Generate `src/types/enumExports.ts` — the runtime (value) re-export of every enum
 * declared under `src/types/`.
 *
 * WHY THIS EXISTS
 * `src/index.ts` does `export type * from './types'`, which strips the runtime value of
 * every enum. A compensating block of explicit value exports used to be maintained BY
 * HAND, and it drifted: 16 enums across officiatingTypes.ts and sanctioningTypes.ts were
 * present in the emitted `.d.ts` as values but `undefined` at runtime, so consumer code
 * compiled clean and then threw `TypeError: Cannot read properties of undefined`. That is
 * the worst failure shape a published package can have, and a hand-maintained list will
 * always eventually produce it.
 *
 * Two declaration styles count as an enum here:
 *   - `export enum Name {}`            — definitive, any name
 *   - `export const NameEnum = {}`     — the const-object style (DrawTypeEnum et al)
 *
 * Regenerate:  pnpm gen:enum-exports
 * Drift guard: pnpm check:enum-exports   (runs in prebuild + verify:generated)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TYPES_DIR = join(ROOT, 'src/types');
const OUT = join(TYPES_DIR, 'enumExports.ts');
const OUT_BASENAME = 'enumExports.ts';

const args = new Set(process.argv.slice(2));
const check = args.has('--check');

/** Enum-shaped exports per source file, in declaration order. */
function collect() {
  const byFile = [];
  for (const file of readdirSync(TYPES_DIR).sort()) {
    if (!file.endsWith('.ts') || file === OUT_BASENAME) continue;
    const src = readFileSync(join(TYPES_DIR, file), 'utf8');
    const names = [
      ...[...src.matchAll(/^export enum (\w+)/gm)].map((m) => m[1]),
      ...[...src.matchAll(/^export const (\w+Enum) = \{/gm)].map((m) => m[1]),
    ].sort();
    if (names.length) byFile.push({ module: `./${file.replace(/\.ts$/, '')}`, names });
  }
  return byFile;
}

function render(byFile) {
  const total = byFile.reduce((n, f) => n + f.names.length, 0);
  const lines = [
    '/**',
    ' * AUTO-GENERATED — do not edit by hand.',
    ' *',
    ' * Runtime (value) re-export of every enum under src/types/. `src/index.ts` does',
    " * `export type * from './types'`, which strips runtime values; this module puts them",
    ' * back. Generated rather than hand-maintained because the hand-maintained version',
    ' * drifted and shipped 16 enums that compiled clean and were `undefined` at runtime.',
    ' *',
    ' * Regenerate:   pnpm gen:enum-exports',
    ' * Drift guard:  pnpm check:enum-exports',
    ` * Covers ${total} enums across ${byFile.length} modules.`,
    ' */',
    '',
  ];
  // One export per line, deliberately. The pre-commit hook runs prettier over
  // generated files too, and a single long `export { … }` gets re-wrapped — after
  // which the generator and the formatter can never agree and the drift guard
  // fails forever. Short lines are stable under any print width, which is why the
  // other generated modules in this repo emit one declaration per line.
  for (const { module, names } of byFile) {
    for (const name of names) lines.push(`export { ${name} } from '${module}';`);
  }
  return lines.join('\n') + '\n';
}

const byFile = collect();
const next = render(byFile);
const total = byFile.reduce((n, f) => n + f.names.length, 0);

if (check) {
  if (!existsSync(OUT)) {
    console.error(`[enum-exports] ${OUT_BASENAME} does not exist; run \`pnpm gen:enum-exports\`.`);
    process.exit(1);
  }
  if (readFileSync(OUT, 'utf8') !== next) {
    console.error(`[enum-exports] ${OUT_BASENAME} is stale; run \`pnpm gen:enum-exports\`.`);
    process.exit(1);
  }
  console.log(`[enum-exports] OK (${total} enums, ${byFile.length} modules)`);
  process.exit(0);
}

writeFileSync(OUT, next);
console.log(`[enum-exports] wrote ${OUT_BASENAME} (${total} enums, ${byFile.length} modules)`);

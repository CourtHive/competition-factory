#!/usr/bin/env node
/**
 * verify:shakeable — assert the published ESM build is actually tree-shakeable.
 *
 * Replaces the old `agadoo` check, which (a) was pointed at the CJS min bundle
 * (never shakeable) and (b) crashed on modern syntax with its pinned acorn, so
 * it silently verified nothing. This instead bundles a real consumer that
 * imports a single tiny leaf export from the published ESM entry and asserts
 * the result stays under a hard byte budget. If the ESM build regresses to a
 * flattened single bundle (or a leaf import starts dragging the engine), one
 * import balloons toward the full ~1.5 MB library and this fails.
 *
 *   --update  print the measured size without failing (for tuning the budget)
 */
import { build } from 'esbuild';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');
const ESM_ENTRY = join(FACTORY_ROOT, 'dist/esm/index.mjs');

// A tiny, dependency-free leaf export. Importing only this must shake away the
// entire engine. Keep the budget well below any engine-pulling result (a
// non-shakeable build yields >1 MB here) but with headroom over the true cost.
const LEAF_EXPORT = 'unwrapOr';
const BUDGET_BYTES = 50 * 1024; // 50 KB

function log(msg) {
  process.stdout.write(`[verify:shakeable] ${msg}\n`);
}

if (!existsSync(ESM_ENTRY)) {
  process.stderr.write(`[verify:shakeable] FAIL: ${ESM_ENTRY} not present — run \`pnpm build\` first\n`);
  process.exit(1);
}

const workdir = mkdtempSync(join(tmpdir(), 'factory-shake-'));
try {
  const entry = join(workdir, 'consumer.mjs');
  // `console.log(typeof …)` keeps the import live so it cannot itself be shaken away.
  writeFileSync(
    entry,
    `import { ${LEAF_EXPORT} } from ${JSON.stringify(ESM_ENTRY)};\nconsole.log(typeof ${LEAF_EXPORT});\n`,
  );

  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    minify: true,
    treeShaking: true,
    write: false,
    logLevel: 'silent',
  });

  const bytes = result.outputFiles[0].contents.length;
  const kb = (bytes / 1024).toFixed(1);

  if (process.argv.includes('--update')) {
    log(`import { ${LEAF_EXPORT} } bundles to ${kb} KB (budget ${(BUDGET_BYTES / 1024).toFixed(0)} KB)`);
    process.exit(0);
  }

  if (bytes > BUDGET_BYTES) {
    process.stderr.write(
      `[verify:shakeable] FAIL: import { ${LEAF_EXPORT} } bundles to ${kb} KB, over the ${(BUDGET_BYTES / 1024).toFixed(0)} KB budget.\n` +
        `The ESM build is not tree-shaking — a single leaf import is dragging in unrelated modules.\n`,
    );
    process.exit(1);
  }

  log(
    `OK — import { ${LEAF_EXPORT} } shakes to ${kb} KB (budget ${(BUDGET_BYTES / 1024).toFixed(0)} KB); ESM build is tree-shakeable`,
  );
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

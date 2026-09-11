#!/usr/bin/env node
/**
 * postbuild — emit per-format type declarations so package.json `exports`
 * can map conditional `types` cleanly (ESM consumers get .d.mts, CJS consumers
 * get .d.cts). publint --strict requires this; without the split, the same
 * .d.ts is interpreted as CJS when resolving via the "import" condition, which
 * causes ambiguous interop typing.
 *
 * (The tree-shakeable ESM build itself is produced by rollup — see
 * rollup.config.mjs `esmExport`. This step only handles the .d.ts variants.)
 */
import fs from 'fs';

const dtsSource = './dist/tods-competition-factory.d.ts';
if (fs.existsSync(dtsSource)) {
  fs.copyFileSync(dtsSource, './dist/tods-competition-factory.d.mts');
  fs.copyFileSync(dtsSource, './dist/tods-competition-factory.d.cts');
}

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

// The CODES JSON Schema is published at the subpath
// `tods-competition-factory/schema/tournament.schema.json` so consumers that validate records
// (CFS's save path first) read the same declaration the factory's own tests enforce, rather than a
// copy that drifts. `package.json` `files` is `dist` only, so it has to be copied in here.
const schemaSource = './src/global/schema/tournament.schema.json';
if (fs.existsSync(schemaSource)) {
  fs.mkdirSync('./dist/schema', { recursive: true });
  fs.copyFileSync(schemaSource, './dist/schema/tournament.schema.json');
}

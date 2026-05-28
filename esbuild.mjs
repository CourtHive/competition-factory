#!/usr/bin/env node
import * as esbuild from 'esbuild';
import * as fsx from 'fs-extra';
import fs from 'fs';

const result = await esbuild.build({
  entryPoints: ['./src/index.ts'],
  outfile: './dist/index.mjs',
  platform: 'node',
  metafile: true,
  format: 'esm',
  minify: true,
  bundle: true,
});

fsx.ensureDirSync('./build');
fs.writeFileSync('./build/esbuild-meta.json', JSON.stringify(result.metafile));

// Emit per-format type declarations so package.json `exports` can map
// conditional `types` cleanly (ESM consumers get .d.mts, CJS consumers get
// .d.cts). publint --strict requires this; without the split, the same .d.ts
// is interpreted as CJS when resolving via the "import" condition, which
// causes ambiguous interop typing.
const dtsSource = './dist/tods-competition-factory.d.ts';
if (fs.existsSync(dtsSource)) {
  fs.copyFileSync(dtsSource, './dist/tods-competition-factory.d.mts');
  fs.copyFileSync(dtsSource, './dist/tods-competition-factory.d.cts');
}

// NOTE: load meta file here => https://esbuild.github.io/analyze/

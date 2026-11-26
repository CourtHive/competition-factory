// Builds dist/: one ESM and one CJS bundle of src/index.ts, and one declaration bundle, written under both the
// `import` and the `require` names. The declarations inline the factory types the entries are checked against, so
// the published package depends on nothing.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { rollup } from 'rollup';
import dts from 'rollup-plugin-dts';

const entry = 'src/index.ts';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

for (const [format, outfile] of [
  ['esm', 'dist/index.mjs'],
  ['cjs', 'dist/index.cjs'],
]) {
  await build({
    entryPoints: [entry],
    tsconfig: 'tsconfig.json',
    platform: 'neutral',
    target: 'es2021',
    bundle: true,
    outfile,
    format,
  });
}

const types = await rollup({ input: entry, plugins: [dts({ tsconfig: 'tsconfig.json' })] });
await types.write({ file: 'dist/index.d.mts', format: 'es' });
await types.close();
copyFileSync('dist/index.d.mts', 'dist/index.d.cts');

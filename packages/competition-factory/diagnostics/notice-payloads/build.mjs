import { build } from 'esbuild';
import { join } from 'node:path';
import { packageRoot, patchedSources } from './overlay.mjs';

const sources = patchedSources();
const plugin = {
  name: 'factory-notice-diagnostics',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, ({ path }) => {
      const contents = sources.get(path);
      if (contents !== undefined) return { contents, loader: 'ts' };
    });
  },
};
for (const [format, extension] of [
  ['esm', 'mjs'],
  ['cjs', 'cjs'],
]) {
  await build({
    absWorkingDir: packageRoot,
    entryPoints: ['src/index.ts'],
    outfile: join(packageRoot, '.diagnostics/notice-payloads/index.' + extension),
    bundle: true,
    platform: 'node',
    target: 'node24',
    tsconfig: 'tsconfig.json',
    format,
    plugins: [plugin],
  });
}

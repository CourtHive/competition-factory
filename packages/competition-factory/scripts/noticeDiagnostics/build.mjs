// `pnpm build:notice-diagnostics`: a standalone engine with the read-only notice payload detector compiled in (CA
// ruling 27), for auditing a custom state provider or subscriber. It is the ordinary source with
// `__NOTICE_PAYLOAD_DIAGNOSTICS__` defined true (src/global/state/compileTimeConstants.d.ts); the published build
// defines it false. Not published: it writes .diagnostics/notice-payloads/index.{mjs,cjs}.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
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
    define: { __NOTICE_PAYLOAD_DIAGNOSTICS__: 'true' },
    logLevel: 'warning',
    format,
  });
}

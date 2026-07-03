/**
 * NATIVE writeMode test run.
 *
 * Reuses the base config (aliases, environment) but pins the NATIVE writeMode and runs only
 * `*.native.test.*` specs — the explicit first-class-storage siblings of the LEGACY-shape specs.
 * Behavioral multi-mode coverage lives in ordinary specs via `writeModeMatrix` and runs under the
 * default `pnpm test`. See planning/NATIVE_WRITEMODE_COVERAGE.md.
 *
 *   pnpm test:native
 */
import { configDefaults, defineConfig } from 'vitest/config';

import base from './vitest.config.mts';

export default defineConfig({
  ...base,
  test: {
    ...(base as any).test,
    setupFiles: ['./src/tests/testHarness/setSchemaWriteModeNative.ts'],
    include: ['src/**/*.native.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [...configDefaults.exclude, '**/scratch/**'],
    // Coverage thresholds are enforced by the default run; this targeted run just executes specs.
    coverage: { enabled: false },
  },
});

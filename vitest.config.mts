/**
 * NOTE: Vite natively resolves tsconfig paths via resolve.tsconfigPaths.
 * Aliases are still needed for test files.
 *
 * This is the main suite. The `src/server` Nest specs are a separate project —
 * see vitest.server.config.mts.
 */

import { configDefaults, defineConfig } from 'vitest/config';

import { testFileAliases } from './vitest.aliases.mjs';

export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds for slow tests
    onConsoleLog: () => {},
    environment: 'node',
    include: ['src/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Untracked scratch tests are excluded from coverage but were still running
    // and exercising production code — inflating local % above CI's. Excluding
    // them from the runner makes local match CI.
    exclude: [...configDefaults.exclude, '**/scratch/**'],
    // Default pinned to NATIVE (production parity) as of the 2026-07-03 writeMode flip. The whole
    // suite passes under NATIVE; the former `*.native.test.*` first-class-storage siblings are now
    // ordinary specs that run under this default. Legacy-shape storage specs opt back into LEGACY via
    // the `legacyMode()` helper; behavioral specs cover all modes via `writeModeMatrix`.
    // setSchemaWriteModeLegacy.ts is retained for the legacyMode() helper.
    setupFiles: ['./src/tests/testHarness/setSchemaWriteModeNative.ts'],
    coverage: {
      reporter: ['html', 'json-summary'],
      include: ['src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      exclude: [
        ...configDefaults.exclude,
        'src/**/*.config.{js,ts,jsx,tsx}',
        'src/**/*.test.{js,ts,jsx,tsx}',
        '**/conversion/**',
        'src/**/index.ts',
        '**/examples/**',
        '**/scratch/**',
        '**/server/**',
        // src/forge is no longer "incubation" — it hosts production-accessible
        // engine surface (engine.q, engine.inspect, engine.on, engine.build).
        // Subject to the 95/95/85/95 thresholds like everything else.
        '**/types/**',
        '**/*.json',
        // deprecated code and data - excluded from coverage
        'src/mutate/score/staticScoreChange/**',
        'src/mutate/matchUps/score/history/**',
        'src/tests/testHarness/**',
        // notice-conformance harness is test infrastructure (like testHarness/**),
        // exercised incrementally as the D-scenarios sweep grows — not product code.
        'src/tests/mutations/notifications/noticeConformance/harness.ts',
        'src/assemblies/governors/**',
        'src/assemblies/tools/**',
        'src/fixtures/data/**',
      ],
      provider: 'v8',
      // Two-tier coverage gates:
      //
      // 1. GLOBAL AGGREGATE — applied across the whole report. Current state
      //    after the 2026-05-30 coverage push is 95.15 / 86.76 / 97.9 / 97.55
      //    (stmts / branches / funcs / lines). These thresholds lock in the
      //    progress without leaving more headroom than the observed ~0.03%
      //    v8 drift on Node 24.
      //
      // 2. PER-FILE FLOOR — every individual src file must clear these.
      //    Catches egregious individual-file regressions (a brand-new
      //    untested file would fail at 0%, no matter how high the aggregate
      //    is). The long-term per-file target is 70% branches / 90% statements;
      //    several files in the legacy coverage backlog still sit between the
      //    50% floor and the 70% target. Lifting them is incremental work —
      //    see scripts/verify/ if you want to gate a tighter floor for new
      //    files only.
      thresholds: {
        statements: 95,
        functions: 95,
        branches: 85,
        lines: 95,
        'src/**/*.{ts,mts,cts,js,mjs,cjs}': {
          perFile: true,
          statements: 50,
          functions: 50,
          branches: 50,
          lines: 50,
        },
      },
    },
  },
  resolve: {
    tsconfigPaths: true, // native Vite tsconfig paths resolution for source files
    // necessary for vitest to resolve tsconfig paths in test.ts files
    alias: testFileAliases,
  },
});

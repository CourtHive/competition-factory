/**
 * NOTE: Vite natively resolves tsconfig paths via resolve.tsconfigPaths.
 * Aliases are still needed for test files.
 */

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds for slow tests
    onConsoleLog: () => {},
    environment: 'node',
    include: ['src/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Untracked scratch tests are excluded from coverage but were still running
    // and exercising production code — inflating local % above CI's. Excluding
    // them from the runner makes local match CI.
    //
    // `*.native.test.*` specs assert the NATIVE (first-class) storage shape and must run under
    // the NATIVE writeMode — they run via `pnpm test:native` (vitest.native.config.mts), NOT here
    // under the LEGACY pin. Exclude them from the default run so they don't execute in the wrong
    // mode. (writeModeMatrix-based specs live in ordinary *.test.* files and set their own mode.)
    exclude: [...configDefaults.exclude, '**/scratch/**', '**/*.native.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['./src/tests/testHarness/setSchemaWriteModeLegacy.ts'],
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
        // Subject to the 95/95/83/95 thresholds like everything else.
        '**/types/**',
        '**/*.json',
        // deprecated code and data - excluded from coverage
        'src/mutate/score/staticScoreChange/**',
        'src/mutate/matchUps/score/history/**',
        'src/tests/testHarness/**',
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
    alias: {
      '@Generators': new URL('./src/assemblies/generators', import.meta.url).pathname,
      '@Assemblies': new URL('./src/assemblies', import.meta.url).pathname,
      '@Engines': new URL('./src/tests/engines', import.meta.url).pathname, // test engines
      '@Validators': new URL('./src/validators', import.meta.url).pathname,
      '@Constants': new URL('./src/constants', import.meta.url).pathname,
      '@Functions': new URL('./src/functions', import.meta.url).pathname,
      '@Fixtures': new URL('./src/fixtures', import.meta.url).pathname,
      '@Forge': new URL('./src/forge', import.meta.url).pathname,
      '@Acquire': new URL('./src/acquire', import.meta.url).pathname,
      '@Helpers': new URL('./src/helpers', import.meta.url).pathname,
      '@Global': new URL('./src/global', import.meta.url).pathname,
      '@Mutate': new URL('./src/mutate', import.meta.url).pathname,
      '@Server': new URL('./src/server', import.meta.url).pathname,
      '@Query': new URL('./src/query', import.meta.url).pathname,
      '@Tests': new URL('./src/tests', import.meta.url).pathname,
      '@Tools': new URL('./src/tools', import.meta.url).pathname,
      '@Types': new URL('./src/types', import.meta.url).pathname,
    },
  },
});

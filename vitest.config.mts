/**
 * NOTE: Vite natively resolves tsconfig paths via resolve.tsconfigPaths.
 * Aliases are still needed for test files.
 *
 * This is the main suite. The `src/server` Nest specs are a separate project —
 * see vitest.server.config.mts.
 */

import { configDefaults, defineConfig } from 'vitest/config';

import { testFileAliases } from './vitest.aliases.mjs';

// A `--shard=i/n` run holds a fraction of the suite, so its coverage is a fraction too: every file another
// shard covers reads as untested, and the thresholds below would fail it. CI shards coverage 4 ways and runs
// `vitest run --merge-reports --coverage` over the shards' blob reports; THAT run carries no `--shard`, so
// the thresholds apply to the merged result, exactly as they did to one whole-suite run (verify.yml).
const isShard = process.argv.some((arg) => arg.startsWith('--shard'));

export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds for slow tests
    environment: 'node',
    // Persist transformed modules under node_modules/.vitest-cache so a rerun skips
    // the transform pass. Transform was ~30% of tracked time on a cold local run.
    // The cache lives inside node_modules, so a reinstall invalidates it.
    fsModuleCache: true,
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
    setupFiles: [
      './src/tests/testHarness/setSchemaWriteModeNative.ts',
      './src/tests/testHarness/seedMathRandom.ts',
      './src/tests/testHarness/corpusRecord.ts',
      './src/tests/testHarness/setOutcomePipeline.ts',
      './src/tests/testHarness/differentialTally.ts',
      './src/tests/testHarness/rethrowCaughtErrors.ts',
    ],
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
        // Subject to the 95/97/87/97.5 thresholds like everything else.
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
        // The v2 outcome pipeline runs only under OUTCOME_PIPELINE=differential (or v2). On the default
        // run it is barely executed, so counting it would make every v2 PR spend coverage margin it
        // cannot earn. CA, 2026-10-02: measure it where it runs, on the path to a release. `verify.yml`
        // sets the differential mode for PRs into master and pushes to master, which lifts this.
        ...(process.env.OUTCOME_PIPELINE === 'differential' ? [] : ['src/mutate/matchUps/outcome/**']),
      ],
      provider: 'v8',
      // Two-tier coverage gates:
      //
      // 1. GLOBAL AGGREGATE — applied across the whole report. Measured
      //    2026-10-10 on dev bdc5c4b258 (16,064 tests): 95.37 / 87.5 / 98.14 /
      //    97.94 (stmts / branches / funcs / lines); after the 2026-05-30 push it
      //    was 95.15 / 86.76 / 97.9 / 97.55. The floors below sit ~0.4–0.5 under
      //    the measure (branches, functions and lines raised for 7.9.0; statements
      //    kept at 95 with 0.37 to spare; functions at 97 keeps ~100 items above the
      //    CI `--min=50` headroom gate), which is more than the observed ~0.03%
      //    v8 drift on Node 24 and less than a real regression.
      //
      // 2. PER-FILE FLOOR — every individual src file must clear these.
      //    Catches egregious individual-file regressions (a brand-new
      //    untested file would fail at 0%, no matter how high the aggregate
      //    is). The long-term per-file target is 70% branches / 90% statements;
      //    several files in the legacy coverage backlog still sit between the
      //    50% floor and the 70% target. Lifting them is incremental work —
      //    see scripts/verify/ if you want to gate a tighter floor for new
      //    files only.
      //
      //    The floor was expressed as a `'src/**/*.{...}'` glob group carrying
      //    `perFile: true` until the 2026-09-06 vitest 5 upgrade. It never ran:
      //    vitest 4 read `perFile` only off the TOP-LEVEL thresholds object
      //    (`this.options.thresholds?.perFile`), so a `perFile` nested inside a
      //    glob group was ignored and the group was scored as an aggregate —
      //    which the 95% global already passed. Vitest 5 resolves `perFile` per
      //    group and supports the object form below, which states the two tiers
      //    without a glob and cannot be silently downgraded to an aggregate.
      thresholds: {
        statements: 95,
        functions: 97,
        branches: 87,
        lines: 97.5,
        perFile: {
          statements: 50,
          functions: 50,
          branches: 50,
          lines: 50,
        },
      },
      // A shard drops them (see `isShard`). An override AFTER the literal, not a conditional around it:
      // scripts/verify/coverage-headroom.mjs reads the global floors out of the `thresholds: {` text.
      ...(isShard && { thresholds: undefined }),
    },
  },
  resolve: {
    tsconfigPaths: true, // native Vite tsconfig paths resolution for source files
    // necessary for vitest to resolve tsconfig paths in test.ts files
    alias: testFileAliases,
  },
});

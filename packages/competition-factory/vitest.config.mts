/**
 * NOTE: Vite natively resolves tsconfig paths via resolve.tsconfigPaths.
 * Aliases are still needed for test files.
 *
 * This is the main suite. The `src/server` Nest specs are a separate project —
 * see vitest.server.config.mts.
 */

import { configDefaults, defineConfig } from 'vitest/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { noticeDiagnosticPlugin } from './diagnostics/notice-payloads/overlay.mjs';
import DurationSequencer from './vitest.sequencer.mjs';
import { testFileAliases } from './vitest.aliases.mjs';

// A `--shard=i/n` run holds a fraction of the suite, so its coverage is a fraction too: every file another
// shard covers reads as untested, and the thresholds below would fail it. CI shards coverage 4 ways and runs
// `vitest run --merge-reports --coverage` over the shards' blob reports; THAT run carries no `--shard`, so
// the thresholds apply to the merged result, exactly as they did to one whole-suite run (verify.yml).
const isShard = process.argv.some((arg) => arg.startsWith('--shard'));

// Run against a second implementation (FACTORY_BACKEND, documentation/docs/testing/second-backend.md), every routed
// scoring write is followed by a comparison of all five views over the whole history, so a long match costs time that
// grows with the square of its points: a volleyball deciding set took 34.5 s, and its file 115-297 s, under load. Those
// runs get 180 s per test, over five times the slowest test measured, and still finite so a hang fails; the default
// suite keeps 30 s.
//
// OUTCOME_PIPELINE=differential (every PR into master, and the differential arm on dev) runs every outcome through v1
// AND the v2 pipeline and compares them, so the 30 s set for one pipeline no longer fits: on the 7.40.0 checkpoint
// (#6405) one test on the default took 40 s and another 34 s, about twenty more used over half of it, and the same
// shard ran 1.5x slower on its second run. A test fixed one at a time leaves the next one to fail a checkpoint, so
// the differential gets the second implementation's 180 s: over five times the slowest test measured (34 s).
const slowSuite = process.env.FACTORY_BACKEND || process.env.OUTCOME_PIPELINE === 'differential';
const testTimeout = slowSuite ? 180_000 : 30_000;

// TEST ISOLATION (CA, 2026-11-05). By default vitest gives every test file a fresh module graph, so each of ~2,100 files
// re-imports and re-instruments the engine: import was a third of a CI coverage shard. On PRs into dev
// (FACTORY_MATRIX_TIER=pr) the `shared` project lets a worker keep its modules across files, which halved the suite.
// Files share module state then, so resetGlobalState.ts restores the engine's global state before every file, and a
// file that cannot share runs in the `isolated` project:
// - a file that mocks a module (vi.mock and kin): a module already loaded by an earlier file is not replaced, so the
//   mock would silently not apply. Found by reading the source, so a new mocking file is isolated without a list;
// - ISOLATED_FILES: a file that needs state no public setter can clear, with the reason.
// Checkpoints, master pushes and local runs keep every file isolated, so nothing that passes only by sharing can land.
const MOCKS_A_MODULE = /\bvi\.(mock|doMock|unmock|doUnmock)\(/;
const ISOLATED_FILES = [
  // asserts a bare syncEngine reports METHOD_NOT_FOUND; the test harness's tournamentEngine imports every governor's
  // methods into the shared sync provider, whose setMethods only merges
  'src/tests/engines/workshop/enginesWarmup.test.ts',
  // asserts the async provider's process-wide count of implicit-context warnings ("1 so far")
  'src/tests/engines/asyncGlobalStateIsolation.test.ts',
  // installs every GLOBAL notice subscription; those registrations survive the public per-file reset and
  // otherwise divert later scheduling audits from timeItems into notices in a shared worker
  'src/tests/global/noticeCoverageCollector.test.ts',
];
const TEST_FILE = /\.test\.(js|mjs|cjs|ts|mts|cts|jsx|tsx)$/;
const testFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'scratch' || entry.name === 'node_modules' ? [] : testFiles(path);
    return TEST_FILE.test(entry.name) ? [path] : [];
  });
const noticeDiagnosticFiles = [
  'src/tests/global/state/readonlyNoticePayloads.test.ts',
  'src/tests/global/state/noticePayloadPreview.test.ts',
  'src/tests/global/state/noticePayloadRecordedGroup.test.ts',
];
const auditNoticeWrites = process.env.NOTICE_PAYLOAD_WRITE_CHECK === '1';
const isolatedFiles = [
  ...testFiles('src').filter(
    (path) => !noticeDiagnosticFiles.includes(path) && MOCKS_A_MODULE.test(readFileSync(path, 'utf8')),
  ),
  ...ISOLATED_FILES,
];
const shareModules = process.env.FACTORY_MATRIX_TIER === 'pr';
const testExclude = [...configDefaults.exclude, '**/scratch/**'];

export default defineConfig({
  plugins: auditNoticeWrites ? [noticeDiagnosticPlugin()] : [],
  test: {
    testTimeout, // 30 seconds for slow tests; 180 under a second implementation or the differential (above)
    environment: 'node',
    // `--shard` splits by recorded duration, not file count (vitest.sequencer.mts); unsharded runs are unaffected
    sequence: { sequencer: DurationSequencer },
    // Persist transformed modules under node_modules/.vitest-cache so a rerun skips
    // the transform pass. Transform was ~30% of tracked time on a cold local run.
    // The cache lives inside node_modules, so a reinstall invalidates it.
    fsModuleCache: true,
    // Untracked scratch tests are excluded from coverage but were still running
    // and exercising production code — inflating local % above CI's. Excluding
    // them from the runner makes local match CI.
    exclude: testExclude,
    // see TEST ISOLATION above
    projects: [
      {
        extends: true,
        plugins: auditNoticeWrites ? [] : [noticeDiagnosticPlugin()],
        test: { name: 'notice-diagnostics', include: noticeDiagnosticFiles, isolate: true },
      },
      { extends: true, test: { name: 'isolated', include: isolatedFiles, isolate: true } },
      {
        extends: true,
        test: {
          name: 'shared',
          // `include` lives on the projects only: `extends: true` concatenates arrays, so a root include would put
          // every file in both projects
          include: ['src/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          exclude: [...testExclude, ...isolatedFiles, ...noticeDiagnosticFiles],
          isolate: !shareModules,
        },
      },
    ],
    // Default pinned to NATIVE (production parity) as of the 2026-07-03 writeMode flip. The whole
    // suite passes under NATIVE; the former `*.native.test.*` first-class-storage siblings are now
    // ordinary specs that run under this default. Legacy-shape storage specs opt back into LEGACY via
    // the `legacyMode()` helper; behavioral specs cover all modes via `writeModeMatrix`.
    // setSchemaWriteModeLegacy.ts is retained for the legacyMode() helper.
    setupFiles: [
      ...(auditNoticeWrites ? ['./diagnostics/notice-payloads/setup.ts'] : []),
      './src/tests/testHarness/resetGlobalState.ts',
      './src/tests/testHarness/setSchemaWriteModeNative.ts',
      './src/tests/testHarness/seedMathRandom.ts',
      './src/tests/testHarness/corpusRecord.ts',
      './src/tests/testHarness/noticeCoverage.ts',
      './src/tests/testHarness/setOutcomePipeline.ts',
      './src/tests/testHarness/setFactoryBackend.ts',
      './src/tests/testHarness/differentialTally.ts',
      './src/tests/testHarness/schedulingProperties.ts',
      './src/tests/testHarness/schedulingViewRoundTrip.ts',
      './src/tests/testHarness/rethrowCaughtErrors.ts',
      './src/tests/testHarness/queryPurity.ts',
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
        // the frozen v1 standings engine: an oracle for the differential fuzz, not product code
        'src/tests/standings/v1Reference/**',
        // notice-conformance harness is test infrastructure (like testHarness/**),
        // exercised incrementally as the D-scenarios sweep grows — not product code.
        'src/tests/mutations/notifications/noticeConformance/harness.ts',
        // typed async engine fixtures: checked by tsc and by a lint regression, never executed
        'src/tests/engines/typedAsyncEngine.contract.ts',
        'src/tests/engines/typedAsyncEngine.lint.fixture.ts',
        // compile-time type assertions: checked by tsc (and the hard-union ratchet), never executed
        'src/tests/typeAssertions/**',
        'src/assemblies/governors/**',
        'src/assemblies/tools/**',
        'src/fixtures/data/**',
        // The v2 outcome pipeline is measured wherever it runs (CA, 2026-10-02: measure it where it runs). Since
        // the flip (Path A step 3) it is the default, so an unset OUTCOME_PIPELINE, `v2` and `differential` all
        // measure it, and `verify.yml` runs coverage under v2 into dev and under the differential on the path to a
        // release. Only a run on the v1 fallback (OUTCOME_PIPELINE=v1) leaves it out, where it is barely executed.
        // v1's code stays in the measured set on every run: v2 hands every call it does not own to v1 whole, so
        // that code still executes under v2; nothing v1-only is excluded (a decision for CA, not this file).
        ...(process.env.OUTCOME_PIPELINE === 'v1' ? ['src/mutate/matchUps/outcome/**'] : []),
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

/**
 * NOTE: Vitest requires tsconfigPaths for source files and aliases for test files
 */

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000, // 30 seconds for slow tests
    onConsoleLog: (log) => {
      console.log(log);
    },
    environment: 'node',
    include: ['src/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reporter: ['html'],
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
        'src/forge/**',
        '**/types/**',
        '**/*.json',
        // deprecated code and data - excluded from coverage
        'src/helpers/scoreParser/**',
        'src/mutate/score/staticScoreChange/**',
        'src/mutate/matchUps/score/history/**',
        'src/tests/testHarness/**',
        'src/assemblies/governors/**',
        'src/assemblies/tools/**',
        'src/fixtures/data/**',
      ],
      provider: 'v8',
      // No thresholds for this config
    },
  },
  resolve: {
    tsconfigPaths: true,
    // necessary for vitest to resolve tsconfig paths in test.ts files
    alias: {
      '@Generators': new URL('../../src/assemblies/generators', import.meta.url).pathname,
      '@Assemblies': new URL('../../src/assemblies', import.meta.url).pathname,
      '@Engines': new URL('../../src/tests/engines', import.meta.url).pathname, // test engines
      '@Validators': new URL('../../src/validators', import.meta.url).pathname,
      '@Constants': new URL('../../src/constants', import.meta.url).pathname,
      '@Functions': new URL('../../src/functions', import.meta.url).pathname,
      '@Fixtures': new URL('../../src/fixtures', import.meta.url).pathname,
      '@Acquire': new URL('../../src/acquire', import.meta.url).pathname,
      '@Helpers': new URL('../../src/helpers', import.meta.url).pathname,
      '@Global': new URL('../../src/global', import.meta.url).pathname,
      '@Mutate': new URL('../../src/mutate', import.meta.url).pathname,
      '@Server': new URL('../../src/server', import.meta.url).pathname,
      '@Query': new URL('../../src/query', import.meta.url).pathname,
      '@Tests': new URL('../../src/tests', import.meta.url).pathname,
      '@Tools': new URL('../../src/tools', import.meta.url).pathname,
      '@Types': new URL('../../src/types', import.meta.url).pathname,
    },
  },
});

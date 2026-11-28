import { defineConfig } from 'vitest/config';

// The catalogue's own tests: each template loads and has its shape, and every policy module is executed. Coverage is
// over src/. A template that no test loads fails the policies threshold. Statements and branches sit just below 100
// only for the CTS table generator's guard for a row with no qualifying points, which the CTS table never has.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      thresholds: {
        'src/policies/**': { statements: 99, branches: 90, functions: 100, lines: 100 },
      },
    },
  },
});

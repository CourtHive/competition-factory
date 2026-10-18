/**
 * Diagnostic coverage run with no thresholds (`pnpm cov`): an HTML report of the default suite that never
 * fails on a floor. It is DERIVED from vitest.config.mts, so it runs the same files, setup hooks, aliases and
 * coverage exclusions as the gated run, and its numbers are comparable with it. A separately maintained copy
 * had drifted: it skipped all seven setup hooks (so it ran under a different write mode, without seeded
 * randomness or rethrown caught errors) and excluded src/forge, which the gate counts.
 */

import { defineConfig } from 'vitest/config';

import canonical from './vitest.config.mts';

const { coverage } = canonical.test ?? {};

export default defineConfig({
  ...canonical,
  test: {
    ...canonical.test,
    coverage: { ...coverage, reporter: ['html'], thresholds: undefined },
  },
});

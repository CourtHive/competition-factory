import base from '../../../vitest.config.mts';
export default {
  ...base,
  test: {
    ...base.test,
    projects: undefined,
    setupFiles: [],
    maxWorkers: 1,
    include: ['scripts/ext/f012/eventTimingCost.test.ts'],
  },
};

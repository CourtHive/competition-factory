import base from '../../../vitest.config.mts';

export default {
  ...base,
  test: { ...base.test, projects: undefined, include: ['ext-report/findings/F-013/refusal.test.ts'] },
};

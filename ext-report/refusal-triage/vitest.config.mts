import base from '../../vitest.config.mts';
export default {
  ...base,
  test: { ...base.test, projects: undefined, include: ['ext-report/refusal-triage/replay.test.ts'] },
};

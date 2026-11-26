export const SUCCESS = { success: true };
export const ERROR = 'error';
/** set beside `error` by a bulk mutation that committed some of its items (read by `isPartialCommit`) */
export const PARTIAL_COMMIT = 'committed';

export const resultConstants = {
  SUCCESS,
  ERROR,
} as const;

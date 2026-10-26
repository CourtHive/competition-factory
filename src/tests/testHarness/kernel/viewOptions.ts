/**
 * The options a scheduling call builds its view from (`kernel.scheduling.view@1`), and the type each must have; the
 * call's other parameters are the planner's. Kept apart from `kernel.ts`, which imports the pipeline, so the harvest's
 * setup file can read them without loading the pipeline before a test's `vi.mock`.
 */
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isTextList = (value: unknown) => Array.isArray(value) && value.every((item) => typeof item === 'string');

export const VIEW_OPTIONS: Record<string, (value: unknown) => boolean> = {
  scheduleDates: isTextList,
  periodLength: isCount,
  courtIds: isTextList,
};

/** of a scheduling call's parameters, those its view is built from */
export function viewOptionsOf(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(([key, value]) => key in VIEW_OPTIONS && value !== undefined),
  );
}

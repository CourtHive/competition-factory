/**
 * TEST-ONLY, until the suite's mode loops are collapsed (8.0.0 has one outcome pipeline). The names the suite used to
 * choose a pipeline by, kept so the loops still read: every mode list holds v2 alone, selecting a mode selects nothing,
 * and the mode read back is always v2. Engine and global-state selectors return METHOD_REMOVED in 8.0.0.
 */
export const OUTCOME_PIPELINE_V1 = 'v1';
export const OUTCOME_PIPELINE_V2 = 'v2';
export const OUTCOME_PIPELINE_DIFFERENTIAL = 'differential';
export const OUTCOME_PIPELINE_DEFAULT = OUTCOME_PIPELINE_V2;

export type OutcomePipelineMode =
  typeof OUTCOME_PIPELINE_V1 | typeof OUTCOME_PIPELINE_V2 | typeof OUTCOME_PIPELINE_DIFFERENTIAL;

export const outcomePipelineModes: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V2];

/** selects nothing: the one pipeline runs */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the old call shape, kept so the loops still read
export function setOutcomePipeline(_mode?: OutcomePipelineMode | string, _options?: unknown): { success: true } {
  return { success: true };
}

/** the one pipeline */
export function getOutcomePipeline(): OutcomePipelineMode {
  return OUTCOME_PIPELINE_V2;
}

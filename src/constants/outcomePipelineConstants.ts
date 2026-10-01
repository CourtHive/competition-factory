/**
 * Which implementation of the outcome pipeline (`setMatchUpStatus`) decides.
 *
 * `v1` is the pipeline as written across `setMatchUpState` and the matchUpGovernor routes. `v2` is
 * the clean-room re-implementation under `src/mutate/matchUps/outcome/`, written from the spec
 * (`documentation/docs/concepts/outcome-pipeline.md`) and the golden corpus. `differential` runs
 * both: v2 decides first, v1 runs, and a disagreement throws before anything is written.
 *
 * A global-state mode, not an environment read: the engine source reads no `process.env` outside
 * `src/server/`, and library consumers choose through `engine.outcomePipeline(mode)`.
 */
export const OUTCOME_PIPELINE_V1 = 'v1';
export const OUTCOME_PIPELINE_V2 = 'v2';
export const OUTCOME_PIPELINE_DIFFERENTIAL = 'differential';

export type OutcomePipelineMode =
  typeof OUTCOME_PIPELINE_V1 | typeof OUTCOME_PIPELINE_V2 | typeof OUTCOME_PIPELINE_DIFFERENTIAL;

export const outcomePipelineModes: OutcomePipelineMode[] = [
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  OUTCOME_PIPELINE_DIFFERENTIAL,
];

/**
 * Which implementation of the outcome pipeline (`setMatchUpStatus`) decides.
 *
 * `v1` is the pipeline as written across `setMatchUpState` and the matchUpGovernor routes. `v2` is
 * the clean-room re-implementation under `src/mutate/matchUps/outcome/`, written from the spec
 * (`documentation/docs/concepts/outcome-pipeline.md`) and the golden corpus. `differential` runs
 * both: v2 decides first, v1 runs, and a disagreement throws once what v1 wrote has been put back. v2 is the
 * default (OUTCOME_PIPELINE_DEFAULT); v1 and the differential remain selectable through 7.x.
 *
 * A global-state mode, not an environment read: the engine source reads no `process.env` outside
 * `src/server/`, and library consumers choose through `engine.outcomePipeline(mode)`.
 */
export const OUTCOME_PIPELINE_V1 = 'v1';
export const OUTCOME_PIPELINE_V2 = 'v2';
export const OUTCOME_PIPELINE_DIFFERENTIAL = 'differential';

// The pipeline that decides when no mode has been chosen: the engine's initial state, what
// `setOutcomePipeline()` with no argument restores, and what the suite runs when OUTCOME_PIPELINE is unset.
// v2 since the default moved from v1. `v1` stays selectable as a fallback through 7.x, and the
// selector itself (`engine.outcomePipeline`, `setOutcomePipeline`, the footprint's `outcomePipeline` option) is
// deprecated in 7.x and removed in 8.0.
export const OUTCOME_PIPELINE_DEFAULT = OUTCOME_PIPELINE_V2;

export type OutcomePipelineMode =
  typeof OUTCOME_PIPELINE_V1 | typeof OUTCOME_PIPELINE_V2 | typeof OUTCOME_PIPELINE_DIFFERENTIAL;

export const outcomePipelineModes: OutcomePipelineMode[] = [
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  OUTCOME_PIPELINE_DIFFERENTIAL,
];

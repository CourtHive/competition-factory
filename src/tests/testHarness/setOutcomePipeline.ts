import { setOutcomePipeline } from '@Global/state/globalState';
import { beforeEach } from 'vitest';

// constants
import {
  OUTCOME_PIPELINE_V1,
  outcomePipelineModes,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

/**
 * Vitest setupFiles hook: `OUTCOME_PIPELINE=v2 vitest run` runs the whole suite with the v2
 * pipeline deciding the refusals; `OUTCOME_PIPELINE=differential` runs both and throws on a
 * disagreement. Unset, the suite runs v1, as production does until S2 is done. Re-applied before
 * every test because a test may set the mode itself and the harness resets it after.
 */
const requested = process.env.OUTCOME_PIPELINE;
const mode: OutcomePipelineMode = outcomePipelineModes.includes(requested as OutcomePipelineMode)
  ? (requested as OutcomePipelineMode)
  : OUTCOME_PIPELINE_V1;
if (requested && mode !== requested)
  throw new Error(`OUTCOME_PIPELINE=${requested} is not one of ${outcomePipelineModes.join(', ')}`);

beforeEach(() => {
  setOutcomePipeline(mode);
});

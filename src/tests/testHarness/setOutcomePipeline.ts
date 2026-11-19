import { setOutcomePipeline } from '@Global/state/globalState';
import { beforeEach } from 'vitest';

// constants
import {
  OUTCOME_PIPELINE_DEFAULT,
  outcomePipelineModes,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

/**
 * Vitest setupFiles hook: `OUTCOME_PIPELINE=v2 vitest run` runs the whole suite with the v2
 * pipeline deciding the refusals; `OUTCOME_PIPELINE=differential` runs both and throws on a
 * disagreement. Unset, the suite runs OUTCOME_PIPELINE_DEFAULT, the pipeline production runs when
 * no mode is chosen. Re-applied before every test because a test may set the mode itself and the
 * harness resets it after.
 */
const requested = process.env.OUTCOME_PIPELINE;
const mode: OutcomePipelineMode = outcomePipelineModes.includes(requested as OutcomePipelineMode)
  ? (requested as OutcomePipelineMode)
  : OUTCOME_PIPELINE_DEFAULT;
if (requested && mode !== requested)
  throw new Error(`OUTCOME_PIPELINE=${requested} is not one of ${outcomePipelineModes.join(', ')}`);

beforeEach(() => {
  setOutcomePipeline(mode);
});

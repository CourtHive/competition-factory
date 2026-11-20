import { setOutcomePipeline } from '@Global/state/globalState';
import { beforeEach } from 'vitest';

// constants
import {
  OUTCOME_PIPELINE_DEFAULT,
  outcomePipelineModes,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

/**
 * Vitest setupFiles hook: `OUTCOME_PIPELINE=v1 vitest run` runs the whole suite on the v1 fallback;
 * `OUTCOME_PIPELINE=differential` runs both and throws on a disagreement. Unset, the suite runs
 * OUTCOME_PIPELINE_DEFAULT (v2 since the flip), the pipeline production runs when no mode is chosen.
 *
 * Applied once when the file loads, so module-level code and `beforeAll` fixtures run under the requested
 * mode rather than the engine's initial default (before the flip a v2 or differential run built them under
 * v1), and re-applied before every test because a test may set the mode itself and reset it after
 * (`setOutcomePipeline()` with no argument restores the default, not the requested mode).
 */
const requested = process.env.OUTCOME_PIPELINE;
const mode: OutcomePipelineMode = outcomePipelineModes.includes(requested as OutcomePipelineMode)
  ? (requested as OutcomePipelineMode)
  : OUTCOME_PIPELINE_DEFAULT;
if (requested && mode !== requested)
  throw new Error(`OUTCOME_PIPELINE=${requested} is not one of ${outcomePipelineModes.join(', ')}`);

setOutcomePipeline(mode);
beforeEach(() => {
  setOutcomePipeline(mode);
});

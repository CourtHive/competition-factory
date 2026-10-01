import { getOutcomePipeline } from '@Global/state/globalState';
import { compareDecisions, OutcomePipelineDivergence } from './differential';
import { buildOutcomeView } from './view';
import { refuseOutcome } from './refusals';

// constants and types
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import type { BuildViewArgs, Refusal } from './types';
import type { ResultType } from '@Types/factoryTypes';

/**
 * The routing point. Under `v1` nothing is built and nothing is decided. Under `v2` a refusal is
 * returned as the result the entry hands back, shaped as every other refusal is (`error`, `info`,
 * `context`). Under `differential` the refusal is kept, v1 runs, and `compare` throws
 * `OutcomePipelineDivergence` if the two answers differ on anything but an apply-stage code.
 */
export function decideOutcomeV2(args: BuildViewArgs): {
  refused?: ResultType;
  compare?: (v1Result: ResultType) => void;
} {
  const mode = getOutcomePipeline();
  if (mode === OUTCOME_PIPELINE_V1) return {};

  const view = buildOutcomeView(args);
  const refusal: Refusal | undefined = refuseOutcome(args.request, view);

  if (mode === OUTCOME_PIPELINE_V2 && refusal) return { refused: toResult(refusal) };
  if (mode !== OUTCOME_PIPELINE_DIFFERENTIAL) return {};

  return {
    compare: (v1Result) => {
      const comparison = compareDecisions(refusal, v1Result?.error?.code);
      if (!comparison.agree)
        throw new OutcomePipelineDivergence({
          matchUpId: args.request.matchUpId,
          v1: comparison.v1,
          v2: comparison.v2,
        });
    },
  };
}

function toResult(refusal: Refusal): ResultType {
  return {
    error: refusal.error,
    ...(refusal.info ? { info: refusal.info } : {}),
    ...(refusal.context ? { context: refusal.context } : {}),
  };
}

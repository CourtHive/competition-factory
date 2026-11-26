// types
import type { ResultType } from '@Types/factoryTypes';
import type { OutcomePlan } from './types';

/**
 * REFUSED ON THE COPY (step 4, CA 2026-11-26): a call the planners abstain from is recorded whole, v1 running on a copy
 * (`plan/recordedCall.ts`). Where v1 refused there, that refusal is the call's answer and v1 is not run on the stored
 * record. Asked only on the path a call v2 does not own already takes, so an owned call does no added work.
 */
export function refusedOnCopy(outcome: OutcomePlan): { refused?: ResultType } {
  return outcome.refusedOnCopy ? { refused: outcome.refusedOnCopy } : {};
}

/** under `differential`: compared as v1's answer (a disagreement is a divergence, as for v1's own run), then returned */
export function comparedRefusalOnCopy(refused: ResultType, compare: (v1Result: ResultType) => void) {
  compare(refused);
  return { refused };
}

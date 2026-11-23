import { definedAttributes } from '@Tools/definedAttributes';

// constants and types
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type DecorateResultArgs = {
  context?: { [key: string]: any };
  stack?: string | string[];
  error?: any;
  result: any;
  info?: any;
};

export function decorateResult({ context, result, stack, info }: DecorateResultArgs): ResultType {
  if (result && !Array.isArray(result?.stack)) result.stack = [];
  if (result && Array.isArray(result?.stack) && typeof stack === 'string') {
    result.stack.push(stack);
  }
  if (result && info) {
    result.info = info;
  }
  // A CONTEXT CARRIES REFERENCES, so it is never deep-copied: only its empty attributes are dropped. The exit-propagation
  // context hands the live `matchUpsMap` to the steps after the direction; copied, the settle step reconciled over the
  // draw as it stood at the direction and wrote to objects no longer in it, and the next call — a refusal, as often as
  // not — repaired what it left (census F2: 53 of 92 refusals after a write, 2026-10-11). Copying also made the outcome
  // depend on `setDeepCopy`, which governs what is RETURNED to a caller, not what a mutation reads.
  if (result && typeof context === 'object' && Object.keys(context).length) {
    result.context ??= {};
    Object.assign(result.context, definedAttributes(context, false, false, true));
  }

  if (result && !result?.error && !result?.success) {
    Object.assign(result, { ...SUCCESS });
  }

  return result ?? { success: true };
}

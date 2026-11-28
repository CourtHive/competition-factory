import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { INTERNAL_PARAMS } from '@Constants/internalParamsConstants';

// types
import type { ResultType } from '@Types/factoryTypes';

/**
 * The refusal of an engine call (direct, queued, `invoke`, `ask`, `dryRun`) naming one of a method's INTERNAL_PARAMS:
 * INVALID_VALUES, its context naming them, before anything is read or written. Undefined for any other call.
 */
export function internalParamsRefusal(methodName: string, params?: Record<string, unknown>): ResultType | undefined {
  const internal = Object.hasOwn(INTERNAL_PARAMS, methodName)
    ? INTERNAL_PARAMS[methodName].filter((key) => params?.[key] !== undefined)
    : [];
  return internal.length ? { error: INVALID_VALUES, context: { methodName, params: internal } } : undefined;
}

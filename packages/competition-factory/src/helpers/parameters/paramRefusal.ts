import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

/**
 * The refusal a tool returns for a required parameter it did not get (`MISSING_VALUE`) or got in the wrong shape
 * (`INVALID_VALUES`), decorated as `checkRequiredParameters` decorates its own: `{ error, info: { param }, stack }`.
 *
 * Built only on the refusal path. A tool on a hot path checks the shape itself (`Array.isArray`, `typeof`), which costs
 * nothing on a valid input, and calls this only when the check fails; `checkRequiredParameters` allocates on every call.
 */
export function paramRefusal(param: string, value: unknown, stack: string): ResultType {
  const error = value == null ? MISSING_VALUE : INVALID_VALUES;
  return decorateResult({ result: { error }, info: { param }, stack });
}

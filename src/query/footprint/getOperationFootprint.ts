import { getQueryMethodFootprint, queryFootprints } from './queryFootprints';
import { getMethodFootprint } from './mutationFootprints';

// types
import type { FootprintContext } from './mutationFootprints';

/** One engine guard for both declared query and mutation footprints; unknown operations still require everything. */
export function getOperationFootprint(
  method: string,
  params: Record<string, unknown> | undefined,
  context: FootprintContext,
) {
  return Object.hasOwn(queryFootprints, method)
    ? getQueryMethodFootprint(method, params, context)
    : getMethodFootprint(method, params, context);
}

import { checkRequiredParameters } from './checkRequiredParameters';

import { ResultType } from '@Types/factoryTypes';

/**
 * Shorthand for checkRequiredParameters when all params are simply required.
 * Builds the constraint array automatically from the param names.
 *
 * Usage:
 *   const check = requireParams(params, [DRAW_DEFINITION, STRUCTURE_ID, DRAW_POSITION]);
 *   if (check.error) return check;
 *
 * Equivalent to:
 *   checkRequiredParameters(params, [{ drawDefinition: true, structureId: true, drawPosition: true }])
 */
export function requireParams(
  params: { [key: string]: any } | undefined,
  paramNames: string[],
  stack?: string,
): ResultType & { valid?: boolean } {
  const constraint = paramNames.reduce(
    (acc, name) => {
      acc[name] = true;
      return acc;
    },
    {} as { [key: string]: boolean },
  );

  return checkRequiredParameters(params, [constraint], stack);
}

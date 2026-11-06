import { isObject, isString } from '@Tools/objects';
import { findMatchUp } from '@Acquire/findMatchUp';

// constants
import { ErrorType, INVALID_VALUES, NOT_FOUND } from '@Constants/errorConditionConstants';
import { MATCHUP, STRUCTURE } from '@Constants/attributeConstants';

type Params = { [key: string]: any };
type ParamsToResolve = {
  attr?: { [key: string]: any }; // passed into resolution function
  error?: ErrorType;
  validate?: any;
  param: string;
  type?: string;
}[];

export function resolveFromParameters(params: Params, paramsToResolve: ParamsToResolve) {
  if (!isObject(params)) return { error: INVALID_VALUES };
  if (!Array.isArray(paramsToResolve)) return { error: INVALID_VALUES };

  const resolutions: any = {};
  for (const { param, error, attr } of paramsToResolve) {
    const resolution = findResolution({ params, param, attr, error });
    if (resolution?.error) return resolution;
    resolutions[param] = resolution;
  }

  return resolutions;
}

function findResolution({ params, param, attr, error }) {
  if (param === STRUCTURE && isObject(params.drawDefinition) && isString(params.structureId)) {
    const result = (params.drawDefinition.structures ?? []).find(
      ({ structureId }) => structureId === params.structureId,
    );
    return !result.length && error ? { error } : { structure: result };
  }

  if (param === MATCHUP) {
    const result = findMatchUp({
      ...params,
      ...attr,
    });
    return result.error && error ? { ...result, error } : result;
  }

  return { error: NOT_FOUND, info: { param } };
}

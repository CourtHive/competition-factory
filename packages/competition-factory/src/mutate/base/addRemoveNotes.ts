import { isObject, isString } from '@Tools/objects';

// constants
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Adds notes directly to params.element; entity IDs are not resolved here.
 * Mutates the supplied object. Missing notes return MISSING_VALUE; invalid
 * elements or notes return INVALID_VALUES. The engine route is an 8.0.0
 * removal candidate; standalone export status is a separate decision.
 */
export function addNotes(params?) {
  if (!isObject(params) || !params.notes) return { error: MISSING_VALUE };
  if (!isObject(params.element)) return { error: INVALID_VALUES };
  if (!isString(params.notes) && !params.notes?.testing) return { error: INVALID_VALUES };
  Object.assign(params.element, { notes: params.notes });

  return { ...SUCCESS };
}

/**
 * Removes notes directly from params.element, mutating the supplied object.
 * Returns MISSING_VALUE without params and INVALID_VALUES without an element.
 * Governor-route removal does not imply removal of this implementation.
 */
export function removeNotes(params?) {
  if (!isObject(params)) return { error: MISSING_VALUE };
  if (!isObject(params.element)) return { error: INVALID_VALUES };
  if (params.element.notes) delete params.element.notes;

  return { ...SUCCESS };
}

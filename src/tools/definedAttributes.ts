import { deepCopyEnabled } from '@Global/state/globalState';

export function definedAttributes(obj: object, ignoreFalse?: boolean, ignoreEmptyArrays?: boolean, shallow?: boolean) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (!deepCopyEnabled()?.enabled) shallow = true;
  return defined(obj, ignoreFalse, ignoreEmptyArrays, shallow);
}

// The result is built in one object: a one-key object per attribute, merged by Object.assign, made this a large
// share of every getParticipants call. Nested values are filtered with the defaults, as they always were.
// The result is typed `any`, as the merged result always was: callers read attributes of their own input from it.
function defined(obj: object, ignoreFalse?: boolean, ignoreEmptyArrays?: boolean, shallow?: boolean): any {
  if (typeof obj !== 'object' || obj === null) return obj;

  const result = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === '' || value === undefined || value === null || (ignoreFalse && value === false)) continue;
    if (Array.isArray(value)) {
      if (ignoreEmptyArrays && !value.length) continue;
      result[key] = shallow ? value : value.map(definedElement); // doesn't filter out undefined array elements
    } else {
      result[key] = shallow ? value : defined(value);
    }
  }
  return result;
}

/**
 * AN ARRAY INSIDE AN ARRAY STAYS AN ARRAY.
 *
 * Elements used to go straight to `definedAttributes`, whose object path rebuilds an array as `{ '0': …, '1': … }`.
 * A rotating-partner round's `pairings` is an array of sides, each an array of individual ids, so `getEvent` returned
 * `pairings[0]` as `{"0":["a","d"],"1":["b","c"]}` while the stored record and `getTournament()` held
 * `[["a","d"],["b","c"]]` (found by the TMX settlement adapter, 2026-10-11). No stored record held a nested array
 * before rotating rounds: 0 of 49,929 production tournaments on 2026-10-11.
 */
function definedElement(element: unknown): unknown {
  return Array.isArray(element) ? element.map(definedElement) : defined(element as object);
}

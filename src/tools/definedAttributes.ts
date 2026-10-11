import { deepCopyEnabled } from '@Global/state/globalState';

function getDefinedKeys(obj, ignoreValues, ignoreEmptyArrays) {
  return Object.keys(obj).filter(
    (key) =>
      !ignoreValues.includes(obj[key]) && (!ignoreEmptyArrays || (Array.isArray(obj[key]) ? obj[key].length : true)),
  );
}

export function definedAttributes(obj: object, ignoreFalse?: boolean, ignoreEmptyArrays?: boolean, shallow?: boolean) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const deepCopy = deepCopyEnabled();
  if (!deepCopy?.enabled) shallow = true;

  const ignoreValues: any[] = ['', undefined, null];
  if (ignoreFalse) ignoreValues.push(false);

  const definedKeys = getDefinedKeys(obj, ignoreValues, ignoreEmptyArrays);

  return Object.assign(
    {},
    ...definedKeys.map((key) => {
      return Array.isArray(obj[key])
        ? {
            [key]: shallow ? obj[key] : obj[key].map(definedElement),
          } // doesn't filter out undefined array elements
        : { [key]: shallow ? obj[key] : definedAttributes(obj[key]) };
    }),
  );
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
  return Array.isArray(element) ? element.map(definedElement) : definedAttributes(element as object);
}

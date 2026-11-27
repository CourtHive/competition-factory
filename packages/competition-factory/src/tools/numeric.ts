import { isString } from './objects';

/**
 * Number predicates with no engine dependency.
 *
 * Their own module, and not only members of `math.ts` and `arrays.ts`, because both of those read the engine's random
 * source (`prng.ts` reads it from global engine state). A format parser or score view that needs only these would
 * otherwise reach global state; `tods-competition-factory/score-entry-state` holds that graph clean. `math.ts` and
 * `arrays.ts` re-export them, so every existing import is unchanged.
 */

// does accept e.e. '1.0'
export function isConvertableInteger(n: unknown): boolean {
  if (isString(n) && !n.trim().length) return false;
  return Number.isSafeInteger(typeof n === 'string' ? +n : n);
}

export function isNumeric(value: unknown): boolean {
  return !Number.isNaN(Number.parseFloat(value as string));
}

// return an object whose attributes are values and whose values are counts for values
// e.g. values=[1,2,2,3,4,4,5] produces { 1: 1, 2: 2, 3: 1, 4: 2, 5: 1}
export function instanceCount(values: unknown): { [key: number | string]: number };
// eslint-disable-next-line no-redeclare -- overload implementation
export function instanceCount(values): { [key: number | string]: number } {
  if (!Array.isArray(values)) return {};
  return values.reduce((a, c) => {
    if (!a[c]) a[c] = 0;
    a[c]++;
    return a;
  }, {});
}

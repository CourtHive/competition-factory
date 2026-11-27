import { isConvertableInteger, instanceCount } from './numeric';
import { randomSource } from '@Tools/prng';

/** `null` read as `undefined`, as `noNulls` maps it. */
type NullToUndefined<T> = T extends null ? undefined : T;
/** An element of a chunk: an element that is itself an array is spread into its chunk. */
type Spread<T> = T extends readonly unknown[] ? T[number] : T;
type Rng = () => number;
/** The array type parameter of the helpers below, so an element type is kept (and an `any` array stays `any`). */
type List = readonly unknown[];

// returns only unique values within an array
export function unique<A extends List>(arr?: A | null): A[number][];
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function unique(arr: unknown): unknown[];
// eslint-disable-next-line no-redeclare -- overload implementation
export function unique(arr) {
  if (!Array.isArray(arr)) return [];
  return arr?.filter((item, i, s) => s.lastIndexOf(item) === i);
}

export function noNulls<A extends List>(arr: A): NullToUndefined<A[number]>[];
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function noNulls<T>(arr: T): T;
// eslint-disable-next-line no-redeclare -- overload implementation
export function noNulls(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr?.map((item) => (item === null ? undefined : item));
}

export function shuffleArray<A extends List>(arr?: A | null, random?: Rng): A[number][];
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function shuffleArray(arr: unknown, random?: Rng): unknown[];
// eslint-disable-next-line no-redeclare -- overload implementation
export function shuffleArray(arr, random?: () => number) {
  if (!Array.isArray(arr)) return [];
  const rng = random ?? randomSource();
  return arr

    .map((a) => [rng(), a])
    .sort((a, b) => a[0] - b[0])
    .map((a) => a[1]);
}

/**
 * The first `count` items of `shuffleArray` over `length` items, the item at index i being `itemAt(i)`: the same random
 * draws in the same order, so the stream stands where a full shuffle leaves it and the items are the ones it would put
 * first. Only the items asked for are built and ordered (a stable sort orders equal keys by index, and so does this).
 */
export function shuffledPrefix<T>(
  length: number,
  count: number,
  itemAt: (index: number) => T,
  random?: () => number,
): T[] {
  const rng = random ?? randomSource();
  const keys = new Float64Array(length);
  for (let index = 0; index < length; index++) keys[index] = rng();
  const take = Math.min(count, length);
  if (take <= 0) return [];
  const threshold = Float64Array.from(keys).sort()[take - 1];
  const chosen: number[] = [];
  for (let index = 0; index < length; index++) if (keys[index] < threshold) chosen.push(index);
  for (let index = 0; index < length && chosen.length < take; index++)
    if (keys[index] === threshold) chosen.push(index);
  chosen.sort((a, b) => keys[a] - keys[b] || a - b);
  return chosen.map(itemAt);
}

export function numericSortValue(v) {
  return isConvertableInteger(v) ? v : Infinity;
}

export { instanceCount };

// return an object whose attributes are value counts and values are arrays of values for each count
// e.g. values=[1,2,2,3,4,4,5] produces { 1: ["1", "3", "5"], 2: ["2", "4"] }
export function countValues(values: unknown): { [key: number]: string[] } {
  return groupValues(instanceCount(values));
}

// group the values of an object by attributes(keys) which produce those values
// e.g. obj = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 1} produces { 1: ["1", "3", "5"], 2: ["2", "4"] }
export function groupValues(obj: { [key: string]: string | number }): { [key: string]: string[] };
// eslint-disable-next-line no-redeclare -- overload implementation
export function groupValues(obj) {
  return Object.keys(obj).reduce((p, c) => {
    const value = obj[c];
    if (p[value]) {
      p[value].push(c);
    } else {
      p[value] = [c];
    }
    return p;
  }, {});
}

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}
export function uniqueValues(arr) {
  return arr.filter(onlyUnique);
}
export function randomPop<A extends unknown[]>(array?: A | null, random?: Rng): A[number] | undefined;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function randomPop(array: unknown, random?: Rng): unknown;
// eslint-disable-next-line no-redeclare -- overload implementation
export function randomPop(array, random?: () => number) {
  return Array.isArray(array) && array.length
    ? array.splice(Math.floor((random ?? randomSource())() * array.length), 1)[0]
    : undefined;
}
export function randomMember<A extends List>(arr: A, random?: () => number): A[number] {
  const index = Math.floor((random ?? randomSource())() * arr.length);
  return arr[index];
}

/** The integers from `start` up to, not including, `end`; empty when either is not a number. */
export function generateRange(start?: number, end?: number): number[];
// eslint-disable-next-line no-redeclare -- overload implementation
export function generateRange(start, end) {
  return Array.from({ length: end - start }, (_, k) => k + start);
}
export function sizedRange(size, start) {
  return Array.from(Array(size).keys()).map((i) => i + start);
}

export function arrayIndices(val, arr) {
  return arr.reduce((a, e, i) => {
    if (e === val) a.push(i);
    return a;
  }, []);
}
export function intersection<A extends List>(a?: A | null, b?: unknown): A[number][];
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function intersection(a: unknown, b: unknown): unknown[];
// eslint-disable-next-line no-redeclare -- overload implementation
export function intersection(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  return a.filter((n) => b.indexOf(n) !== -1).filter((e, i, c) => c.indexOf(e) === i);
}
export function difference(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  return a.filter((x) => !b.includes(x));
}
export function symmetricDifference(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  return a.filter((x) => !b.includes(x)).concat(b.filter((x) => !a.includes(x)));
}
export function overlap(a: unknown, b: unknown): boolean;
// eslint-disable-next-line no-redeclare -- overload implementation
export function overlap(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.some((e) => b.includes(e));
}
export function occurrences(val: unknown, arr: unknown): number;
// eslint-disable-next-line no-redeclare -- overload implementation
export function occurrences(val, arr) {
  if (!Array.isArray(arr)) return 0;
  return (
    arr.reduce((r, val) => {
      r[val] = 1 + r[val] || 1;
      return r;
    }, {})[val] || 0
  );
}
export function subSort<A extends List>(
  arr: A | null | undefined,
  i: number,
  n: number,
  sortFx?: (a: A[number], b: A[number]) => number,
): A[number][];
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function subSort(arr: unknown, i: number, n: number, sortFx?: (a: never, b: never) => number): unknown[];
// eslint-disable-next-line no-redeclare -- overload implementation
export function subSort(arr, i, n, sortFx) {
  if (!Array.isArray(arr)) return [];
  return [].concat(...arr.slice(0, i), ...arr.slice(i, i + n).sort(sortFx), ...arr.slice(i + n, arr.length));
}
export function inPlaceSubSort(arr, i, n, sortFx) {
  const newarray = [].concat(...arr.slice(0, i), ...arr.slice(i, i + n).sort(sortFx), ...arr.slice(i + n, arr.length));
  arr.length = 0;
  arr.push(...newarray); // use spread operator instead?
  return arr;
}
export function chunkArray<A extends List>(arr: A | null | undefined, chunksize: number): Spread<A[number]>[][];
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function chunkArray(arr: unknown, chunksize: number): unknown[][];
// eslint-disable-next-line no-redeclare -- overload implementation
export function chunkArray(arr, chunksize) {
  if (!Array.isArray(arr)) return [];
  // appended in place: concatenating each element onto a copy of its chunk was quadratic in the chunk's length. An
  // element that is itself an array is spread into its chunk, as concat spreads it
  return arr.reduce((all, one, i) => {
    const ch = Math.floor(i / chunksize);
    all[ch] ??= [];
    if (Array.isArray(one)) all[ch].push(...one);
    else all[ch].push(one);
    return all;
  }, []);
}

// will break an array of items into chunks following pattern [size1, size2, ...]
export function chunkSizeProfile<A extends List>(arr: A, sizes: number[]): A[number][][];
// eslint-disable-next-line no-redeclare -- overload implementation
export function chunkSizeProfile(arr: List, [size, ...otherSizes]: number[]): unknown[][] {
  return arr.length ? [arr.slice(0, size), ...chunkSizeProfile(arr.slice(size), [...otherSizes, size])] : [];
}
export function groupConsecutiveNumbers(arr) {
  return arr.reduce((result, num) => {
    const finalGroup = result[result.length - 1];
    if (!finalGroup || finalGroup[finalGroup.length - 1] !== num - 1) {
      result.push([]);
    }
    result[result.length - 1].push(num);
    return result;
  }, []);
}

export function allNumeric(arr: unknown): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.reduce((numeric, item) => !isNaN(parseInt(item)) && numeric, true);
}
export function noNumeric(arr: unknown): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.reduce((numeric, item) => isNaN(parseInt(item)) && numeric, true);
}

/**
 * chunk an arbitrary array of elements by adding every Nth instance to chunksCount chunks
 *
 * e.g. given arr=[1,2,3,4,5,6,7,8,9,10,11,12]:
 *
 * chunkByNth(arr, 3)
 * [1, 4, 7, 10]
 * [2, 5, 8, 11]
 * [3, 6, 9, 12]
 * chunkByNth(arr, 4)
 * [1, 5, 9]
 * [2, 6, 10]
 * [3, 7, 11]
 * [4, 8, 12]
 *
 * When shuttle = true:
 * chunkByNth(arr, 3, true)
 * [1, 6, 7, 12]
 * [2, 5, 8, 11]
 * [3, 4, 9, 10]
 * chunkByNth(arr, 4, true)
 * [1, 8, 9]
 * [2, 7, 10]
 * [3, 6, 11]
 * [4, 5, 12]
 *
 * @param {any[]} arr - an array
 * @param {number} chunksCount - number of chunks to create
 * @param {boolean} shuttle - whether or not to "shuttle" as in the movment of a shuttle in a loom
 */
export function chunkByNth<A extends List>(arr: A, chunksCount: number, shuttle?: boolean): A[number][][];
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function chunkByNth(arr: unknown, chunksCount: number, shuttle?: boolean): unknown[][];
// eslint-disable-next-line no-redeclare -- overload implementation
export function chunkByNth(arr: unknown, chunksCount: number, shuttle?: boolean) {
  if (!Array.isArray(arr)) return [];
  return arr.reduce((chunks, entry, index) => {
    const reverseDirection = shuttle ? !!(Math.floor(index / chunksCount) % 2) : false;
    const chunkIndex = index % chunksCount;
    const directionIndex = reverseDirection ? chunksCount - 1 - chunkIndex : chunkIndex;
    if (!chunks[directionIndex]) chunks[directionIndex] = [];
    chunks[directionIndex].push(entry);
    return chunks;
  }, []);
}

// group numbers by contiguous ranges
export function getRanges(array) {
  return array
    .map((e) => parseInt(e))
    .filter((e) => !isNaN(e))
    .reduce((ranges, a) => {
      if (!ranges.some((range) => range.includes(a - 1) && range.push(a))) ranges.push([a]);
      return ranges;
    }, []);
}

export function getMissingSequenceNumbers(arr, start = 1) {
  if (!Array.isArray(arr) || !arr.every(isConvertableInteger)) return [];
  const min = Math.min(...arr, start);
  const max = Math.max(...arr);
  return generateRange(min, max + 1).filter((n) => !arr.includes(n));
}

export function lengthOrZero(value) {
  return (Array.isArray(value) && value.length) || 0;
}

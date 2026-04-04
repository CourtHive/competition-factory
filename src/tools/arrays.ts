import { isConvertableInteger } from './math';

// returns only unique values within an array
export function unique(arr) {
  if (!Array.isArray(arr)) return [];
  return arr?.filter((item, i, s) => s.lastIndexOf(item) === i);
}

export function noNulls(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr?.map((item) => (item === null ? undefined : item));
}

export function shuffleArray(arr, random?: () => number) {
  if (!Array.isArray(arr)) return [];
  const rng = random ?? Math.random;
  return (
    arr

      .map((a) => [rng(), a])
      .sort((a, b) => a[0] - b[0])
      .map((a) => a[1])
  );
}

export function numericSortValue(v) {
  return isConvertableInteger(v) ? v : Infinity;
}

// return an object whose attributes are values and whose values are counts for values
// e.g. values=[1,2,2,3,4,4,5] produces { 1: 1, 2: 2, 3: 1, 4: 2, 5: 1}
export function instanceCount(values): { [key: number | string]: number } {
  if (!Array.isArray(values)) return {};
  return values.reduce((a, c) => {
    if (!a[c]) a[c] = 0;
    a[c]++;
    return a;
  }, {});
}

// return an object whose attributes are value counts and values are arrays of values for each count
// e.g. values=[1,2,2,3,4,4,5] produces { 1: ["1", "3", "5"], 2: ["2", "4"] }
export function countValues(values): { [key: number]: string[] } {
  return groupValues(instanceCount(values));
}

// group the values of an object by attributes(keys) which produce those values
// e.g. obj = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 1} produces { 1: ["1", "3", "5"], 2: ["2", "4"] }
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
export function randomPop(array, random?: () => number) {
  return Array.isArray(array) && array.length
    ?
      array.splice(Math.floor((random ?? Math.random)() * array.length), 1)[0]
    : undefined;
}
export function randomMember(arr, random?: () => number) {

  const index = Math.floor((random ?? Math.random)() * arr.length);
  return arr[index];
}

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
export function intersection(a, b): any[] {
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
export function overlap(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.some((e) => b.includes(e));
}
export function occurrences(val, arr) {
  if (!Array.isArray(arr)) return 0;
  return (
    arr.reduce((r, val) => {
      r[val] = 1 + r[val] || 1;
      return r;
    }, {})[val] || 0
  );
}
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
export function chunkArray(arr, chunksize) {
  if (!Array.isArray(arr)) return [];
  return arr.reduce((all, one, i) => {
    const ch = Math.floor(i / chunksize);
    all[ch] = [].concat(all[ch] ?? [], one);
    return all;
  }, []);
}

// will break an array of items into chunks following pattern [size1, size2, ...]
export function chunkSizeProfile(arr: number[], [size, ...otherSizes]: number[]) {
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

export function allNumeric(arr) {
  if (!Array.isArray(arr)) return false;
  return arr.reduce((numeric, item) => !isNaN(parseInt(item)) && numeric, true);
}
export function noNumeric(arr) {
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
export function chunkByNth(arr: any[], chunksCount: number, shuttle?: boolean) {
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

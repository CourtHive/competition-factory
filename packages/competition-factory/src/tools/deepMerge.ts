import { unique } from './arrays';

// arrayMerge can be boolean or an array of target attributes which are arrays to merge
export function deepMerge(existing, incoming, arrayMerge?) {
  if (!existing && incoming) return incoming;
  if (existing && !incoming) return existing;
  if (typeof existing !== 'object' || typeof incoming !== 'object') return existing;

  const keys = unique(Object.keys(existing).concat(Object.keys(incoming)));

  return keys.reduce((merged, key) => {
    if (!incoming[key]) {
      merged[key] = existing[key];
    } else if (!existing[key]) {
      merged[key] = incoming[key];
    } else if (typeof existing[key] !== typeof incoming[key]) {
      merged[key] = incoming[key];
    } else if (Array.isArray(existing[key])) {
      if (arrayMerge === true || (Array.isArray(arrayMerge) && arrayMerge.includes(key))) {
        const mergedArrays = unique(
          existing[key].map((e) => JSON.stringify(e)).concat(incoming[key].map((i) => JSON.stringify(i))),
        ).map((u) => JSON.parse(u));
        merged[key] = mergedArrays;
      } else {
        // default is to overwrite existing array with incoming
        merged[key] = incoming[key];
      }
    } else if (typeof existing[key] === 'object') {
      merged[key] = deepMerge(existing[key], incoming[key], arrayMerge);
    } else {
      merged[key] = incoming[key];
    }
    return merged;
  }, {});
}

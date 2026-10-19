import { extensionsToAttributes, makeDeepCopy } from '@Tools/makeDeepCopy';
import { getProvider } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import { isDateObject } from '@Tools/dateTime';
import { isFunction } from '@Tools/objects';
import { expect, it, vi } from 'vitest';

// makeDeepCopy reads its settings once per copy rather than once per copied value. Every output must be
// unchanged, so each case below is copied by the current implementation and by the implementation it
// replaced (kept verbatim as referenceMakeDeepCopy), and the two copies are compared: values, undefined
// keys, and which nodes are shared with the source rather than copied.

let settings: any = { enabled: true };
vi.mock('@Global/state/globalState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@Global/state/globalState')>()),
  deepCopyEnabled: () => ({ ...settings }),
}));
const deepCopyEnabled = () => ({ ...settings });

function referenceMakeDeepCopy(
  // arbitrary JSON-like value. Functions are returned unchanged (not stripped); null attribute values become
  // undefined; Date objects become ISO strings; beyond `threshold` depth the original (aliased) references are returned.
  sourceObject,
  convertExtensions?, // optional - all extension objects converted to attributes ._key
  internalUse?, // disregard deepCopy being disabled within the engine - necessary for query results
  removeExtensions?, // optional - strip all extension attributes
  iteration = 0, // escape hatch - check against iteration threshold
) {
  if (getProvider().makeDeepCopy)
    return getProvider().makeDeepCopy(sourceObject, convertExtensions, internalUse, removeExtensions);

  const deepCopy = deepCopyEnabled();

  const { stringify, toJSON, ignore, modulate } = deepCopy ?? {};

  if (
    (!deepCopy?.enabled && !internalUse) ||
    typeof sourceObject !== 'object' ||
    isFunction(sourceObject) ||
    sourceObject === null ||
    (typeof deepCopy?.threshold === 'number' && iteration >= deepCopy.threshold)
  ) {
    return sourceObject;
  }

  const targetObject = Array.isArray(sourceObject) ? [] : {};

  const sourceObjectKeys = Object.keys(sourceObject).filter(
    (key) =>
      !internalUse ||
      !ignore ||
      (Array.isArray(ignore) && !ignore.includes(key)) ||
      (isFunction(ignore) && !ignore(key)),
  );

  const stringifyValue = (key, value) => {
    targetObject[key] = isFunction(value?.toString) ? value.toString() : JSON.stringify(value);
  };

  for (const key of sourceObjectKeys) {
    const value = sourceObject[key];
    const modulated = isFunction(modulate) ? modulate(value) : undefined;
    if (modulated !== undefined) {
      targetObject[key] = modulated;
    } else if (convertExtensions && key === 'extensions' && Array.isArray(value)) {
      const extensionConversions = extensionsToAttributes(value);
      Object.assign(targetObject, ...extensionConversions);
    } else if (removeExtensions && key === 'extensions') {
      targetObject[key] = [];
    } else if (Array.isArray(stringify) && stringify.includes(key)) {
      stringifyValue(key, value);
    } else if (Array.isArray(toJSON) && toJSON.includes(key) && isFunction(value?.toJSON)) {
      targetObject[key] = value.toJSON();
    } else if (value === null) {
      targetObject[key] = undefined;
    } else if (isDateObject(value)) {
      targetObject[key] = new Date(value).toISOString();
    } else {
      targetObject[key] = referenceMakeDeepCopy(value, convertExtensions, internalUse, removeExtensions, iteration + 1);
    }
  }

  return targetObject;
}

// the paths at which a copy holds the source's own object rather than a copy of it
function sharedPaths(copy, source, path = '', found: string[] = []) {
  if (typeof copy !== 'object' || copy === null) return found;
  if (copy === source) found.push(path || '<root>');
  else if (typeof source === 'object' && source !== null) {
    for (const key of Object.keys(copy)) sharedPaths(copy[key], source[key], `${path}.${key}`, found);
  }
  return found;
}

const tournamentRecord = mocksEngine.generateTournamentRecord({
  drawProfiles: [{ drawSize: 16 }, { drawSize: 8, drawType: 'ROUND_ROBIN' }],
  completeAllMatchUps: true,
}).tournamentRecord;

const crafted = {
  nothing: null,
  when: new Date('2026-10-17T12:00:00Z'),
  fn: () => 'kept',
  list: [1, null, [2, [3, [4, [5]]]], { deep: { deeper: { deepest: { bottom: true } } } }],
  extensions: [{ name: 'first', value: { a: 1 } }, { name: 'second', value: 'two' }, { name: 'empty' }],
  nested: { extensions: [{ name: 'inner', value: 3 }], keep: 'me', skip: 'me' },
  serial: { toJSON: () => 'serialized', toString: () => 'stringified', other: 1 },
  skip: 'top',
};

const sources = [tournamentRecord, crafted, [crafted, tournamentRecord.participants], 'text', 7, null, undefined];

const attributeCases: any[] = [
  {},
  { stringify: ['serial', 'when'] },
  { toJSON: ['serial', 'nothing'] },
  { ignore: ['skip', 'extensions'] },
  { ignore: (key) => key === 'skip' || key === 'drawPositions' },
  { ignore: 'truthy but neither a list nor a function' },
  { modulate: (value) => (typeof value === 'string' ? value.toUpperCase() : undefined) },
  { threshold: 2 },
  { threshold: 0 },
  { stringify: ['serial'], ignore: ['skip'], threshold: 3, modulate: (value) => (value === 1 ? 'one' : undefined) },
];

it('copies every case exactly as the implementation it replaced', () => {
  expect(getProvider().makeDeepCopy).toBeUndefined();
  let compared = 0;
  for (const enabled of [true, false]) {
    for (const attributes of attributeCases) {
      settings = { enabled, ...attributes };
      for (const source of sources) {
        for (const internalUse of [undefined, true]) {
          for (const convertExtensions of [undefined, true]) {
            for (const removeExtensions of [undefined, true]) {
              const args = [convertExtensions, internalUse, removeExtensions] as const;
              const copy = makeDeepCopy(source, ...args);
              const reference = referenceMakeDeepCopy(source, ...args);
              expect(copy).toStrictEqual(reference);
              expect(sharedPaths(copy, source)).toEqual(sharedPaths(reference, source));
              compared += 1;
            }
          }
        }
      }
    }
  }
  expect(compared).toEqual(2 * attributeCases.length * sources.length * 8);
});

it('honors a starting iteration against the threshold as before', () => {
  settings = { enabled: true, threshold: 4 };
  for (const iteration of [0, 2, 4, 6]) {
    const copy = makeDeepCopy(crafted, false, false, false, iteration);
    expect(copy).toStrictEqual(referenceMakeDeepCopy(crafted, false, false, false, iteration));
    expect(sharedPaths(copy, crafted)).toEqual(
      sharedPaths(referenceMakeDeepCopy(crafted, false, false, false, iteration), crafted),
    );
  }
});

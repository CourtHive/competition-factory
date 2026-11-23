import { deepCopyEnabled, getProvider } from '@Global/state/globalState';
import { isDateObject } from './dateTime';
import { isFunction } from './objects';

export function makeDeepCopy(
  // arbitrary JSON-like value. Functions are returned unchanged (not stripped); null attribute values become
  // undefined; Date objects become ISO strings; beyond `threshold` depth the original (aliased) references are returned.
  sourceObject,
  convertExtensions?, // optional - all extension objects converted to attributes ._key
  internalUse?, // disregard deepCopy being disabled within the engine - necessary for query results
  removeExtensions?, // optional - strip all extension attributes
  iteration = 0, // escape hatch - check against iteration threshold
) {
  const provider = getProvider();
  if (provider.makeDeepCopy)
    return provider.makeDeepCopy(sourceObject, convertExtensions, internalUse, removeExtensions);

  const deepCopy = deepCopyEnabled();
  if (!deepCopy?.enabled && !internalUse) return sourceObject;

  // the settings are read once per copy, not once per copied value: a large record has tens of thousands of values
  return copyValue(
    sourceObject,
    iteration,
    getCopySettings(deepCopy, convertExtensions, internalUse, removeExtensions),
  );
}

type CopySettings = {
  keepKey: (key: string) => boolean;
  modulate?: (value: unknown) => unknown;
  convertExtensions?: boolean;
  removeExtensions?: boolean;
  stringify?: string[];
  threshold?: number;
  toJSON?: string[];
};

function getCopySettings(
  deepCopy: ReturnType<typeof deepCopyEnabled>,
  convertExtensions?: boolean,
  internalUse?: boolean,
  removeExtensions?: boolean,
): CopySettings {
  const { stringify, toJSON, ignore, modulate, threshold } = deepCopy ?? {};

  let keepKey: CopySettings['keepKey'] = () => true;
  if (internalUse && ignore) {
    if (Array.isArray(ignore)) keepKey = (key) => !ignore.includes(key);
    else if (isFunction(ignore)) keepKey = (key) => !ignore(key);
    else keepKey = () => false;
  }

  return {
    stringify: Array.isArray(stringify) ? stringify : undefined,
    toJSON: Array.isArray(toJSON) ? toJSON : undefined,
    threshold: typeof threshold === 'number' ? threshold : undefined,
    modulate: isFunction(modulate) ? modulate : undefined,
    convertExtensions,
    removeExtensions,
    keepKey,
  };
}

function copyValue(sourceObject, iteration: number, settings: CopySettings) {
  if (
    typeof sourceObject !== 'object' ||
    isFunction(sourceObject) ||
    sourceObject === null ||
    (settings.threshold !== undefined && iteration >= settings.threshold)
  ) {
    return sourceObject;
  }

  const { convertExtensions, removeExtensions, stringify, toJSON, modulate, keepKey } = settings;
  const targetObject = Array.isArray(sourceObject) ? [] : {};

  for (const key of Object.keys(sourceObject)) {
    if (!keepKey(key)) continue;
    const value = sourceObject[key];
    const modulated = modulate ? modulate(value) : undefined;
    if (modulated !== undefined) {
      targetObject[key] = modulated;
    } else if (convertExtensions && key === 'extensions' && Array.isArray(value)) {
      const extensionConversions = extensionsToAttributes(value);
      Object.assign(targetObject, ...extensionConversions);
    } else if (removeExtensions && key === 'extensions') {
      targetObject[key] = [];
    } else if (stringify?.includes(key)) {
      targetObject[key] = isFunction(value?.toString) ? value.toString() : JSON.stringify(value);
    } else if (toJSON?.includes(key) && isFunction(value?.toJSON)) {
      targetObject[key] = value.toJSON();
    } else if (value === null) {
      targetObject[key] = undefined;
    } else if (isDateObject(value)) {
      targetObject[key] = new Date(value).toISOString();
    } else {
      targetObject[key] = copyValue(value, iteration + 1, settings);
    }
  }

  return targetObject;
}

export function extensionsToAttributes(extensions) {
  return extensions
    ?.map((extension) => {
      const { name, value } = extension;
      return name && value && { [`_${name}`]: value };
    })
    .filter(Boolean);
}

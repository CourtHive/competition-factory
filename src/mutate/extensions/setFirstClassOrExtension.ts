import { writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { decorateResult } from '@Functions/global/decorateResult';
import { addExtension } from './addExtension';
import { removeExtension } from './removeExtension';

// constants and types
import { ErrorType, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type SetFirstClassOrExtensionArgs = {
  element: any;
  attribute: string;
  name: string;
  value: any;
  creationTime?: boolean;
};

/**
 * Write helper for the CODES schemaWriteMode transition.
 *
 * Routes a single write to the first-class attribute, the legacy
 * `extensions[]` entry, or both — based on the current `schemaWriteMode`:
 *
 * - NATIVE: write `element[attribute] = value`; remove any stale legacy
 *   extension of the same name so reads stay consistent
 * - DUAL: write the first-class attribute first, then mirror to the legacy
 *   extension (back-compat for consumers that still read `_name`)
 * - LEGACY: write only the extension; do not touch the first-class
 *   attribute (preserves pre-CODES write behavior)
 *
 * Read with {@link firstClassOrExtension} for symmetric semantics.
 */
export function setFirstClassOrExtension(params?: SetFirstClassOrExtensionArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  const stack = 'setFirstClassOrExtension';
  if (typeof params !== 'object') return { error: MISSING_VALUE };
  const { element, attribute, name, value, creationTime } = params;
  if (!element || typeof element !== 'object') return decorateResult({ result: { error: INVALID_VALUES }, stack });
  if (typeof attribute !== 'string' || !attribute) return decorateResult({ result: { error: INVALID_VALUES }, stack });
  if (typeof name !== 'string' || !name) return decorateResult({ result: { error: INVALID_VALUES }, stack });

  if (writeNativeEnabled()) {
    if (value === undefined || value === null) {
      delete element[attribute];
    } else {
      element[attribute] = value;
    }
  }

  if (writeLegacyEnabled()) {
    if (value === undefined || value === null) {
      removeExtension({ element, name });
    } else {
      const result = addExtension({ element, extension: { name, value }, creationTime });
      if (result.error) return decorateResult({ result, stack });
    }
  } else {
    // NATIVE-only: ensure no stale legacy extension lingers under the same name
    if (Array.isArray(element.extensions) && element.extensions.some((ext: any) => ext?.name === name)) {
      removeExtension({ element, name });
    }
  }

  return { ...SUCCESS };
}

import { writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { decorateResult } from '@Functions/global/decorateResult';
import { removeExtension } from './removeExtension';
import { addExtension } from './addExtension';

// constants and types
import { ErrorType, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type SetGroupLeafOrExtensionArgs = {
  element: any;
  groupAttribute: string;
  leafAttribute: string;
  name: string;
  value: any;
  creationTime?: boolean;
};

function writeNativeGroupLeaf(element: any, groupAttribute: string, leafAttribute: string, value: any) {
  if (value === undefined || value === null) {
    if (element[groupAttribute]) {
      delete element[groupAttribute][leafAttribute];
      if (Object.keys(element[groupAttribute]).length === 0) delete element[groupAttribute];
    }
    return;
  }
  if (!element[groupAttribute]) element[groupAttribute] = {};
  element[groupAttribute][leafAttribute] = value;
}

function stripExtensionByName(element: any, name: string) {
  if (Array.isArray(element.extensions) && element.extensions.some((ext: any) => ext?.name === name)) {
    removeExtension({ element, name });
  }
}

/**
 * Write helper for the CODES schemaWriteMode transition (group-leaf variant).
 *
 * Promotes an extension to a nested first-class attribute path
 * (`element[groupAttribute][leafAttribute] = value`) rather than a flat
 * field. Used for cluster promotions like `tournamentRecord.scheduling.*`
 * where related extensions (`schedulingProfile`, `scheduleLimits`,
 * `scheduleTiming`) collapse onto a single group object.
 *
 * Mode semantics match {@link setFirstClassOrExtension}:
 * - NATIVE: write the nested attribute; strip stale legacy extension; if
 *   the group becomes empty, the group object is removed entirely.
 * - DUAL: write both.
 * - LEGACY: write only the extension.
 *
 * Read with `firstClassOrGroupLeafOrExtension` (or a per-site equivalent).
 */
export function setGroupLeafOrExtension(params?: SetGroupLeafOrExtensionArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  const stack = 'setGroupLeafOrExtension';
  if (typeof params !== 'object') return { error: MISSING_VALUE };
  const { element, groupAttribute, leafAttribute, name, value, creationTime } = params;
  if (!element || typeof element !== 'object') return decorateResult({ result: { error: INVALID_VALUES }, stack });
  if (typeof groupAttribute !== 'string' || !groupAttribute)
    return decorateResult({ result: { error: INVALID_VALUES }, stack });
  if (typeof leafAttribute !== 'string' || !leafAttribute)
    return decorateResult({ result: { error: INVALID_VALUES }, stack });
  if (typeof name !== 'string' || !name) return decorateResult({ result: { error: INVALID_VALUES }, stack });

  if (writeNativeEnabled()) {
    writeNativeGroupLeaf(element, groupAttribute, leafAttribute, value);
  }

  if (writeLegacyEnabled()) {
    if (value === undefined || value === null) {
      removeExtension({ element, name });
    } else {
      const result = addExtension({ element, extension: { name, value }, creationTime });
      if (result.error) return decorateResult({ result, stack });
    }
  } else {
    stripExtensionByName(element, name);
  }

  return { ...SUCCESS };
}

type FirstClassGroupLeafOrExtensionArgs = {
  element: any;
  groupAttribute: string;
  leafAttribute: string;
  name: string;
};

/**
 * Read helper paired with {@link setGroupLeafOrExtension}. Prefer
 * `element[groupAttribute][leafAttribute]`; fall back to the legacy
 * extension value.
 */
export function firstClassGroupLeafOrExtension({
  element,
  groupAttribute,
  leafAttribute,
  name,
}: FirstClassGroupLeafOrExtensionArgs) {
  const firstClass = element?.[groupAttribute]?.[leafAttribute];
  if (firstClass !== undefined) return firstClass;
  const ext = (element?.extensions ?? []).find((e: any) => e?.name === name);
  return ext?.value;
}

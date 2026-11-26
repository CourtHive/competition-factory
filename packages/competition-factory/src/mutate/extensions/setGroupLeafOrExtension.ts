import { writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { decorateResult } from '@Functions/global/decorateResult';
import { removeExtension } from './removeExtension';
import { addExtension } from './addExtension';
import { nowIso } from '@Tools/clock';

// constants
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
 * - BRIDGE: write both.
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

/**
 * `setGroupLeafOrExtension` for a writer that plans before it writes: every decision (the schema write mode, whether
 * the group, the leaf's extension and the element's extensions exist, the extension's `createdAt`) is taken now, and
 * the returned commit performs only the writes `setGroupLeafOrExtension` would make, in the same order.
 */
export function planGroupLeafOrExtension({
  element,
  groupAttribute,
  leafAttribute,
  name,
  value,
  creationTime = true,
}: SetGroupLeafOrExtensionArgs): () => void {
  const writes: (() => void)[] = [];
  const clearing = value === undefined || value === null;
  if (writeNativeEnabled()) {
    if (clearing) {
      const group = element[groupAttribute];
      if (group)
        writes.push(() => {
          delete group[leafAttribute];
          if (Object.keys(group).length === 0) delete element[groupAttribute];
        });
    } else {
      const group = element[groupAttribute];
      writes.push(
        group ? () => (group[leafAttribute] = value) : () => (element[groupAttribute] = { [leafAttribute]: value }),
      );
    }
  }
  const extensions: { name?: string; value?: unknown }[] | undefined = element.extensions;
  const existing = extensions?.find((extension) => extension?.name === name);
  if (writeLegacyEnabled() && !clearing) {
    if (!extensions) writes.push(() => (element.extensions = []));
    if (existing) writes.push(() => (existing.value = value));
    else if (value) {
      const extension = creationTime ? { name, value, createdAt: nowIso() } : { name, value };
      writes.push(() => element.extensions.push(extension));
    }
  } else if (extensions && (writeLegacyEnabled() || existing)) {
    // removeExtension (legacy clear) or stripExtensionByName (native or bridge without legacy)
    writes.push(() => (element.extensions = extensions.filter((extension) => extension?.name !== name)));
  }
  return () => {
    for (const write of writes) write();
  };
}

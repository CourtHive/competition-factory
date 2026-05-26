import { writeLegacyEnabled, writeNativeEnabled } from '@Global/state/globalState';
import { decorateResult } from '@Functions/global/decorateResult';
import { addTimeItem } from './addTimeItem';

// constants and types
import { ErrorType, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type SetFirstClassOrTimeItemArgs = {
  element: any;
  scheduleObject?: string;
  attribute: string;
  itemType: string;
  value: any;
  itemSubTypes?: string[];
  itemDate?: string;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
};

function writeNativeFirstClass(element: any, scheduleObject: string, attribute: string, value: any) {
  if (value === undefined || value === null) {
    if (element[scheduleObject]) delete element[scheduleObject][attribute];
    return;
  }
  if (!element[scheduleObject]) element[scheduleObject] = {};
  element[scheduleObject][attribute] = value;
}

function stripTimeItemsByType(element: any, itemType: string) {
  if (Array.isArray(element.timeItems)) {
    element.timeItems = element.timeItems.filter((ti: any) => ti?.itemType !== itemType);
  }
}

function appendLegacyTimeItem(args: {
  element: any;
  itemType: string;
  value: any;
  itemSubTypes?: string[];
  itemDate?: string;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
}) {
  const { element, itemType, value, itemSubTypes, itemDate, removePriorValues, duplicateValues } = args;
  const timeItem: any = { itemType, itemValue: value };
  if (itemSubTypes?.length) timeItem.itemSubTypes = itemSubTypes;
  if (itemDate) timeItem.itemDate = itemDate;
  return addTimeItem({ element, timeItem, removePriorValues, duplicateValues });
}

function validateParams(params?: SetFirstClassOrTimeItemArgs): { error?: ErrorType } | null {
  if (typeof params !== 'object') return { error: MISSING_VALUE };
  if (!params.element || typeof params.element !== 'object') return { error: INVALID_VALUES };
  if (typeof params.attribute !== 'string' || !params.attribute) return { error: INVALID_VALUES };
  if (typeof params.itemType !== 'string' || !params.itemType) return { error: INVALID_VALUES };
  return null;
}

/**
 * Write helper for promoting schedule-related timeItems to first-class
 * attributes on a parent object (typically `matchUp.schedule.*`).
 *
 * Branches on the current `schemaWriteMode`:
 *
 * - NATIVE: write `element[scheduleObject][attribute] = value`; strip any
 *   stale timeItem with the matching `itemType` so reads stay consistent.
 *   When `value` is `undefined`, also remove the first-class field.
 * - DUAL: write the first-class attribute AND keep the legacy timeItem
 *   append (back-compat for consumers reading `timeItems[]` directly).
 * - LEGACY: only call `addTimeItem` — preserves pre-CODES behavior.
 *
 * Use ONLY for schedule-style itemTypes whose semantic is last-write-wins
 * (SCHEDULED_DATE, SCHEDULED_TIME, ASSIGN_COURT, ASSIGN_VENUE, COURT_ORDER,
 * COURT_ANNOTATION, ALLOCATE_COURTS, TIME_MODIFIERS, HOME_PARTICIPANT_ID,
 * ASSIGN_OFFICIAL). Lifecycle items (`START_TIME / STOP_TIME / RESUME_TIME
 * / END_TIME`) MUST keep writing through `addTimeItem` directly because
 * `matchUpDuration()` consumes the ordered history.
 *
 * Read with {@link firstClassOrTimeItem} for symmetric semantics.
 */
export function setFirstClassOrTimeItem(params?: SetFirstClassOrTimeItemArgs): {
  success?: boolean;
  error?: ErrorType;
} {
  const stack = 'setFirstClassOrTimeItem';
  const validation = validateParams(params);
  if (validation) return decorateResult({ result: validation, stack });

  const { element, scheduleObject = 'schedule', attribute, itemType, value } = params as SetFirstClassOrTimeItemArgs;

  if (writeNativeEnabled()) {
    writeNativeFirstClass(element, scheduleObject, attribute, value);
    // NATIVE invariant: schedule timeItems do not coexist with their first-class
    // attribute. Strip any stale entries with this itemType.
    stripTimeItemsByType(element, itemType);
  }

  if (!writeLegacyEnabled()) return { ...SUCCESS };

  // LEGACY (or DUAL legacy branch): always delegate to addTimeItem so that
  // its `removePriorValues` / `duplicateValues` semantics — including the
  // undefined-value-push behavior — match pre-CODES exactly.
  const result = appendLegacyTimeItem({
    element,
    itemType,
    value,
    itemSubTypes: params?.itemSubTypes,
    itemDate: params?.itemDate,
    removePriorValues: params?.removePriorValues,
    duplicateValues: params?.duplicateValues,
  });
  if (result.error) return decorateResult({ result, stack });
  return { ...SUCCESS };
}

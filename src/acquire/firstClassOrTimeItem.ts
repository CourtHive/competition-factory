import { getTimeItem } from '@Query/base/timeItems';

type FirstClassOrTimeItemArgs = {
  element: any;
  scheduleObject?: string;
  attribute: string;
  itemType: string;
};

/**
 * Read helper for the CODES schemaWriteMode transition (timeItems variant).
 *
 * Returns the first-class schedule attribute when defined, otherwise falls
 * back to the latest timeItem with the matching `itemType`. Used everywhere
 * a former schedule-timeItem is read so that records written in any mode
 * (NATIVE, DUAL, LEGACY) read identically.
 *
 * Mirrors {@link firstClassOrExtension} for the timeItems plumbing.
 */
export function firstClassOrTimeItem({
  element,
  scheduleObject = 'schedule',
  attribute,
  itemType,
}: FirstClassOrTimeItemArgs) {
  const firstClass = element?.[scheduleObject]?.[attribute];
  if (firstClass !== undefined) return firstClass;
  if (!Array.isArray(element?.timeItems)) return undefined;
  const { timeItem } = getTimeItem({ element, itemType });
  return timeItem?.itemValue;
}

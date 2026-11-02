// types
import type { Event } from '@Types/tournamentTypes';

/**
 * The category name an event's scheduling timing is keyed by: the category's `categoryName`, else its
 * `ageCategoryCode`, else the event's own `eventId`. `modifyEventMatchUpFormatTiming` writes an event's override under
 * this key, so every reader of scheduling timing must resolve it the same way: an event with no category stores its
 * override under its eventId, and a reader that stopped at the category read the policy default instead.
 */
export function timingCategoryName(event?: Pick<Event, 'category' | 'eventId'> | null): string | undefined {
  const category = event?.category;
  return category?.categoryName || category?.ageCategoryCode || event?.eventId || undefined;
}

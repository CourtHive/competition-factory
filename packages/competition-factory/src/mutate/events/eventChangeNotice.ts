import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';

// types
import { Entry, Event, Tournament } from '@Types/tournamentTypes';

/**
 * The event as MODIFY_EVENT covers it: its own attributes (tieFormats, extensions such as the flight
 * profile and applied policies, timeItems such as publish state), without the draws and entries, which
 * are announced by notices of their own. Two keys differ exactly when one of those attributes changed.
 */
export function eventAttributesKey(event?: Event): string | undefined {
  if (!event) return undefined;
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (key === 'drawDefinitions' || key === 'entries' || isEmptyCollection(value)) continue;
    attributes[key] = value;
  }
  return JSON.stringify(attributes);
}

// an initialized `extensions: []` or `timeItems: []` holds nothing a consumer could miss
function isEmptyCollection(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return !!value && typeof value === 'object' && Object.keys(value).length === 0;
}

/** A comparable form of an entries list (event.entries, drawDefinition.entries, flight.drawEntries). */
export function entriesKey(entries?: Entry[]): string {
  return JSON.stringify(entries ?? []);
}

type ModifyEventNoticeIfChangedArgs = {
  tournamentId?: string;
  before?: string;
  event?: Event;
};

/** MODIFY_EVENT when the event's own attributes differ from `before` (an `eventAttributesKey`). */
export function modifyEventNoticeIfChanged({ tournamentId, before, event }: ModifyEventNoticeIfChangedArgs): boolean {
  if (!event || eventAttributesKey(event) === before) return false;
  modifyEventNotice({ tournamentId, event });
  return true;
}

type EventScope = {
  tournamentRecord?: Tournament;
  event?: Event;
};

/**
 * Run a mutation scoped to one event and announce the event with MODIFY_EVENT when the mutation
 * succeeded and changed it. A call that changes nothing on the event, or is refused, sends nothing.
 */
export function withEventChangeNotice<T extends { error?: unknown }>(
  { tournamentRecord, event }: EventScope,
  mutate: () => T,
): T {
  const before = eventAttributesKey(event);
  const result = mutate();
  if (!result?.error) modifyEventNoticeIfChanged({ tournamentId: tournamentRecord?.tournamentId, before, event });
  return result;
}

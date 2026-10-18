import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

/**
 * A comparable snapshot of the parts of an element a first-class-or-extension write can change:
 * the named attributes and `extensions`, which carries the legacy mirror of each of them.
 *
 * Take it BEFORE the write, and before any in-place change to a value read from the element:
 * `firstClassOrExtension` hands back the live value, so a writer that edits it and then sets it
 * has already changed the record by the time it calls the setter.
 */
export function attributesSnapshot(element: object | undefined, attributes: string[]): string {
  const record = element as Record<string, unknown> | undefined;
  return JSON.stringify([...attributes.map((attribute) => record?.[attribute] ?? null), record?.extensions ?? []]);
}

type AnnounceDrawChangeArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureIds?: string[];
  attributes: string[];
  before: string;
  event?: Event;
};

/**
 * Emits MODIFY_DRAW_DEFINITION when the snapshotted attributes of the draw changed, and nothing when
 * the write left them as they were: a notice is a statement that the record changed.
 */
export function announceDrawChange({
  tournamentRecord,
  drawDefinition,
  structureIds,
  attributes,
  before,
  event,
}: AnnounceDrawChangeArgs): boolean {
  if (attributesSnapshot(drawDefinition, attributes) === before) return false;
  modifyDrawNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    structureIds,
  });
  return true;
}

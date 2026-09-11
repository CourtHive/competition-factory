import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { checkUnifiedIds, upsertUnifiedId } from '@Mutate/base/unifiedIds';

// constants and types
import { DRAW_DEFINITION_NOT_FOUND, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { UnifiedDrawID } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Upsert a `UnifiedDrawID` entry into `drawDefinition.drawOtherIds[]` — the draw-grain
 * member of the `Unified*ID` write family.
 *
 * `organisationId` is the upsert key. Only the id attributes actually supplied are
 * written, because an origin system rarely has all of them: UTR carries a tournament
 * (its "event") and a draw (its "flight" GUID) but has **no event-grain object at all**,
 * so `eventId` is legitimately absent rather than unknown.
 *
 * Idempotent — re-applying the same values is a no-op and fires no notice. Setting
 * `isOrigin` is refused when a different organisation already holds it; re-point it with
 * {@link setDrawOtherIds}.
 */
export function addDrawOtherId({
  uniqueOrganisationName,
  otherTournamentId,
  drawDefinition,
  organisationId,
  otherEventId,
  otherDrawId,
  tournamentId,
  isOrigin,
  event,
}: {
  uniqueOrganisationName?: string;
  // every id below belongs to `organisationId`, never to the carrying record
  otherTournamentId?: string;
  drawDefinition: any;
  organisationId: string;
  otherEventId?: string;
  otherDrawId?: string;
  tournamentId?: string;
  isOrigin?: boolean;
  event?: any;
}) {
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  if (!organisationId) return { error: MISSING_VALUE, info: 'Missing organisationId' };
  if (!otherDrawId && !otherEventId && !otherTournamentId) {
    return { error: MISSING_VALUE, info: 'Requires at least one of otherDrawId, otherEventId, otherTournamentId' };
  }

  drawDefinition.drawOtherIds ??= [];

  const result = upsertUnifiedId({
    values: { tournamentId: otherTournamentId, eventId: otherEventId, drawId: otherDrawId },
    entries: drawDefinition.drawOtherIds,
    uniqueOrganisationName,
    organisationId,
    isOrigin,
  });
  if (result.error) return result;

  if (result.changed) modifyDrawNotice({ eventId: event?.eventId, drawDefinition, tournamentId });

  return { ...SUCCESS };
}

/**
 * Replace `drawDefinition.drawOtherIds[]` wholesale. Pass `null` to clear.
 *
 * The reconciliation grain — a caller diffing a draw against its origin system holds the
 * full list — and the only way to re-point `isOrigin`. Validates that at most one entry
 * carries `isOrigin` and that every entry carries an `organisationId`.
 */
export function setDrawOtherIds({
  drawOtherIds,
  drawDefinition,
  tournamentId,
  event,
}: {
  drawOtherIds: UnifiedDrawID[] | null;
  drawDefinition: any;
  tournamentId?: string;
  event?: any;
}) {
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };

  if (drawOtherIds === null) {
    if (drawDefinition.drawOtherIds === undefined) return { ...SUCCESS };
    delete drawDefinition.drawOtherIds;
    modifyDrawNotice({ eventId: event?.eventId, drawDefinition, tournamentId });
    return { ...SUCCESS };
  }

  const check = checkUnifiedIds(drawOtherIds as any[]);
  if (check?.error) return check;

  drawDefinition.drawOtherIds = drawOtherIds;
  modifyDrawNotice({ eventId: event?.eventId, drawDefinition, tournamentId });

  return { ...SUCCESS };
}

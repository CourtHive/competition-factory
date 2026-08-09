/**
 * Resolve a matchUp's read-model publish state from an event's PUBLIC publish
 * status (the object returned by `getEventPublishStatus`, i.e. the
 * `PUBLISH.STATUS` timeItem's `itemValue.PUBLIC`).
 *
 * The read model stores the **time-independent inputs**, never a "visible now"
 * boolean — a projection only refreshes on mutation, so a stored visibility flag
 * would go stale the instant an embargo lifts. Instead:
 *   - `published` = publish INTENT, resolved through the draw → stage → structure
 *     cascade (embargo-independent), further gated by a per-structure `roundLimit`
 *     (rounds beyond the limit are hidden — a hard, time-independent hide).
 *   - `embargo`   = the effective embargo release timestamp (ISO): the LATEST
 *     (max) of every applicable level's embargo. `getEventData` hides a matchUp
 *     while ANY of its applicable draw / stage / structure embargoes is active
 *     (they are independent AND-gates), so it only becomes visible once the LAST
 *     one lifts. A precedence "first-present" pick would let a lifted draw embargo
 *     unmask a still-active structure embargo (premature disclosure).
 * Actual visibility is computed at READ time: `published AND (embargo IS NULL OR
 * embargo <= now())`.
 */

import { isISODateString } from '@Tools/dateTime';

export interface MatchUpPublishState {
  published: boolean;
  embargo: string | null;
  // round-level (scheduledRounds) embargo release: while active, getEventData redacts
  // the round's placement (venue/court/time) though the matchUp itself stays visible.
  // Stored so a consumer gates venue_id/court_id at read time (like `embargo`); NULL = none.
  scheduleEmbargo: string | null;
}

const NOT_PUBLISHED: MatchUpPublishState = { published: false, embargo: null, scheduleEmbargo: null };

function keyed(obj?: Record<string, any>): boolean {
  return !!obj && Object.keys(obj).length > 0;
}

// Publish intent through the cascade. A level with no enumerated keys means "all
// published" (inherit); an enumerated level publishes only listed entries, and an
// explicit `published: false` un-publishes.
function resolveIntent(drawDetail: any, structureId?: string, stage?: string): boolean {
  if (!drawDetail.publishingDetail?.published) return false;

  if (keyed(drawDetail.structureDetails)) {
    const detail = structureId ? drawDetail.structureDetails[structureId] : undefined;
    if (!detail || detail.published === false) return false;
  }
  if (keyed(drawDetail.stageDetails)) {
    const detail = stage ? drawDetail.stageDetails[stage] : undefined;
    if (!detail || detail.published === false) return false;
  }
  return true;
}

// Effective embargo release: the LATEST (max) of every applicable level's embargo.
// A matchUp is hidden while ANY applicable draw/stage/structure embargo is active, so
// it is visible only once the last one lifts — NOT the highest-precedence one (a lifted
// draw embargo must not unmask a still-active structure embargo). Only ISO strings
// constrain, matching `isEmbargoed`.
function resolveEmbargo(drawDetail: any, structureId?: string, stage?: string): string | null {
  const candidates = [
    drawDetail.publishingDetail?.embargo,
    stage ? drawDetail.stageDetails?.[stage]?.embargo : undefined,
    structureId ? drawDetail.structureDetails?.[structureId]?.embargo : undefined,
  ].filter((embargo): embargo is string => typeof embargo === 'string' && isISODateString(embargo));
  if (!candidates.length) return null;
  return candidates.reduce((latest, embargo) =>
    new Date(embargo).getTime() > new Date(latest).getTime() ? embargo : latest,
  );
}

// A per-structure `roundLimit` hides every round beyond the limit (getEventData drops
// them from `roundMatchUps`); a hidden round is simply not published — a hard,
// time-independent hide, distinct from an embargo release.
function roundHidden(drawDetail: any, structureId?: string, roundNumber?: number): boolean {
  if (structureId == null || roundNumber == null) return false;
  const roundLimit = drawDetail.structureDetails?.[structureId]?.roundLimit;
  return roundLimit != null && roundNumber > roundLimit;
}

// The round-level scheduledRounds embargo (structure → round), the finer gate that
// redacts a round's placement while the matchUp stays visible. Only ISO strings constrain.
function resolveScheduleEmbargo(drawDetail: any, structureId?: string, roundNumber?: number): string | null {
  if (structureId == null || roundNumber == null) return null;
  const embargo = drawDetail.structureDetails?.[structureId]?.scheduledRounds?.[roundNumber]?.embargo;
  return typeof embargo === 'string' && isISODateString(embargo) ? embargo : null;
}

/**
 * Is an EVENT published, for the `events.published` read-model column?
 *
 * NOT `!!getEventPublishStatus({ event })`. `unPublishEvent` leaves the `PUBLISH.STATUS`
 * timeItem in place with a PUBLIC envelope of
 * `{ structureIds: undefined, drawIds: undefined, seeding: undefined }`. `JSON.stringify`
 * renders that as `{}` because it omits undefined values, so it LOOKS empty in any debug
 * dump — but it is truthy and `Object.keys().length` is 3, so a `keyed()` / non-empty test
 * does not save you either. Both traps were hit before landing this.
 *
 * Mirrors `resolveMatchUpPublishState`'s branch structure at DRAW granularity, which is
 * why matchUps were already correct while the event flag was not: matchUps resolve through
 * the cascade, the event flag short-circuited it. Deliberately draw-level rather than
 * per-matchUp — an event whose draw publishes only selected structures is still a
 * published event.
 */
export function isEventPublished(status: any): boolean {
  if (!status) return false; // no PUBLISH.STATUS → not published
  const { drawDetails } = status;
  if (drawDetails) {
    // empty enumeration means "all published" (inherit), matching the cascade
    if (!Object.keys(drawDetails).length) return true;
    return Object.values(drawDetails).some((detail: any) => !!detail?.publishingDetail?.published);
  }
  // legacy v1 shape: a top-level `drawIds` array lists the published draws
  if (Array.isArray(status.drawIds)) return status.drawIds.length > 0;
  return !!status.published; // legacy event-level flag
}

export function resolveMatchUpPublishState(
  status: any,
  drawId?: string,
  structureId?: string,
  stage?: string,
  roundNumber?: number,
): MatchUpPublishState {
  if (!status) return NOT_PUBLISHED; // no PUBLISH.STATUS → not published
  const { drawDetails } = status;
  if (!drawDetails) {
    // legacy v1 shape: a top-level `drawIds` array lists the published draws (no
    // per-draw detail). Mirror getDrawIsPublished's drawIds branch — a listed draw
    // is published, an unlisted one is not (so a stray event-level `published:true`
    // no longer over-discloses unlisted draws).
    if (Array.isArray(status.drawIds))
      return { published: !!drawId && status.drawIds.includes(drawId), embargo: null, scheduleEmbargo: null };
    return { published: !!status.published, embargo: null, scheduleEmbargo: null }; // legacy event-level flag
  }
  if (!Object.keys(drawDetails).length) return { published: true, embargo: null, scheduleEmbargo: null }; // empty → all published

  const drawDetail = drawId ? drawDetails[drawId] : undefined;
  if (!drawDetail) return NOT_PUBLISHED; // draws enumerated, this one absent → not published

  const published = resolveIntent(drawDetail, structureId, stage) && !roundHidden(drawDetail, structureId, roundNumber);
  return {
    published,
    embargo: resolveEmbargo(drawDetail, structureId, stage),
    scheduleEmbargo: resolveScheduleEmbargo(drawDetail, structureId, roundNumber),
  };
}

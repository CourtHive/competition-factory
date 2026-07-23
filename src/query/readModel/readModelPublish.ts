/**
 * Resolve a matchUp's read-model publish state from an event's PUBLIC publish
 * status (the object returned by `getEventPublishStatus`, i.e. the
 * `PUBLISH.STATUS` timeItem's `itemValue.PUBLIC`).
 *
 * The read model stores the **time-independent inputs**, never a "visible now"
 * boolean — a projection only refreshes on mutation, so a stored visibility flag
 * would go stale the instant an embargo lifts. Instead:
 *   - `published` = publish INTENT, resolved through the draw → stage → structure
 *     cascade (embargo-independent).
 *   - `embargo`   = the effective embargo release timestamp (ISO), with
 *     draw > stage > structure precedence (draw supersedes stage supersedes
 *     structure, per `DrawPublishingDetails`).
 * Actual visibility is computed at READ time: `published AND (embargo IS NULL OR
 * embargo <= now())`.
 */

export interface MatchUpPublishState {
  published: boolean;
  embargo: string | null;
}

const NOT_PUBLISHED: MatchUpPublishState = { published: false, embargo: null };

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

// Effective embargo release, draw > stage > structure precedence.
function resolveEmbargo(drawDetail: any, structureId?: string, stage?: string): string | null {
  const drawEmbargo = drawDetail.publishingDetail?.embargo;
  const stageEmbargo = stage ? drawDetail.stageDetails?.[stage]?.embargo : undefined;
  const structureEmbargo = structureId ? drawDetail.structureDetails?.[structureId]?.embargo : undefined;
  return drawEmbargo ?? stageEmbargo ?? structureEmbargo ?? null;
}

export function resolveMatchUpPublishState(
  status: any,
  drawId?: string,
  structureId?: string,
  stage?: string,
): MatchUpPublishState {
  if (!status) return NOT_PUBLISHED; // no PUBLISH.STATUS → not published
  const { drawDetails } = status;
  if (!drawDetails) return { published: !!status.published, embargo: null }; // legacy event-level flag
  if (!Object.keys(drawDetails).length) return { published: true, embargo: null }; // empty drawDetails → all published

  const drawDetail = drawId ? drawDetails[drawId] : undefined;
  if (!drawDetail) return NOT_PUBLISHED; // draws enumerated, this one absent → not published

  return {
    published: resolveIntent(drawDetail, structureId, stage),
    embargo: resolveEmbargo(drawDetail, structureId, stage),
  };
}

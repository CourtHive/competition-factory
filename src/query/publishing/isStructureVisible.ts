import { isVisiblyPublished } from '@Query/publishing/isEmbargoed';

// types
import type { DrawPublishingDetails } from '@Mutate/publishing/publishEvent';

type IsStructureVisibleArgs = {
  drawDetail?: Partial<DrawPublishingDetails>;
  structureId?: string;
  stage?: string;
};

function keyed(details?: object): boolean {
  return !!details && Object.keys(details).length > 0;
}

/**
 * Is a structure visible within its draw, by the draw's stage and structure publishing details?
 *
 * The ONE reading of `stageDetails` / `structureDetails` for every public reader (`getEventData`,
 * `getDrawData`, `competitionScheduleMatchUps`); the read model's `resolveIntent` applies the same rule
 * to intent alone. The draw's own `publishingDetail` is judged by the caller.
 *
 * - A level with no keys publishes everything at that level (the legacy shape: no discrete publishing).
 * - A keyed level is an INCLUSION list: only an entry that is visibly published (published, embargo
 *   lifted) is shown. An unkeyed entry is hidden, so a structure added after a selective publish (a
 *   playoff, a later qualifying) stays withheld until it is published explicitly.
 *
 * Before this, the readers disagreed on that last case: `getDrawData` showed an unkeyed structure,
 * `getEventData` hid it, and `competitionScheduleMatchUps` showed it only when every keyed entry was
 * unpublished. The same tournament could list a structure's matchUps in the order of play while its
 * draw omitted it.
 */
export function isStructureVisible({ drawDetail, structureId, stage }: IsStructureVisibleArgs): boolean {
  const stageDetails = drawDetail?.stageDetails;
  if (keyed(stageDetails) && !isVisiblyPublished(stage ? stageDetails?.[stage] : undefined)) return false;

  const structureDetails = drawDetail?.structureDetails;
  if (keyed(structureDetails) && !isVisiblyPublished(structureId ? structureDetails?.[structureId] : undefined))
    return false;

  return true;
}

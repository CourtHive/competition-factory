import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { isConvertableInteger } from '@Tools/math';

// types
import type { PublishingDetail } from '@Mutate/publishing/publishEvent';

/**
 * Withhold the rounds of an AD_HOC structure beyond its published `roundLimit`.
 *
 * Applied in `getDrawData`, the tier every public payload is assembled from: `getEventData` (full),
 * `drawdata` and `structuredata` all pass through it. It used to live in `getEventData` alone, so the
 * draw and structure tiers that courthive-public reads (`drawsProfile: 'STUBS'`, then `drawdata`)
 * served every round of a draw whose later rounds a director had hidden. Found by the Guidon
 * publishing journey.
 *
 * Returns a new structure; the one passed in is never modified.
 */
type RoundKeyed = {
  roundMatchUps?: Record<string, unknown>;
  roundProfile?: Record<string, unknown>;
};

export function applyRoundLimit<T extends RoundKeyed>({
  structureDetail,
  structure,
  drawType,
}: {
  structureDetail?: PublishingDetail;
  structure: T;
  drawType?: string;
}): T {
  const roundLimit = structureDetail?.roundLimit;
  if (!isAdHocType(drawType) || !isConvertableInteger(roundLimit) || !structure?.roundMatchUps) return structure;

  const roundMatchUps: Record<string, unknown> = {};
  const roundProfile: Record<string, unknown> = {};
  for (const roundNumber of Object.keys(structure.roundMatchUps)) {
    if (Number(roundNumber) > Number(roundLimit)) continue;
    roundMatchUps[roundNumber] = structure.roundMatchUps[roundNumber];
    if (structure.roundProfile?.[roundNumber]) roundProfile[roundNumber] = structure.roundProfile[roundNumber];
  }
  return { ...structure, roundMatchUps, roundProfile };
}

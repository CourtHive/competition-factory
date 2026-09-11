import { LADDER } from '@Constants/drawDefinitionConstants';

/**
 * A ladder shares the AD_HOC structure SHAPE but not its meaning: a ladder's `positionAssignments`
 * are an ordered standing, where an `AD_HOC` draw's are merely a roster. Ask this — not
 * `isAdHocType` — wherever that difference matters.
 */
export function isLadder(drawType?: string): boolean {
  return drawType === LADDER;
}

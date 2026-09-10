import { AD_HOC, LADDER, SWISS } from '@Constants/drawDefinitionConstants';

/**
 * AD_HOC here means a STRUCTURE SHAPE, not a competition philosophy: matchUps carrying neither
 * `roundPosition` nor `drawPosition`, so nothing is derived from bracket geometry.
 *
 * LADDER qualifies on that definition and gets the behaviour it needs for free — no drawSize
 * required, no stage capacity, no round generation unless `roundsCount` is supplied (a ladder
 * supplies none, so it generates zero matchUps), and participants assignable directly to a matchUp
 * side without drawPositions, which is exactly how a challenge creates one.
 *
 * What a ladder is NOT is unordered. Its `positionAssignments` ARE the standing, and `drawPosition`
 * is read as rank. Anything that needs that distinction should ask `isLadder`, not this.
 */
const AD_HOC_TYPES = new Set([AD_HOC, LADDER, SWISS]);

export function isAdHocType(drawType?: string): boolean {
  return !!drawType && AD_HOC_TYPES.has(drawType);
}

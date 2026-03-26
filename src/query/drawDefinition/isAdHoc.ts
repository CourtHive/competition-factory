import { ITEM, VOLUNTARY_CONSOLATION, WIN_RATIO } from '@Constants/drawDefinitionConstants';

type IsAdHocArgs = {
  structure?: any; // in this case support hydrated structures as well
};
export function isAdHoc({ structure }: IsAdHocArgs): boolean {
  if (!structure) return false;

  const matchUps = structure.matchUps || (structure.roundMatchUps && Object.values(structure.roundMatchUps).flat());

  const hasRoundPosition = !!matchUps?.find((matchUp) => matchUp?.roundPosition);
  const hasDrawPosition = !!matchUps?.find((matchUp) => matchUp?.drawPositions?.length);

  // Voluntary consolation structures with finishingPosition=WIN_RATIO are AD_HOC
  // BUT RR child group structures (ITEM type) with drawPositions are NOT AD_HOC
  if (structure?.stage === VOLUNTARY_CONSOLATION) {
    if (structure?.structureType === ITEM && hasDrawPosition) return false;
    return structure?.finishingPosition === WIN_RATIO;
  }

  return (
    !structure?.structures &&
    (!matchUps.length || (!hasRoundPosition && !hasDrawPosition))
  );
}

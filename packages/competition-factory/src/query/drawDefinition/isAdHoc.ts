import { ITEM, VOLUNTARY_CONSOLATION, WIN_RATIO } from '@Constants/drawDefinitionConstants';

type AdHocProbeMatchUp = { roundPosition?: number; drawPositions?: unknown[] } | undefined;

type IsAdHocArgs = {
  /** a stored structure, or a hydrated one whose matchUps are given by round (`roundMatchUps`) */
  structure?: {
    matchUps?: AdHocProbeMatchUp[];
    roundMatchUps?: { [roundNumber: string]: AdHocProbeMatchUp[] };
    structures?: unknown[];
    finishingPosition?: string;
    structureType?: string;
    stage?: string;
  };
};
export function isAdHoc({ structure }: IsAdHocArgs): boolean {
  if (!structure) return false;

  const matchUps = structure.matchUps || (structure.roundMatchUps && Object.values(structure.roundMatchUps).flat());

  const hasRoundPosition = !!matchUps?.find((matchUp) => matchUp?.roundPosition);
  const hasDrawPosition = !!matchUps?.find((matchUp) => matchUp?.drawPositions?.length);

  // Voluntary consolation structures with finishingPosition=WIN_RATIO are AD_HOC
  // BUT RR child group structures (ITEM type with drawPositions) and
  // RR container structures (with nested child structures) are NOT AD_HOC
  if (structure?.stage === VOLUNTARY_CONSOLATION) {
    if (structure?.structures) return false;
    if (structure?.structureType === ITEM && hasDrawPosition) return false;
    return structure?.finishingPosition === WIN_RATIO;
  }

  return !structure?.structures && (!matchUps!.length || (!hasRoundPosition && !hasDrawPosition));
}

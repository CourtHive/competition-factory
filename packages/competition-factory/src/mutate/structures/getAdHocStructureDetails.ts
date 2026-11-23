import { INVALID_STRUCTURE, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { ROUND_OUTCOME } from '@Constants/drawDefinitionConstants';
import { getMatchUpId } from '@Functions/global/extractors';

export function getAdHocStructureDetails(params) {
  let matchUpIds = params.matchUpIds ?? [];
  const { drawDefinition } = params;

  const structureId =
    params.structureId ??
    drawDefinition?.structures?.find((structure) =>
      structure.matchUps?.some(({ matchUpId }) => matchUpIds.includes(matchUpId)),
    )?.structureId ??
    drawDefinition?.structures?.[0]?.structureId;

  if (!structureId) return { error: STRUCTURE_NOT_FOUND };

  const structure: any = drawDefinition.structures?.find((structure) => structure.structureId === structureId);
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const existingMatchUps = structure?.matchUps;
  const structureHasRoundPositions = existingMatchUps?.find((matchUp) => !!matchUp.roundPosition);

  if (structure.structures || structureHasRoundPositions || structure.finishingPosition === ROUND_OUTCOME) {
    return { error: INVALID_STRUCTURE };
  }

  const existingRoundMatchUpIds = existingMatchUps
    .filter(({ roundNumber }) => params.roundNumbers?.includes(roundNumber))
    .map(getMatchUpId);

  // filter out any erroneous matchUpIds
  matchUpIds = matchUpIds.filter((matchUpId) => !existingRoundMatchUpIds.includes(matchUpId));

  // if no matchUpIds are provided, use existingRoundMatchUpIds
  if (params.roundNumbers && !matchUpIds.length) matchUpIds = existingRoundMatchUpIds;

  return { existingMatchUps, matchUpIds, structureId, structure };
}

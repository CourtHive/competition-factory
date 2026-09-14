import { getStructureRoundProfile } from '@Query/structure/getStructureRoundProfile';
import { roundValueRanges } from '@Query/structure/structureUtils';
import { numericSort } from '@Tools/sorting';
import { unique } from '@Tools/arrays';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { MatchUpsMap } from '@Types/factoryTypes';

// NOTE: positionsNotPlayedOff may not be accurate when structureIds are are provided
type GetPositionsPlayedOff = {
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  structureIds?: string[];
};
export function getPositionsPlayedOff({ drawDefinition, structureIds, matchUpsMap }: GetPositionsPlayedOff) {
  if (structureIds && !Array.isArray(structureIds)) return { error: INVALID_VALUES, context: { structureIds } };
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  structureIds =
    structureIds ??
    (drawDefinition.structures ?? [])
      .filter((structure) => structure.stage !== QUALIFYING)
      .map(({ structureId }) => structureId);

  const allFinishingPositionRanges = structureIds
    .map((structureId) => {
      const { roundProfile } = getStructureRoundProfile({
        drawDefinition,
        matchUpsMap,
        structureId,
      });
      const values = roundProfile && Object.values(roundProfile);
      return values?.map(roundValueRanges).flat();
    })
    .flat();

  const positionsPlayedOff = allFinishingPositionRanges
    .filter((positionRange) => positionRange?.length === 1)
    .sort(numericSort)
    .flat();

  const allRangeValues = unique(allFinishingPositionRanges.flat());
  const positionsNotPlayedOff = allRangeValues.filter((position) => !positionsPlayedOff.includes(position));

  return {
    positionsNotPlayedOff,
    positionsPlayedOff,
  };
}

import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { isActiveMatchUp } from '@Query/matchUp/activeMatchUp';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { numericSort } from '@Tools/sorting';
import { unique } from '@Tools/arrays';

// constants and types
import { INVALID_DRAW_POSITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Structure } from '@Types/tournamentTypes';

// active drawPositions occur in activeMatchUps...
// ...which have a winningSide, a scoreString, or a completed matchUpStatus

type GetStructureDrawPositionProfilesArgs = {
  drawDefinition: DrawDefinition;
  findContainer?: boolean;
  structure?: Structure;
  structureId?: string;
  event?: Event;
};
export function getStructureDrawPositionProfiles(params: GetStructureDrawPositionProfilesArgs): { [key: string]: any } {
  const { drawDefinition, findContainer, structureId, event } = params;
  let structure = params.structure;

  const { containedStructures } = getContainedStructures({ drawDefinition });
  const containedStructureIds = structureId ? containedStructures[structureId] ?? [] : [];
  const matchUpFilters = { isCollectionMatchUp: false };

  if (!structure) {
    const result = findStructure({ drawDefinition, structureId });
    if (result.error) return result;

    structure = findContainer ? (result.containingStructure ?? result.structure) : result.structure;
  }

  if (isAdHoc({ structure })) {
    return { structure, isAdHoc: true, error: INVALID_DRAW_POSITION };
  }

  // must use all draw matchUps to get active matchUps across all connected structures
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    inContext: true,
    matchUpFilters,
    drawDefinition,
    event,
  });

  const inContextStructureMatchUps = inContextDrawMatchUps?.filter(
    (matchUp) => matchUp.structureId === structureId || containedStructureIds.includes(matchUp.structureId),
  );

  // get a mapping of all matchUpIds to dependent matchUpIds
  const { matchUpDependencies } = getMatchUpDependencies({
    drawIds: [drawDefinition.drawId],
    matchUps: inContextDrawMatchUps,
    drawDefinition,
  });

  const activeDependentMatchUpIdsCollection: string[] = [];
  const drawPositionsCollection: number[] = [];
  const drawPositionInitialRounds = {};
  const activeMatchUps: any[] = [];

  for (const matchUp of inContextDrawMatchUps ?? []) {
    if (matchUp.structureId === structureId || containedStructureIds.includes(matchUp.structureId)) {
      drawPositionsCollection.push(...(matchUp.drawPositions ?? []));

      const roundNumber = matchUp.roundNumber;
      for (const drawPosition of (matchUp.drawPositions ?? []).filter(Boolean)) {
        if (
          !drawPositionInitialRounds[drawPosition] ||
          (roundNumber && drawPositionInitialRounds[drawPosition] > roundNumber)
        ) {
          drawPositionInitialRounds[drawPosition] = roundNumber;
        }
      }
    }

    if (isActiveMatchUp(matchUp)) {
      activeMatchUps.push(matchUp);
      activeDependentMatchUpIdsCollection.push(
        matchUp.matchUpId,
        ...(matchUpDependencies?.[matchUp?.matchUpId]?.matchUpIds ?? []),
      );
    }
  }

  // sorted drawPositions for the structure
  const drawPositions = unique(drawPositionsCollection.filter(Boolean)).sort(numericSort);

  const activeDependentMatchUpIds = unique(activeDependentMatchUpIdsCollection);

  const activeDrawPositions = unique(
    inContextStructureMatchUps
      ?.map(({ matchUpId, drawPositions }) => (activeDependentMatchUpIds.includes(matchUpId) ? drawPositions : []))
      .flat()
      .filter(Boolean),
  ).sort(numericSort);

  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structure,
  });

  // determine which positions are BYEs
  const byeDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map((assignment) => assignment.drawPosition);

  // determine which positions are Qualifiers
  const qualifyingDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.qualifier)
    .map((assignment) => assignment.drawPosition);

  const inactiveDrawPositions =
    drawPositions?.filter((drawPosition) => !activeDrawPositions.includes(drawPosition)) ?? [];

  return {
    allDrawPositions: drawPositions,
    inContextStructureMatchUps,
    drawPositionInitialRounds,
    activeDependentMatchUpIds,
    qualifyingDrawPositions,
    inactiveDrawPositions,
    positionAssignments,
    activeDrawPositions,
    byeDrawPositions,
    activeMatchUps,
    structure,
  };
}

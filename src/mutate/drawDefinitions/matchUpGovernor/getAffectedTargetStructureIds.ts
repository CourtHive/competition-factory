import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getStructureLinks } from '@Query/drawDefinition/linkGetter';
import { findExtension } from '@Acquire/findExtension';
import { overlap } from '@Tools/arrays';

import { TALLY } from '@Constants/extensionConstants';
import { DrawDefinition, MatchUp, Structure } from '@Types/tournamentTypes';

/**
 * Finds all structureIds which are affected by an outcome change in a completed structure
 * Is specific to Round Robins which direct participants by WIN_RATIO
 */

type GetAffectedTargetStructureIds = {
  drawDefinition: DrawDefinition;
  structure: Structure;
  matchUp: MatchUp;
};

export function getAffectedTargetStructureIds({ drawDefinition, structure, matchUp }: GetAffectedTargetStructureIds) {
  const { drawPositions } = matchUp;
  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structure,
  });

  const relevantAssignments = positionAssignments?.filter(({ drawPosition }) => drawPositions?.includes(drawPosition));

  const finishingPositions = relevantAssignments?.map((assignment) => {
    const { extension } = findExtension({ element: assignment, name: TALLY });
    return extension?.value?.groupOrder;
  });

  const { containerStructures } = getContainedStructures({ drawDefinition });
  const structureId = containerStructures[structure.structureId];

  const links = getStructureLinks({
    drawDefinition,
    structureId,
  })?.links?.source;

  const structureIds = links
    ?.filter((link) => {
      return overlap(finishingPositions, link.source?.finishingPositions ?? []);
    })
    .map((link) => link.source.structureId);

  return { structureIds };
}

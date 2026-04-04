import { getStructureLinks } from '../drawDefinition/linkGetter';
import { DrawDefinition } from '@Types/tournamentTypes';
import { findStructure } from '@Acquire/findStructure';

type GetSourceStructureDetailArgs = {
  drawDefinition: DrawDefinition;
  finishingPosition?: string;
  targetRoundNumber: number;
  structureId: string;
  linkType: string;
};
export function getSourceStructureIdsAndRelevantLinks({
  targetRoundNumber,
  finishingPosition,
  drawDefinition,
  structureId, // structure for which source and target links are to be found
  linkType, // only return links which match linkType
}: GetSourceStructureDetailArgs) {
  const { links } =
    getStructureLinks({
      drawDefinition,
      structureId,
    }) ?? {};

  const sourceLinks = (links?.target ?? [])
    .filter(({ linkType: structureLinkType }) => structureLinkType === linkType)
    // if a target roundNumber is provided, only consider structures with link target matching roundNumber
    .filter(({ target }) => !targetRoundNumber || targetRoundNumber === target.roundNumber);

  const relevantLinks = sourceLinks
    .map((link) => {
      const sourceStructureId = link.source.structureId;
      const { structure: sourceStructure } = findStructure({
        structureId: sourceStructureId,
        drawDefinition,
      });

      // if finishingPosition has been specified and does not match, ignore link
      if (finishingPosition && sourceStructure?.finishingPosition !== finishingPosition) return undefined;
      return link;
    })
    .filter(Boolean);

  const sourceStructureIds = relevantLinks.map(({ source }) => source.structureId);

  return { sourceStructureIds, relevantLinks };
}

import { isRoundWinnerLink, traversesByFinishingPosition } from '@Query/drawDefinition/linkTraversal';
import { getStructureLinks } from '@Query/drawDefinition/linkGetter';
import { DrawDefinition, DrawLink } from '@Types/tournamentTypes';
import { findStructure } from '@Acquire/findStructure';

// constants
import { POSITION, WINNER } from '@Constants/drawDefinitionConstants';

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

  // a link out of a round robin traverses by finishing position whether it is labelled POSITION or WINNER, and only a
  // link that traverses by round carries the WINNERs of a round (linkTraversal.ts)
  const ofLinkType = (link: DrawLink) => {
    if (linkType === POSITION) return traversesByFinishingPosition(link, drawDefinition);
    if (linkType === WINNER) return isRoundWinnerLink(link, drawDefinition);
    return link.linkType === linkType;
  };
  const sourceLinks = (links?.target ?? [])
    .filter(ofLinkType)
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

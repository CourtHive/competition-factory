// Query
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';

// Acquire
import { findStructure } from '@Acquire/findStructure';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { CONTAINER, QUALIFYING } from '@Constants/drawDefinitionConstants';

// types
import type { DrawDefinition, DrawLink, Structure } from '@Types/tournamentTypes';

type GetQualifiersCountArgs = {
  provisionalPositioning?: boolean;
  drawDefinition: DrawDefinition;
  stageSequence?: number;
  structureId?: string;
  stage?: string;
};

type GetLinkQualifiersCountArgs = {
  provisionalPositioning?: boolean;
  drawDefinition: DrawDefinition;
  sourceStructure?: Structure; // when the source is not (yet) in drawDefinition.structures
  link: DrawLink;
};

/**
 * How many participants a link delivers into its target round, when its source is a QUALIFYING
 * structure: a round robin sends groups x finishingPositions, a placeholder (source round 0) its
 * recorded qualifyingPositions, an elimination structure one per matchUp of its exit round.
 * Returns 0 for a link whose source is not QUALIFYING.
 */
export function getLinkQualifiersCount({
  provisionalPositioning,
  sourceStructure,
  drawDefinition,
  link,
}: GetLinkQualifiersCountArgs): number {
  const structure =
    sourceStructure ?? findStructure({ structureId: link.source.structureId, drawDefinition })?.structure;
  if (structure?.stage !== QUALIFYING) return 0;

  const sourceRoundNumber: number = link.source.roundNumber as number;
  if (structure.structureType === CONTAINER) {
    const groupCount = structure.structures?.length ?? 0;
    const finishingPositionsCount = link.source.finishingPositions?.length ?? 0;
    return groupCount * finishingPositionsCount;
  }
  if (sourceRoundNumber === 0 && link.source.qualifyingPositions) {
    // Placeholder link: use the stored qualifyingPositions count
    return link.source.qualifyingPositions;
  }
  const matchUps = getAllStructureMatchUps({
    matchUpFilters: { roundNumbers: [sourceRoundNumber] },
    afterRecoveryTimes: false,
    provisionalPositioning,
    inContext: false,
    structure,
  }).matchUps;
  return matchUps?.length || 0;
}

function calculateQualifiersFromLinks({
  relevantLinks,
  drawDefinition,
  provisionalPositioning,
  roundQualifiersCounts,
}: {
  relevantLinks: DrawLink[];
  drawDefinition: DrawDefinition;
  provisionalPositioning?: boolean;
  roundQualifiersCounts: Record<string, number>;
}) {
  let qualifiersCount = 0;

  for (const relevantLink of relevantLinks) {
    const count = getLinkQualifiersCount({ provisionalPositioning, drawDefinition, link: relevantLink });
    if (!count) continue;
    const roundTarget = relevantLink.target.roundNumber;
    if (!roundQualifiersCounts[roundTarget]) roundQualifiersCounts[roundTarget] = 0;
    roundQualifiersCounts[roundTarget] += count;
    qualifiersCount += count;
  }

  return qualifiersCount;
}

export function getQualifiersCount(params: GetQualifiersCountArgs) {
  const { provisionalPositioning, drawDefinition, structureId } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const roundQualifiersCounts: Record<string, number> = {};

  if (!structureId) return { qualifiersCount: 0, roundQualifiersCounts };

  const { structure } = findStructure({ drawDefinition, structureId });
  const relevantLinks = drawDefinition.links?.filter((link) => link?.target?.structureId === structure?.structureId);

  let qualifiersCount = 0;

  if (relevantLinks?.length) {
    qualifiersCount = calculateQualifiersFromLinks({
      relevantLinks,
      drawDefinition,
      provisionalPositioning,
      roundQualifiersCounts,
    });
  }

  return { qualifiersCount, roundQualifiersCounts };
}

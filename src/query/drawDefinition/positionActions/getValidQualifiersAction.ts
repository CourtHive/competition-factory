import { getSourceStructureIdsAndRelevantLinks } from '@Query/structure/getSourceStructureIdsAndRelevantLinks';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { definedAttributes } from '@Tools/definedAttributes';

// constants and types
import { QUALIFYING_PARTICIPANT, QUALIFYING_PARTICIPANT_METHOD } from '@Constants/positionActionConstants';
import { POSITION, QUALIFYING, WINNER } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import { HydratedParticipant } from '@Types/hydrated';

export function getValidQualifiersAction({
  drawPositionInitialRounds,
  tournamentParticipants,
  positionAssignments,
  returnParticipants,
  appliedPolicies,
  drawDefinition,
  drawPosition,
  structureId,
  drawId,
}) {
  const qualifyingParticipants: HydratedParticipant[] = [];
  const qualifyingParticipantIds: string[] = [];
  const validAssignmentActions: any[] = [];
  const sourceStructureIds: string[] = [];

  const assignedParticipantIds = new Set(
    positionAssignments.map((assignment) => assignment.participantId).filter(Boolean),
  );

  const policy = appliedPolicies?.[POLICY_TYPE_POSITION_ACTIONS];

  const targetRoundNumber = !policy?.disableRoundRestrictions && drawPositionInitialRounds[drawPosition];

  const requireCompletedStructures = policy?.requireCompletedStructures;

  const { sourceStructureIds: eliminationSourceStructureIds, relevantLinks: eliminationSourceLinks } =
    getSourceStructureIdsAndRelevantLinks({
      targetRoundNumber,
      linkType: WINNER,
      drawDefinition,
      structureId,
    }) ?? {};
  if (eliminationSourceStructureIds?.length) sourceStructureIds.push(...eliminationSourceStructureIds);

  const { sourceStructureIds: roundRobinSourceStructureIds, relevantLinks: roundRobinSourceLinks } =
    getSourceStructureIdsAndRelevantLinks({
      targetRoundNumber,
      linkType: POSITION,
      drawDefinition,
      structureId,
    }) ?? {};
  if (roundRobinSourceStructureIds?.length) sourceStructureIds.push(...roundRobinSourceStructureIds);

  collectEliminationQualifiers({
    requireCompletedStructures,
    tournamentParticipants,
    assignedParticipantIds,
    eliminationSourceLinks,
    qualifyingParticipantIds,
    qualifyingParticipants,
    returnParticipants,
    drawDefinition,
  });

  collectRoundRobinQualifiers({
    requireCompletedStructures,
    tournamentParticipants,
    assignedParticipantIds,
    qualifyingParticipantIds,
    qualifyingParticipants,
    roundRobinSourceLinks,
    returnParticipants,
    drawDefinition,
  });

  if (qualifyingParticipantIds.length) {
    validAssignmentActions.push(
      definedAttributes({
        qualifyingParticipants: returnParticipants ? qualifyingParticipants : undefined,
        method: QUALIFYING_PARTICIPANT_METHOD,
        type: QUALIFYING_PARTICIPANT,
        qualifyingParticipantIds,
        payload: {
          qualifyingParticipantId: undefined,
          drawPosition,
          structureId,
          drawId,
        },
      }),
    );
  }

  return { validAssignmentActions, sourceStructureIds };
}

function collectEliminationQualifiers({
  requireCompletedStructures,
  tournamentParticipants,
  assignedParticipantIds,
  eliminationSourceLinks,
  qualifyingParticipantIds,
  qualifyingParticipants,
  returnParticipants,
  drawDefinition,
}) {
  for (const sourceLink of eliminationSourceLinks) {
    const structure = drawDefinition.structures?.find(
      (structure) => structure.structureId === sourceLink.source.structureId,
    );
    if (structure?.stage !== QUALIFYING) continue;

    const structureCompleted = isCompletedStructure({
      structureId: sourceLink.source.structureId,
      drawDefinition,
    });

    if (requireCompletedStructures && !structureCompleted) continue;

    const qualifyingRoundNumber = structure.qualifyingRoundNumber;
    const { matchUps } = getAllStructureMatchUps({
      matchUpFilters: {
        roundNumbers: [qualifyingRoundNumber],
        isCollectionMatchUp: false,
        hasWinningSide: true,
      },
      afterRecoveryTimes: false,
      tournamentParticipants,
      inContext: true,
      structure,
    });

    for (const matchUp of matchUps) {
      const winningSide = matchUp.sides.find((side) => side?.sideNumber === matchUp.winningSide);
      const relevantSide = matchUp.matchUpStatus === BYE && matchUp.sides?.find(({ participantId }) => participantId);

      if (winningSide || relevantSide) {
        const { participantId, participant } = winningSide || (relevantSide ?? {});
        if (participantId && !assignedParticipantIds.has(participantId)) {
          if (participant && returnParticipants) qualifyingParticipants.push(participant);
          qualifyingParticipantIds.push(participantId);
        }
      }
    }
  }
}

function collectRoundRobinQualifiers({
  requireCompletedStructures,
  tournamentParticipants,
  assignedParticipantIds,
  qualifyingParticipantIds,
  qualifyingParticipants,
  roundRobinSourceLinks,
  returnParticipants,
  drawDefinition,
}) {
  for (const sourceLink of roundRobinSourceLinks) {
    const structure = drawDefinition.structures?.find(
      (structure) => structure.structureId === sourceLink.source.structureId,
    );
    if (structure?.stage !== QUALIFYING) continue;

    const structureCompleted = isCompletedStructure({
      structureId: sourceLink.source.structureId,
      drawDefinition,
    });

    if (requireCompletedStructures && !structureCompleted) continue;

    const { positionAssignments } = getPositionAssignments({ structure });
    const relevantParticipantIds: any =
      positionAssignments
        ?.map((assignment) => {
          const participantId = assignment.participantId;
          const results = firstClassOrExtension({
            element: assignment,
            attribute: 'tally',
            name: TALLY,
          });

          return results ? { participantId, groupOrder: results?.groupOrder } : {};
        })
        .filter(({ groupOrder, participantId }) => groupOrder === 1 && !assignedParticipantIds.has(participantId))
        .map(({ participantId }) => participantId) ?? [];

    if (relevantParticipantIds) qualifyingParticipantIds.push(...relevantParticipantIds);

    if (returnParticipants) {
      const relevantParticipantIdSet = new Set(relevantParticipantIds);
      const relevantParticipants = tournamentParticipants.filter(({ participantId }) =>
        relevantParticipantIdSet.has(participantId),
      );
      qualifyingParticipants.push(...relevantParticipants);
    }
  }
}

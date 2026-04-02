import { getSourceStructureIdsAndRelevantLinks } from '@Query/structure/getSourceStructureIdsAndRelevantLinks';
import { getPositionAssignments, structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { qualifierDrawPositionAssignment } from '@Mutate/matchUps/drawPositions/positionQualifier';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { decorateResult } from '@Functions/global/decorateResult';
import { mapNumbersToIndexes } from '@Tools/mapNumbersToIndexes';
import { definedAttributes } from '@Tools/definedAttributes';
import { findExtension } from '@Acquire/findExtension';
import { ResultType } from '@Types/factoryTypes';
import { generateRange } from '@Tools/arrays';

// Constants and Types
import { DRAW_DEFINITION, EVENT, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MAIN, POSITION, QUALIFYING, WINNER } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, Event, PositionAssignment, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_MAIN_STRUCTURE,
  MISSING_QUALIFIED_PARTICIPANTS,
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
} from '@Constants/errorConditionConstants';

interface QualifierProgressionArgs {
  drawDefinition: DrawDefinition;
  tournamentRecord: Tournament;
  targetRoundNumber?: number;
  event: Event;
  randomList?: number[];
}

export function qualifierProgression({
  targetRoundNumber = 1,
  tournamentRecord,
  drawDefinition,
  event,
  randomList,
}: QualifierProgressionArgs): ResultType {
  const paramsCheck = checkRequiredParameters({ drawDefinition, event, tournamentRecord }, [
    { [DRAW_DEFINITION]: true, [EVENT]: true, [TOURNAMENT_RECORD]: true },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const assignedParticipants: { participantId: string; drawPosition: number }[] = [];
  const qualifyingParticipantIds: string[] = [];

  const mainStructure = drawDefinition.structures?.find(
    (structure) => structure.stage === MAIN && structure.stageSequence === 1,
  );

  if (!mainStructure) return decorateResult({ result: { error: MISSING_MAIN_STRUCTURE } });

  const appliedPolicies =
    getAppliedPolicies({ tournamentRecord, drawDefinition, structure: mainStructure, event }).appliedPolicies ?? {};

  const policy = appliedPolicies[POLICY_TYPE_POSITION_ACTIONS];
  const requireCompletedStructures = policy?.requireCompletedStructures;

  const {
    qualifierPositions,
    positionAssignments,
  }: {
    qualifierPositions: { drawPosition: number; qualifier: boolean }[];
    positionAssignments: PositionAssignment[];
  } = structureAssignedDrawPositions({ structure: mainStructure });

  if (!qualifierPositions.length)
    return decorateResult({ result: { error: NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS } });

  let qualifierPositionIndexes = generateRange(0, qualifierPositions.length);

  if (randomList) {
    qualifierPositionIndexes = mapNumbersToIndexes(qualifierPositionIndexes, randomList);
  }

  const assignedParticipantIds = positionAssignments.map((assignment) => assignment.participantId).filter(Boolean);

  const { relevantLinks: eliminationSourceLinks } =
    getSourceStructureIdsAndRelevantLinks({
      structureId: mainStructure.structureId,
      targetRoundNumber,
      linkType: WINNER, // WINNER of qualifying structures will traverse link
      drawDefinition,
    }) || {};

  const { relevantLinks: roundRobinSourceLinks } =
    getSourceStructureIdsAndRelevantLinks({
      structureId: mainStructure.structureId,
      targetRoundNumber,
      linkType: POSITION, // link will define how many finishingPositions traverse the link
      drawDefinition,
    }) || {};

  collectEliminationQualifiers({
    eliminationSourceLinks,
    requireCompletedStructures,
    assignedParticipantIds,
    qualifyingParticipantIds,
    drawDefinition,
  });

  collectRoundRobinQualifiers({
    roundRobinSourceLinks,
    assignedParticipantIds,
    qualifyingParticipantIds,
    drawDefinition,
  });

  if (!qualifyingParticipantIds.length) return decorateResult({ result: { error: MISSING_QUALIFIED_PARTICIPANTS } });

  qualifierPositionIndexes.forEach((positionIndex, index) => {
    const participantToAssign = qualifyingParticipantIds[index];
    const drawPosition = qualifierPositions[positionIndex].drawPosition;
    if (participantToAssign) {
      const positionAssignmentResult: ResultType = qualifierDrawPositionAssignment({
        qualifyingParticipantId: participantToAssign,
        structureId: mainStructure.structureId,
        drawPosition,
        tournamentRecord,
        drawDefinition,
      });

      positionAssignmentResult?.success &&
        assignedParticipants.push({ participantId: participantToAssign, drawPosition });
    }
  });

  return decorateResult({
    result: definedAttributes({ ...SUCCESS, assignedParticipants }),
  });
}

function collectEliminationQualifiers({
  eliminationSourceLinks,
  requireCompletedStructures,
  assignedParticipantIds,
  qualifyingParticipantIds,
  drawDefinition,
}) {
  for (const sourceLink of eliminationSourceLinks) {
    const structure = drawDefinition.structures?.find(
      (structure) => structure.structureId === sourceLink.source.structureId,
    );
    if (structure?.stage !== QUALIFYING) continue;

    const structureCompleted = isCompletedStructure({ structureId: sourceLink.source.structureId, drawDefinition });
    if (requireCompletedStructures && !structureCompleted) continue;

    const qualifyingRoundNumber = structure.qualifyingRoundNumber;
    const { matchUps } = getAllStructureMatchUps({
      matchUpFilters: {
        ...(qualifyingRoundNumber && { roundNumbers: [qualifyingRoundNumber] }),
        isCollectionMatchUp: false,
        hasWinningSide: true,
      },
      afterRecoveryTimes: false,
      inContext: true,
      structure,
    });

    for (const matchUp of matchUps) {
      const relevantSide = matchUp.matchUpStatus === BYE && matchUp.sides?.find(({ participantId }) => participantId);
      const winningSide = matchUp.sides.find((side) => side?.sideNumber === matchUp.winningSide);

      if (winningSide || relevantSide) {
        const { participantId } = winningSide || relevantSide || {};
        if (participantId && !assignedParticipantIds.includes(participantId)) {
          qualifyingParticipantIds.push(participantId);
        }
      }
    }
  }
}

function collectRoundRobinQualifiers({
  roundRobinSourceLinks,
  assignedParticipantIds,
  qualifyingParticipantIds,
  drawDefinition,
}) {
  for (const sourceLink of roundRobinSourceLinks) {
    const structure = drawDefinition?.structures?.find(
      (structure) => structure.structureId === sourceLink.source.structureId,
    );
    if (structure?.stage !== QUALIFYING) continue;

    const structureCompleted = isCompletedStructure({
      structureId: sourceLink.source.structureId,
      drawDefinition,
    });
    if (!structureCompleted) continue;

    const { positionAssignments } = getPositionAssignments({ structure });
    const relevantParticipantIds: any =
      positionAssignments
        ?.map((assignment) => {
          const participantId = assignment.participantId;
          const results = findExtension({ element: assignment, name: TALLY }).extension?.value;
          return results ? { participantId, groupOrder: results?.groupOrder } : {};
        })
        .filter(
          ({ groupOrder, participantId }) => groupOrder === 1 && !assignedParticipantIds.includes(participantId),
        )
        .map(({ participantId }) => participantId) ?? [];

    if (relevantParticipantIds) qualifyingParticipantIds.push(...relevantParticipantIds);
  }
}

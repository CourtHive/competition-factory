import { modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isActiveDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { findStructure } from '@Acquire/findStructure';
import { randomMember } from '@Tools/arrays';

// constants and types
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DRAW } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

export function placeQualifier(params): ResultType & { qualifierPlaced?: boolean } {
  const { inContextDrawMatchUps, inContextMatchUp, drawDefinition, winningSide, random } = params;
  const winnerTargetLink = params.targetData.targetLinks?.winnerTargetLink;

  if (winnerTargetLink.target.feedProfile !== DRAW) {
    return { ...SUCCESS, qualifierPlaced: undefined };
  }

  const winningQualifierId = inContextMatchUp.sides.find(
    ({ sideNumber }) => sideNumber === winningSide,
  )?.participantId;

  const mainDrawTargetMatchUp = findMainDrawTarget({
    inContextDrawMatchUps,
    winnerTargetLink,
    random,
  });

  if (mainDrawTargetMatchUp?.matchUpStatus !== TO_BE_PLAYED) {
    return { ...SUCCESS, qualifierPlaced: undefined };
  }

  const targetData = positionTargets({
    matchUpId: mainDrawTargetMatchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });

  if (isActiveDownstream({ inContextDrawMatchUps, drawDefinition, targetData })) {
    return { ...SUCCESS, qualifierPlaced: undefined };
  }

  return assignQualifierToPosition({
    mainDrawTargetMatchUp,
    winningQualifierId,
    drawDefinition,
    params,
  });
}

function findMainDrawTarget({ inContextDrawMatchUps, winnerTargetLink, random }) {
  const mainDrawQualifierMatchUps = inContextDrawMatchUps.filter(
    (m) =>
      m.structureId === winnerTargetLink.target.structureId &&
      m.roundNumber === winnerTargetLink.target.roundNumber &&
      m.sides.some(({ participantId, qualifier }) => qualifier && !participantId),
  );
  return randomMember(mainDrawQualifierMatchUps, random);
}

function assignQualifierToPosition({
  mainDrawTargetMatchUp,
  winningQualifierId,
  drawDefinition,
  params,
}): ResultType & { qualifierPlaced?: boolean } {
  const targetDrawPosition = mainDrawTargetMatchUp.sides.find(
    (side) => side.qualifier && !side.participantId,
  )?.drawPosition;

  const { structure } = findStructure({
    structureId: mainDrawTargetMatchUp.structureId,
    drawDefinition,
  });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const positionAssignments = getPositionAssignments({ structure }).positionAssignments;
  let qualifierPlaced;

  for (const positionAssignment of positionAssignments ?? []) {
    if (positionAssignment.drawPosition === targetDrawPosition && !positionAssignment.participantId) {
      positionAssignment.participantId = winningQualifierId;
      updateStructureAssignments(structure, positionAssignments);

      modifyPositionAssignmentsNotice({
        tournamentId: params.tournamentRecord?.tournamentId,
        event: params.event,
        drawDefinition,
        structure,
      });
      qualifierPlaced = true;
    }
  }

  return { ...SUCCESS, qualifierPlaced };
}

function updateStructureAssignments(structure, positionAssignments) {
  if (structure.positionAssignments) {
    structure.positionAssignments = positionAssignments;
  } else if (structure.structures) {
    const assignmentMap = Object.assign(
      {},
      ...(positionAssignments ?? []).map((assignment) => ({
        [assignment.drawPosition]: assignment.participantId,
      })),
    );
    for (const subStructure of structure.structures) {
      subStructure.positionAssignments?.forEach(
        (assignment) => (assignment.participantId = assignmentMap[assignment.drawPosition]),
      );
    }
  }
}

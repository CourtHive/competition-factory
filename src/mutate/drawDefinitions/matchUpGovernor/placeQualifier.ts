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
  let qualifierPlaced;
  const { inContextDrawMatchUps, inContextMatchUp, drawDefinition, winningSide, random } = params;

  const winnerTargetLink = params.targetData.targetLinks?.winnerTargetLink;

  if (winnerTargetLink.target.feedProfile === DRAW) {
    const winningQualifierId = inContextMatchUp.sides.find(
      ({ sideNumber }) => sideNumber === winningSide,
    )?.participantId;

    const mainDrawQualifierMatchUps = inContextDrawMatchUps.filter(
      (m) =>
        m.structureId === winnerTargetLink.target.structureId &&
        m.roundNumber === winnerTargetLink.target.roundNumber &&
        m.sides.some(({ participantId, qualifier }) => qualifier && !participantId),
    );
    const mainDrawTargetMatchUp = randomMember(mainDrawQualifierMatchUps, random);
    if (mainDrawTargetMatchUp?.matchUpStatus === TO_BE_PLAYED) {
      const targetData = positionTargets({
        matchUpId: mainDrawTargetMatchUp.matchUpId,
        inContextDrawMatchUps,
        drawDefinition,
      });
      const activeDownstream = isActiveDownstream({
        inContextDrawMatchUps,
        drawDefinition,
        targetData,
      });
      if (!activeDownstream) {
        const targetDrawPosition = mainDrawTargetMatchUp.sides.find(
          (side) => side.qualifier && !side.participantId,
        )?.drawPosition;
        const { structure } = findStructure({
          structureId: mainDrawTargetMatchUp.structureId,
          drawDefinition,
        });
        if (!structure) return { error: STRUCTURE_NOT_FOUND };
        const positionAssignments = getPositionAssignments({
          structure,
        }).positionAssignments;

        for (const positionAssignment of positionAssignments || []) {
          if (positionAssignment.drawPosition === targetDrawPosition && !positionAssignment.participantId) {
            positionAssignment.participantId = winningQualifierId;

            // update positionAssignments on structure
            if (structure.positionAssignments) {
              structure.positionAssignments = positionAssignments;
            } else if (structure.structures) {
              const assignmentMap = Object.assign(
                {},
                ...(positionAssignments || []).map((assignment) => ({
                  [assignment.drawPosition]: assignment.participantId,
                })),
              );
              for (const subStructure of structure.structures) {
                subStructure.positionAssignments?.forEach(
                  (assignment) => (assignment.participantId = assignmentMap[assignment.drawPosition]),
                );
              }
            }

            modifyPositionAssignmentsNotice({
              tournamentId: params.tournamentRecord?.tournamentId,
              event: params.event,
              drawDefinition,
              structure,
            });
            qualifierPlaced = true;
          }
        }
      }
    }
  }

  return { ...SUCCESS, qualifierPlaced };
}

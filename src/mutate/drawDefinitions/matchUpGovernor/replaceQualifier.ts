import { modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { getTargetsDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DRAW } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

export function replaceQualifier(params): ResultType & { qualifierReplaced?: boolean } {
  let qualifierReplaced;
  const { inContextDrawMatchUps, inContextMatchUp, drawDefinition, winningSide } = params;

  const winnerTargetLink = params.targetData.targetLinks?.winnerTargetLink;

  // a qualifying structure that does not feed the main DRAW has nothing to change there
  if (winnerTargetLink.target.feedProfile !== DRAW) return { ...SUCCESS, qualifierReplaced };

  const previousWinningParticipantId = inContextMatchUp.sides.find(
    ({ sideNumber }) => sideNumber !== winningSide,
  ).participantId;
  const mainDrawTargetMatchUp = inContextDrawMatchUps.find(
    (m) =>
      m.structureId === winnerTargetLink.target.structureId &&
      m.roundNumber === winnerTargetLink.target.roundNumber &&
      m.sides.some(({ participantId }) => participantId === previousWinningParticipantId),
  );
  if (mainDrawTargetMatchUp?.matchUpStatus === TO_BE_PLAYED) {
    // prevoius winningSide participant was placed in MAIN
    const downstream = getTargetsDownstream({
      matchUpId: mainDrawTargetMatchUp.matchUpId,
      inContextDrawMatchUps,
      drawDefinition,
    });
    if (downstream.error) return decorateResult({ result: downstream, stack: 'replaceQualifier' });
    if (!downstream.activeDownstream) {
      const { structure } = findStructure({
        structureId: mainDrawTargetMatchUp.structureId,
        drawDefinition,
      });
      const positionAssignments = getPositionAssignments({
        structure,
      }).positionAssignments;
      for (const positionAssignment of positionAssignments ?? []) {
        if (positionAssignment.participantId === previousWinningParticipantId) {
          const newWinningParticipantId = inContextMatchUp.sides.find(
            ({ sideNumber }) => sideNumber === winningSide,
          ).participantId;
          positionAssignment.participantId = newWinningParticipantId;

          // update positionAssignments on structure
          if (structure && 'positionAssignments' in structure && structure.positionAssignments) {
            structure.positionAssignments = positionAssignments;
          } else if (structuresOf(structure)) {
            const assignmentMap = Object.assign(
              {},
              ...(positionAssignments ?? []).map((assignment) => ({
                [assignment.drawPosition]: assignment.participantId,
              })),
            );
            for (const subStructure of structuresOf(structure) ?? []) {
              positionAssignmentsOf(subStructure)?.forEach(
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
          qualifierReplaced = true;
        }
      }
    }
  }

  return { ...SUCCESS, qualifierReplaced };
}

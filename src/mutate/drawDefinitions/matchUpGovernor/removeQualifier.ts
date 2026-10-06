import { modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { getTargetsDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { DRAW } from '@Constants/drawDefinitionConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

type RemoveQualifierArgs = {
  inContextDrawMatchUps: HydratedMatchUp[];
  inContextMatchUp: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  targetData: any;
  event?: Event;
};
export function removeQualifier(params: RemoveQualifierArgs): ResultType & { qualifierRemoved?: boolean } {
  let qualifierRemoved;
  const { inContextDrawMatchUps, inContextMatchUp, drawDefinition } = params;

  const winnerTargetLink = params.targetData.targetLinks?.winnerTargetLink;

  // a qualifying structure that does not feed the main DRAW has nothing to change there
  if (winnerTargetLink?.target?.feedProfile !== DRAW) return { qualifierRemoved };

  const previousWinningParticipantId = inContextMatchUp.sides?.find(
    ({ sideNumber }) => sideNumber === inContextMatchUp.winningSide,
  )?.participantId;
  const mainDrawTargetMatchUp = inContextDrawMatchUps.find(
    (m) =>
      m.structureId === winnerTargetLink.target.structureId &&
      m.roundNumber === winnerTargetLink.target.roundNumber &&
      m.sides?.some(({ participantId }) => participantId === previousWinningParticipantId),
  );
  if (mainDrawTargetMatchUp && mainDrawTargetMatchUp.matchUpStatus === TO_BE_PLAYED) {
    // prevoius winningSide participant was placed in MAIN
    const downstream = getTargetsDownstream({
      matchUpId: mainDrawTargetMatchUp.matchUpId,
      inContextDrawMatchUps,
      drawDefinition,
    });
    if (downstream.error) return decorateResult({ result: downstream, stack: 'removeQualifier' });
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
          positionAssignment.participantId = undefined;

          // update positionAssignments on structure
          if (structure?.positionAssignments) {
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
          qualifierRemoved = true;
        }
      }
    }
  }

  return { qualifierRemoved };
}

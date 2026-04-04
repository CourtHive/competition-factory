import { modifyDrawNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { intersection } from '@Tools/arrays';

// constants
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function setPositionAssignments({
  structurePositionAssignments,
  provisionalPositioning,
  tournamentRecord,
  drawDefinition,
  event,
}: any): any {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!Array.isArray(structurePositionAssignments)) return { error: INVALID_VALUES };

  const stack = 'setPositionAssignments';

  for (const structureAssignments of structurePositionAssignments) {
    const { structureId, positionAssignments } = structureAssignments;
    if (!positionAssignments) continue;

    const result = findStructure({ drawDefinition, structureId });
    if (result.error) return result;
    const structure = result.structure;

    if (!structure) return { error: STRUCTURE_NOT_FOUND };
    const structureDrawPositions = getPositionAssignments({
      structure,
    }).positionAssignments?.map(({ drawPosition }) => drawPosition);

    const submittedDrawPositions = positionAssignments?.map(({ drawPosition }) => drawPosition);

    if (intersection(structureDrawPositions, submittedDrawPositions).length !== structureDrawPositions?.length) {
      return decorateResult({
        result: { error: INVALID_VALUES },
        info: 'drawPositions do not match',
        stack,
      });
    }

    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    });

    for (const assignment of positionAssignments ?? []) {
      const { drawPosition, participantId, bye, qualifier } = assignment;

      if (bye) {
        const result = assignDrawPositionBye({
          tournamentRecord,
          drawDefinition,
          drawPosition,
          matchUpsMap,
          structureId,
          structure,
          event,
        });
        if (result?.error) return result;
      } else if (qualifier) {
        positionAssignments.forEach((assignment) => {
          if (assignment.drawPosition === drawPosition) {
            assignment.qualifier = true;
            delete assignment.participantId;
            delete assignment.bye;
          }
        });
      } else if (participantId) {
        const result = assignDrawPosition({
          provisionalPositioning,
          inContextDrawMatchUps,
          tournamentRecord,
          drawDefinition,
          participantId,
          drawPosition,
          matchUpsMap,
          structureId,
          event,
        });
        if (result?.error) return result;
      }
    }
    modifyPositionAssignmentsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      drawDefinition,
      structure,
      event,
    });
  }

  const structureIds = structurePositionAssignments.map(({ structureId }) => structureId);
  modifyDrawNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    structureIds,
  });

  return { ...SUCCESS };
}

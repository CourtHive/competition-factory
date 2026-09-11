import { updateAssignmentParticipantResults } from '@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults';
import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { SUB_ORDER } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import { TEAM } from '@Constants/matchUpTypes';
import {
  MISSING_DRAW_DEFINITION,
  MISSING_DRAW_POSITION,
  MISSING_STRUCTURE_ID,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 *
 * Used to order ROUND_ROBIN participants when finishingPosition ties cannot be broken algorithmically.
 * Assigns a subOrder value to a participant within a structure by drawPosition.
 */

type SetSubOrderArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId: string;
  subOrder: number;
  event?: Event;
};

export function setSubOrder({
  tournamentRecord,
  drawDefinition,
  drawPosition,
  structureId,
  subOrder,
  event,
}: SetSubOrderArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structureId) return { error: MISSING_STRUCTURE_ID };
  if (!drawPosition) return { error: MISSING_DRAW_POSITION };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  let targetStructure: Structure | undefined = structure;

  if (structure.structures && structure.structureType === CONTAINER) {
    targetStructure = structure.structures?.find((currentStructure) =>
      currentStructure.positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition),
    );
  }

  const positionAssignments = targetStructure?.positionAssignments;

  const assignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);

  if (assignment) {
    setFirstClassOrExtension({
      element: assignment,
      attribute: 'subOrder',
      name: SUB_ORDER,
      value: subOrder,
    });
  }

  const isDualMatchUp =
    event?.eventType === TEAM ||
    drawDefinition.matchUpType === TEAM ||
    (event?.tieFormat ?? drawDefinition?.tieFormat ?? structure?.tieFormat);
  const matchUpFilters = isDualMatchUp && { matchUpTypes: [TEAM] };
  const { matchUps } = getAllStructureMatchUps({
    structure: targetStructure,
    afterRecoveryTimes: false,
    inContext: true,
    matchUpFilters,
    event,
  });
  const matchUpFormat = structure?.matchUpFormat ?? drawDefinition.matchUpFormat;

  updateAssignmentParticipantResults({
    positionAssignments,
    tournamentRecord,
    drawDefinition,
    matchUpFormat,
    matchUps,
    event,
  });

  modifyDrawNotice({ drawDefinition, structureIds: [structureId] });

  return { ...SUCCESS };
}

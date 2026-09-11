import { addPositionActionTelemetry } from '@Mutate/drawDefinitions/positionGovernor/addPositionActionTelemetry';
import { modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { drawPositionFilled } from './drawPositionFilled';
import { findStructure } from '@Acquire/findStructure';
import { isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { MatchUpsMap } from '@Types/factoryTypes';
import {
  DRAW_POSITION_ACTIVE,
  INVALID_DRAW_POSITION,
  MISSING_DRAW_DEFINITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type AssignDrawPositionQualifierArgs = {
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  isPositionAction?: boolean;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  drawPosition: number;
  structureId?: string;
  loserMatchUp?: MatchUp;
  event?: Event;
};

export function assignDrawPositionQualifier({
  isPositionAction,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  loserMatchUp,
  matchUpsMap,
  structureId,
  structure,
  event,
}: AssignDrawPositionQualifierArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structure) ({ structure } = findStructure({ drawDefinition, structureId }));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  if (!structureId) ({ structureId } = structure);

  const stack = 'assignDrawPositionQualifier';
  pushGlobalLog({ method: stack, color: 'cyan', drawPosition });

  matchUpsMap ??= getMatchUpsMap({ drawDefinition });
  const { positionAssignments } = getPositionAssignments({ structure });
  const { activeDrawPositions } = getStructureDrawPositionProfiles({
    drawDefinition,
    structureId,
  });

  const currentAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);

  if (currentAssignment?.qualifier) {
    return { ...SUCCESS };
  }

  //
  const hasPropagatedStatus = !!(
    loserMatchUp &&
    matchUpsMap.drawMatchUps.some((m) => m.loserMatchUpId === loserMatchUp?.matchUpId && isExit(m.matchUpStatus))
  );
  // ################### Check error conditions ######################
  const drawPositionIsActive = activeDrawPositions?.includes(drawPosition);
  if (drawPositionIsActive && !hasPropagatedStatus) {
    return { error: DRAW_POSITION_ACTIVE };
  }

  const positionAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);
  if (!positionAssignment) return { error: INVALID_DRAW_POSITION };

  const { containsQualifier, containsParticipant: assignedParticipantId } = drawPositionFilled(positionAssignment);
  if (containsQualifier) return { ...SUCCESS }; // nothing to be done

  const appliedPolicies =
    getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      event,
    }).appliedPolicies ?? {};

  // modifies the structure's positionAssignments
  // applies to both ELIMINATION and ROUND_ROBIN structures
  positionAssignments?.forEach((assignment) => {
    if (assignment.drawPosition === drawPosition) {
      assignment.qualifier = true;
      //let's clear up the participant from the assignment
      //if it was there because of a propagated exit.
      //this should NEVER be the case for a qualifier position
      if (hasPropagatedStatus) {
        assignment.participantId = undefined;
        pushGlobalLog({
          method: 'assignDrawPositionQualifier',
          issue: 'invalid participantId on qualifier position cleared',
        });
      }
    }
  });

  modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });

  return successNotice({
    assignedParticipantId,
    isPositionAction,
    appliedPolicies,
    drawDefinition,
    drawPosition,
    structureId,
    stack,
  });
}

function successNotice({
  assignedParticipantId,
  isPositionAction,
  appliedPolicies,
  drawDefinition,
  drawPosition,
  structureId,
  stack,
}) {
  if (isPositionAction) {
    const positionAction = {
      removedParticipantId: assignedParticipantId,
      drawPosition,
      structureId,
      name: stack,
    };
    addPositionActionTelemetry({ appliedPolicies, drawDefinition, positionAction });
  }

  return decorateResult({ result: { ...SUCCESS }, stack });
}

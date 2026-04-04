import { conditionallyDisableLinkPositioning } from '@Mutate/drawDefinitions/positionGovernor/conditionallyDisableLinkPositioning';
import { addPositionActionTelemetry } from '@Mutate/drawDefinitions/positionGovernor/addPositionActionTelemetry';
import { modifyDrawNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { removeDrawPositionAssignment } from '@Mutate/drawDefinitions/removeDrawPositionAssignment';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { updateSideLineUp } from '@Mutate/matchUps/lineUps/updateSideLineUp';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { resetLineUps } from '@Mutate/matchUps/lineUps/resetLineUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { SWAP_PARTICIPANT_METHOD } from '@Constants/positionActionConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

export function swapDrawPositionAssignments({ tournamentRecord, drawDefinition, drawPositions, structureId, event }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!structureId) return { error: MISSING_STRUCTURE_ID };
  if (drawPositions?.length !== 2) return { error: INVALID_VALUES, drawPositions };

  const matchUpsMap = getMatchUpsMap({ drawDefinition });

  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    inContext: true,
    drawDefinition,
    matchUpsMap,
  });

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const appliedPolicies =
    getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      event,
    }).appliedPolicies ?? {};

  let result;
  if (structure.structureType === CONTAINER) {
    // { structureType: CONTAINER } indicates that the swap is within a ROUND ROBIN structure
    result = roundRobinSwap({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      drawPositions,
      matchUpsMap,
      structure,
      event,
    });
  } else {
    // if not a CONTAINER then swap occurs within elimination structure
    result = eliminationSwap({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      drawPositions,
      matchUpsMap,
      structure,
      event,
    });
  }

  if (result.error) return result;

  conditionallyDisableLinkPositioning({ structure, drawPositions });
  const positionAction = {
    name: SWAP_PARTICIPANT_METHOD,
    drawPositions,
    structureId,
  };
  addPositionActionTelemetry({ appliedPolicies, drawDefinition, positionAction });

  modifyPositionAssignmentsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    drawDefinition,
    structure,
    event,
  });

  if (event.eventType === TEAM_EVENT) {
    // update side lineUps for drawPositions that were swapped
    const inContextTargetMatchUps = getAllStructureMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
      inContext: true,
      structure,
    }).matchUps.filter((matchUp) =>
      matchUp.drawPositions?.some((drawPosition) => drawPositions.includes(drawPosition)),
    );
    const structureMatchUps = getAllStructureMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
      structure,
    }).matchUps;

    inContextTargetMatchUps.forEach((inContextTargetMatchUp) => {
      (inContextTargetMatchUp.sides ?? []).forEach((inContextSide) => {
        const drawPosition: number = inContextSide?.drawPosition;
        if (drawPositions.includes(drawPosition)) {
          const teamParticipantId = inContextSide.participantId;
          const matchUp = structureMatchUps.find(({ matchUpId }) => matchUpId === inContextTargetMatchUp.matchUpId);
          const drawPositionSideIndex = inContextTargetMatchUp?.sides?.reduce(
            (index, side, i) => (side.drawPosition === drawPosition ? i : index),
            undefined,
          );

          updateSideLineUp({
            inContextTargetMatchUp,
            drawPositionSideIndex,
            teamParticipantId,
            tournamentRecord,
            drawDefinition,
            matchUp,
            event,
          });
        }
      });
    });
  }
  modifyDrawNotice({ drawDefinition, structureIds: [structureId] });

  return { ...SUCCESS };
}

function eliminationSwap({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  drawPositions,
  matchUpsMap,
  structure,
  event,
}) {
  // if not a CONTAINER then swap occurs within elimination structure
  const assignments = structure?.positionAssignments.filter((assignment) =>
    drawPositions?.includes(assignment.drawPosition),
  );

  if (!assignments) {
    return {
      error: INVALID_VALUES,
      structure,
      info: 'Missing positionAssignments',
    };
  }

  // if both positions are BYE no need to do anything
  if (assignments.filter(({ bye }) => bye).length === 2) return { ...SUCCESS };

  // if both positions are qualifier no need to do anything
  if (assignments.filter(({ qualifier }) => qualifier).length === 2) return { ...SUCCESS };

  const isQualifierSwap = assignments.some(({ qualifier }) => qualifier);
  const isByeSwap = assignments.some(({ bye }) => bye);

  if (isByeSwap && !isQualifierSwap) {
    return swapParticipantIdWithBYE({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      assignments,
      matchUpsMap,
      structure,
      event,
    });
  } else {
    return eliminationPosiitonSwap({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      assignments,
      matchUpsMap,
      structure,
      event,
    });
  }
}

function swapParticipantIdWithBYE({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  assignments,
  matchUpsMap,
  structure,
  event,
}) {
  // remove the assignment that has a participantId
  const originalByeAssignment = assignments.find(({ bye }) => bye);
  const originalParticipantIdAssignment = assignments.find(({ participantId }) => participantId);
  const originalByeDrawPosition = originalByeAssignment.drawPosition;
  const { participantId, drawPosition: originalParticipantIdDrawPosition } = originalParticipantIdAssignment;
  const { structureId } = structure;

  // remove both drawPosition assignments
  let result = removeDrawPositionAssignment({
    drawPosition: originalByeDrawPosition,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    structureId,
    matchUpsMap,
  });
  if (result.error) return result;

  result = removeDrawPositionAssignment({
    drawPosition: originalParticipantIdDrawPosition,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    structureId,
    matchUpsMap,
  });
  if (result.error) return result;

  assignDrawPositionBye({
    drawPosition: originalParticipantIdDrawPosition,
    tournamentRecord,
    drawDefinition,
    structureId,
    matchUpsMap,
    event,
  });

  // replace the original byeAssignment with participantId
  result = assignDrawPosition({
    drawPosition: originalByeDrawPosition,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    structureId,
    participantId,
    matchUpsMap,
    event,
  });
  if (result.error) return result;

  return { ...SUCCESS };
}

function eliminationPosiitonSwap({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  assignments,
  matchUpsMap,
  structure,
  event,
}) {
  // preserves order of drawPositions in original positionAssignments array
  // while insuring that all attributes are faithfully copied over and only drawPosition is swapped
  const newAssignments = Object.assign(
    {},
    ...assignments.map((assignment, index) => {
      const { drawPosition } = assignment;
      const newAssignment = { ...assignments[1 - index], drawPosition };
      return { [drawPosition]: newAssignment };
    }),
  );

  structure.positionAssignments = structure.positionAssignments.map(
    (assignment) => newAssignments[assignment.drawPosition] || assignment,
  );

  resetLineUps({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    assignments,
    structure,
    event,
  });

  return { ...SUCCESS };
}

function roundRobinSwap({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  drawPositions,
  matchUpsMap,
  structure,
  event,
}) {
  const assignments = structure.structures?.reduce((assignments, structure) => {
    const structureAssignments = structure?.positionAssignments.filter((assignment) =>
      drawPositions?.includes(assignment.drawPosition),
    );
    if (structureAssignments) assignments.push(...structureAssignments);
    return assignments;
  }, []);

  // if both positions are BYE no need to do anything
  if (assignments.filter(({ bye }) => bye).length === 2) return { ...SUCCESS };

  // if both positions are QUALIFIER no need to do anything
  if (assignments.filter(({ qualifier }) => qualifier).length === 2) return { ...SUCCESS };

  resetLineUps({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    assignments,
    structure,
    event,
  });

  const isQualifierSwap = assignments.some(({ qualifier }) => qualifier);
  const isByeSwap = assignments.some(({ bye }) => bye);

  if (isByeSwap && !isQualifierSwap) {
    swapParticipantIdWithBYE({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      assignments,
      matchUpsMap,
      structure,
      event,
    });
  } else {
    // for Round Robin the positionAssignments are distributed across structures
    // so the strategy of creating a new positionAssignments array won't work
    const originalAssignments = makeDeepCopy(assignments, false, true);
    assignments.forEach((assignment, index) => {
      const newParticipantId = originalAssignments[1 - index].participantId;
      assignment.qualifier = originalAssignments[1 - index].qualifier;
      assignment.participantId = newParticipantId;
    });
  }

  return { ...SUCCESS };
}

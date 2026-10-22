import { conditionallyDisableLinkPositioning } from '@Mutate/drawDefinitions/positionGovernor/conditionallyDisableLinkPositioning';
import { addPositionActionTelemetry } from '@Mutate/drawDefinitions/positionGovernor/addPositionActionTelemetry';
import { modifyDrawNotice, modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { getStructureDrawPositionProfiles } from '@Query/structure/getStructureDrawPositionProfiles';
import { drawPositionAssignmentRefusal } from '@Query/drawDefinition/drawPositionAssignmentRefusal';
import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { removeAssignment } from '@Mutate/drawDefinitions/removeDrawPositionAssignment';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { updateSideLineUp } from '@Mutate/matchUps/lineUps/updateSideLineUp';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { resetLineUps } from '@Mutate/matchUps/lineUps/resetLineUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { composeDrawMutation } from '@Tools/composeThenWrite';
import { findStructure } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { SWAP_PARTICIPANT_METHOD } from '@Constants/positionActionConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  DRAW_POSITION_ACTIVE,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * A seat reserved for a qualifier that no qualifier has filled yet. `qualifier: true` stays on a seat when a
 * qualifier is placed there (it marks the participant as a qualifier, e.g. for a 'Q' beside the name); it is
 * removed when the position is cleared, and it travels with the qualifier when positions are swapped.
 */
function isQualifierPlaceholder({ qualifier, participantId }: { qualifier?: boolean; participantId?: string }) {
  return !!qualifier && !participantId;
}

/**
 * Swaps the occupants of two drawPositions.
 *
 * COMPOSE, THEN WRITE: a swap with a BYE is two removals, a BYE placement and an assignment, and a later step
 * can refuse after the earlier ones wrote. So it is composed on a working copy first and written only if it
 * composed (`composeDrawMutation`): every refusal leaves the stored record as it was.
 */
export function swapDrawPositionAssignments(params) {
  return composeDrawMutation(params, swapAssignments);
}

function swapAssignments({ tournamentRecord, drawDefinition, drawPositions, structureId, event }) {
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
        const drawPosition = inContextSide?.drawPosition;
        if (drawPosition !== undefined && drawPositions.includes(drawPosition)) {
          const teamParticipantId = inContextSide.participantId;
          const matchUp = structureMatchUps.find(({ matchUpId }) => matchUpId === inContextTargetMatchUp.matchUpId)!; // same structure and TEAM filter
          const drawPositionSideIndex = inContextTargetMatchUp?.sides?.reduce<number | undefined>(
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

  // if both positions are unfilled qualifier seats no need to do anything
  if (assignments.filter(isQualifierPlaceholder).length === 2) return { ...SUCCESS };

  // a PLACED qualifier is a participant and swaps as one, keeping its `qualifier` flag (see isQualifierPlaceholder)
  const isQualifierSwap = assignments.some(isQualifierPlaceholder);
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
  // clearing a position removes its `qualifier` flag; a placed qualifier takes it to the seat it moves to
  const { qualifier } = originalParticipantIdAssignment;
  const { structureId } = structure;

  const refusal = byeSwapRefusal({ tournamentRecord, drawDefinition, assignments, structure, event });
  if (refusal) return refusal;

  // remove both drawPosition assignments
  let result = removeAssignment({
    drawPosition: originalByeDrawPosition,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    structureId,
    matchUpsMap,
  });
  if (result.error) return result;

  result = removeAssignment({
    drawPosition: originalParticipantIdDrawPosition,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    structureId,
    matchUpsMap,
  });
  if (result.error) return result;

  result = assignDrawPositionBye({
    drawPosition: originalParticipantIdDrawPosition,
    tournamentRecord,
    drawDefinition,
    structureId,
    matchUpsMap,
    event,
  });
  if (result.error) return result;

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
  if (qualifier) originalByeAssignment.qualifier = true;

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

  // if both positions are unfilled qualifier seats no need to do anything
  if (assignments.filter(isQualifierPlaceholder).length === 2) return { ...SUCCESS };

  const isQualifierSwap = assignments.some(isQualifierPlaceholder);
  const isByeSwap = assignments.some(({ bye }) => bye);

  // asked before resetLineUps, the first write
  const refusal =
    isByeSwap && !isQualifierSwap
      ? byeSwapRefusal({ tournamentRecord, drawDefinition, assignments, structure, event })
      : undefined;
  if (refusal) return refusal;

  resetLineUps({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    assignments,
    structure,
    event,
  });

  if (isByeSwap && !isQualifierSwap) {
    // refused above if it could be refused at all; a failure past that point is still reported
    const result = swapParticipantIdWithBYE({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      assignments,
      matchUpsMap,
      structure,
      event,
    });
    if (result.error) return result;
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

/**
 * What `swapParticipantIdWithBYE` would refuse only after emptying both seats: the participant's seat
 * is active (it cannot be cleared), or the participant cannot be placed on the BYE's seat
 * (`assignDrawPosition`'s refusals — a seed outside its block, chiefly). Asked before the first write.
 * The BYE's own seat is never refused for being active: `clearDrawPosition` exempts a BYE.
 */
function byeSwapRefusal({ tournamentRecord, drawDefinition, assignments, structure, event }): ResultType | undefined {
  const byeAssignment = assignments.find(({ bye }) => bye);
  const participantAssignment = assignments.find(({ participantId }) => participantId);
  if (!byeAssignment || !participantAssignment) return undefined;
  const { structureId } = structure;

  const { activeDrawPositions } = getStructureDrawPositionProfiles({ drawDefinition, structureId });
  if (activeDrawPositions.includes(participantAssignment.drawPosition)) return { error: DRAW_POSITION_ACTIVE };

  return drawPositionAssignmentRefusal({
    vacatedDrawPositions: [participantAssignment.drawPosition],
    participantId: participantAssignment.participantId,
    drawPosition: byeAssignment.drawPosition,
    tournamentRecord,
    drawDefinition,
    structureId,
    event,
  });
}

import { conditionallyDisableLinkPositioning } from '@Mutate/drawDefinitions/positionGovernor/conditionallyDisableLinkPositioning';
import { addPositionActionTelemetry } from '@Mutate/drawDefinitions/positionGovernor/addPositionActionTelemetry';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { assignDrawPosition } from './positionAssignment';
import { findStructure } from '@Acquire/findStructure';
import { clearDrawPosition } from './positionClear';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function positionParticipantAction(params) {
  const {
    participantIdAttributeName = 'participantId',
    isQualifierPosition,
    positionActionName,
    tournamentRecord,
    drawDefinition,
    participantId,
    drawPosition,
    structureId,
    event,
  } = params;

  const stack = 'positionParticipantAction';

  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const appliedPolicies =
    getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      event,
    }).appliedPolicies ?? {};

  let { inContextDrawMatchUps, matchUpsMap } = params;

  if (!matchUpsMap) {
    matchUpsMap = getMatchUpsMap({ drawDefinition });
    Object.assign(params, { matchUpsMap });
  }

  if (!inContextDrawMatchUps) {
    ({ matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    }));
    Object.assign(params, { inContextDrawMatchUps });
  }

  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structureId,
  });
  const positionAssignment = positionAssignments?.find((assignment) => assignment.drawPosition === drawPosition);

  if (positionAssignment?.participantId) {
    const removedParticipantId = positionAssignment.participantId;
    const result = assignDrawPosition({
      inContextDrawMatchUps,
      tournamentRecord,
      drawDefinition,
      participantId,
      drawPosition,
      structureId,
      matchUpsMap,
      event,
    });
    if (!result.success) {
      return decorateResult({ result, stack });
    }
    return successNotice({ appliedPolicies, removedParticipantId });
  }

  const result = clearDrawPosition({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    structureId,
    matchUpsMap,
    event,
  });
  if (result.error) return decorateResult({ result, stack });
  const removedParticipantId = result.participantId;

  const assignResult = assignDrawPosition({
    inContextDrawMatchUps,
    isQualifierPosition,
    tournamentRecord,
    drawDefinition,
    participantId,
    drawPosition,
    structureId,
    matchUpsMap,
    event,
  });
  if (!assignResult.success) return decorateResult({ result: assignResult, stack });

  return successNotice({ appliedPolicies, removedParticipantId });

  function successNotice({ appliedPolicies, removedParticipantId }) {
    const { structure } = findStructure({ drawDefinition, structureId });
    conditionallyDisableLinkPositioning({
      drawPositions: [drawPosition],
      structure,
    });
    const positionAction = {
      [participantIdAttributeName]: participantId,
      name: positionActionName,
      drawPosition,
      structureId,
    };

    addPositionActionTelemetry({ appliedPolicies, drawDefinition, positionAction });

    return decorateResult({
      context: { removedParticipantId },
      result: { ...SUCCESS },
      stack,
    });
  }
}

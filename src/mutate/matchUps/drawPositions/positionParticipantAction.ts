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

  /**
   * A BARE QUALIFIER PLACEHOLDER IS NOT CLEARED BEFORE THE QUALIFIER IS PLACED.
   *
   * The clear exists to withdraw what the seat holds — a BYE, or a participant the branch above
   * did not catch. A seat marked `qualifier` and holding nobody has nothing to withdraw, and
   * clearing it anyway walked `positionClear` over the seat's matchUp, which collapses a matchUp
   * to TO_BE_PLAYED: an exit a director had recorded there — a WALKOVER awarded to the qualifier
   * still to come, the case `exitAwardable` admits by name — was wiped by the arrival of the very
   * qualifier it was awarded to, who then sat in a TO_BE_PLAYED first round instead of advancing.
   * Placing the qualifier first and recording the walkover second kept it. Measured 2026-10-01
   * (assessment G3); `qualifierArrivesIntoStandingExit.test.ts`.
   */
  const placeholderOnly = !!positionAssignment && !positionAssignment.bye && !positionAssignment.participantId;
  const result = placeholderOnly
    ? { ...SUCCESS, participantId: undefined }
    : clearDrawPosition({
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

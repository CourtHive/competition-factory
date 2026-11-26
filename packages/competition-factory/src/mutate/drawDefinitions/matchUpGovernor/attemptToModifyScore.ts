import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { isDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { decorateResult } from '@Functions/global/decorateResult';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { isExit } from '@Validators/isExit';

// constants
import { ABANDONED, CANCELLED, COMPLETED, DEFAULTED, INCOMPLETE, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_ASSIGNMENTS } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

export function attemptToModifyScore(params) {
  const { autoCalcDisabled, matchUpStatus, dualMatchUp } = params;

  const matchUpStatusIsValid =
    isDirectingMatchUpStatus({ matchUpStatus }) ||
    // in the case that CANCELLED or ABANDONED causes TEAM participant to advance
    ([CANCELLED, ABANDONED].includes(matchUpStatus) && dualMatchUp) ||
    autoCalcDisabled;

  const stack = 'attemptToModifyScore';
  const refusal = scoreAssignmentRefusal(params);
  if (refusal) return refusal;

  const removeScore = [WALKOVER].includes(matchUpStatus);

  const updatedMatchUpStatus = matchUpStatusIsValid ? matchUpStatus : (params.winningSide && COMPLETED) || INCOMPLETE;
  const result = modifyMatchUpScore({
    ...params,
    winningSide: params.winningSide,
    // a write here keeps no reason of its own: the call's own reasons are written by the call (`statusReasons`)
    clearsStatusReasons: true,
    matchUpStatus: updatedMatchUpStatus,
    context: stack,
    removeScore,
  });
  return decorateResult({ result, stack });
}

export function scoreAssignmentRefusal(params) {
  const { matchUp, inContextMatchUp, structure, matchUpStatus } = params;
  const participantsCount =
    matchUp?.sides?.map((side) => side.participantId).filter(Boolean).length ||
    inContextMatchUp?.sides?.map((side) => side.participantId).filter(Boolean).length;

  const hasAdHocSides =
    (isAdHoc({ structure }) && participantsCount === 1) || (matchUpStatus === DEFAULTED && participantsCount);
  const validToScore =
    hasAdHocSides ||
    drawPositionsAssignedParticipantIds({ structure, matchUp, inContextMatchUp }) ||
    params.appliedPolicies?.[POLICY_TYPE_SCORING]?.requireParticipantsForScoring === false ||
    // a single exit before the second opponent arrives, whether recorded or carried; checkParticipants has
    // already decided whose side may be awarded it (not a propagateExitStatus question)
    (isExit(matchUpStatus) && participantsCount === 1);
  if (!validToScore) return decorateResult({ result: { error: MISSING_ASSIGNMENTS }, stack: 'attemptToModifyScore' });
  return undefined;
}

function drawPositionsAssignedParticipantIds({ structure, matchUp, inContextMatchUp }) {
  const { drawPositions } = matchUp;
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const assignedParticipantIds = positionAssignments?.filter((assignment) => {
    return drawPositions?.includes(assignment.drawPosition) && assignment.participantId;
  });
  const bothSidesPresent = inContextMatchUp?.sides?.every((side) => side.participantId);
  return assignedParticipantIds?.length === 2 || bothSidesPresent;
}

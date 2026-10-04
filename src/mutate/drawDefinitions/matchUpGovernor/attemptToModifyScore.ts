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
  const { matchUpStatusCodes, autoCalcDisabled, inContextMatchUp, matchUpStatus, dualMatchUp, structure, matchUp } =
    params;

  const matchUpStatusIsValid =
    isDirectingMatchUpStatus({ matchUpStatus }) ||
    // in the case that CANCELLED or ABANDONED causes TEAM participant to advance
    ([CANCELLED, ABANDONED].includes(matchUpStatus) && dualMatchUp) ||
    autoCalcDisabled;

  const participantsCount =
    matchUp?.sides?.map((side) => side.participantId).filter(Boolean).length ||
    inContextMatchUp?.sides?.map((side) => side.participantId).filter(Boolean).length;

  const stack = 'attemptToModifyScore';
  const hasAdHocSides =
    (isAdHoc({ structure }) && participantsCount === 1) || (matchUpStatus === DEFAULTED && participantsCount);
  const validToScore =
    hasAdHocSides ||
    drawPositionsAssignedParticipantIds({ structure, matchUp, inContextMatchUp }) ||
    params.appliedPolicies?.[POLICY_TYPE_SCORING]?.requireParticipantsForScoring === false ||
    // a single exit before the second opponent arrives, whether recorded or carried; checkParticipants has
    // already decided whose side may be awarded it (CA, 2026-10-04: not a propagateExitStatus question)
    (isExit(matchUpStatus) && participantsCount === 1);

  if (!validToScore) return decorateResult({ result: { error: MISSING_ASSIGNMENTS }, stack });

  const removeScore = [WALKOVER].includes(matchUpStatus);

  const updatedMatchUpStatus = matchUpStatusIsValid ? matchUpStatus : (params.winningSide && COMPLETED) || INCOMPLETE;
  const result = modifyMatchUpScore({
    ...params,
    winningSide: params.winningSide,
    matchUpStatusCodes: (matchUpStatusIsValid && matchUpStatusCodes) ?? [],
    matchUpStatus: updatedMatchUpStatus,
    context: stack,
    removeScore,
  });
  return decorateResult({ result, stack });
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

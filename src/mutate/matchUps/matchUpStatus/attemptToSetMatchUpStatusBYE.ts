import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { releaseByeScheduling } from '@Mutate/matchUps/schedule/byeScheduling';
import { modifyMatchUpNotice } from '../../notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';

import { BYE } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { INVALID_MATCHUP_STATUS, INVALID_MATCHUP_STATUS_BYE } from '@Constants/errorConditionConstants';

export function attemptToSetMatchUpStatusBYE({
  preserveScheduling,
  tournamentRecord,
  drawDefinition,
  structure,
  matchUp,
  event,
}) {
  const stack = 'attemptToSetMatchUpStatusBYE';
  if (matchUp?.winningSide) {
    return decorateResult({
      result: { error: INVALID_MATCHUP_STATUS },
      context: { matchUpStatus: BYE },
      stack,
    });
  }

  // It is not possible to change matchUp status to BYE unless
  // matchUp.drawPositions includes BYE assigned position
  const { positionAssignments } = structureAssignedDrawPositions({
    structure,
  });

  const byeAssignedDrawPositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map((assignment) => assignment.drawPosition);

  const matchUpIncludesBye = matchUp.drawPositions?.some((position) => byeAssignedDrawPositions?.includes(position));

  if (matchUpIncludesBye) {
    matchUp.matchUpStatus = BYE;
    matchUp.matchUpStatusCodes = [];
    // Preserve by default: a director may be mid-swap and the surrounding schedule is
    // theirs. Only an explicit `preserveScheduling: false` gives the slot back.
    if (preserveScheduling === false) releaseByeScheduling({ matchUp });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
    return { ...SUCCESS };
  } else {
    return decorateResult({
      result: { error: INVALID_MATCHUP_STATUS_BYE },
      info: 'matchUp does not include BYE',
      stack,
    });
  }
}

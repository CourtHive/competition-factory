import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

// constants
import { SUCCESS } from '@Constants/resultConstants';

export function updateTargetTeamMatchUps({
  updateInProgressMatchUps,
  tournamentRecord,
  drawDefinition,
  targetMatchUps,
  tieFormat,
  event,
}) {
  for (const targetMatchUp of targetMatchUps) {
    const hasTieFormat = !!targetMatchUp.tieFormat;
    if (hasTieFormat) {
      targetMatchUp.tieFormat = copyTieFormat(tieFormat);
    }

    let scoreUpdated;
    if (updateInProgressMatchUps) {
      const appliedPolicies = getAppliedPolicies({ tournamentRecord, drawDefinition, event }).appliedPolicies;
      // recalculate score
      const result = updateTieMatchUpScore({
        matchUpId: targetMatchUp.matchUpId,
        exitWhenNoValues: true,
        tournamentRecord,
        appliedPolicies,
        drawDefinition,
        event,
      });
      if (result.error) return result;
      scoreUpdated = result.score;
    }

    if (hasTieFormat && !scoreUpdated) {
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        context: 'updateTargetTeamMatchUps',
        eventId: event?.eventId,
        event,
        matchUp: targetMatchUp,
        drawDefinition,
      });
    }
  }
  return { ...SUCCESS };
}

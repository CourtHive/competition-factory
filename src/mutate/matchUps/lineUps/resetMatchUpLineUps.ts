import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { updateTeamLineUp } from '@Mutate/drawDefinitions/updateTeamLineUp';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants
import { INVALID_MATCHUP, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ResetMatchUpLineUps = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  inheritance?: boolean;
  matchUpId: string;
  event?: Event;
};
export function resetMatchUpLineUps({
  inheritance = true,
  tournamentRecord,
  drawDefinition,
  matchUpId,
  event,
}: ResetMatchUpLineUps) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const matchUp = findDrawMatchUp({
    drawDefinition,
    matchUpId,
  })?.matchUp;

  if (!matchUp?.tieMatchUps) return { error: INVALID_MATCHUP };

  const inContextMatchUp = findDrawMatchUp({
    inContext: true,
    drawDefinition,
    matchUpId,
    event,
  })?.matchUp;

  let modificationsCount = 0;

  (matchUp?.sides ?? []).forEach((side) => {
    if (side.lineUp) delete side.lineUp;
  });

  (inContextMatchUp?.sides ?? []).forEach((side) => {
    modificationsCount += 1;

    if (inheritance === false) {
      const tieFormat = inContextMatchUp?.tieFormat;
      const participantId = side.participantId;

      if (tieFormat && participantId) {
        updateTeamLineUp({
          drawDefinition,
          participantId,
          lineUp: [],
          tieFormat,
        });
      }
    }

    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'resetMatchUpLineUps',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
    });
  });

  return { ...SUCCESS, modificationsCount };
}

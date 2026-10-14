import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { ErrorType, MATCHUP_NOT_FOUND, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';

/**
 * The matchUp an online resource is attached to or removed from: a recording, a stream or a stats page belongs to
 * the matchUp, as resources belong to every other element. Found in the draw the engine resolves from `drawId`,
 * tieMatchUps included.
 */
export function findOnlineResourceMatchUp(params: { drawDefinition?: DrawDefinition; matchUpId: string }): {
  matchUp?: MatchUp;
  error?: ErrorType;
} {
  if (!params.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  const { matchUp } = findDrawMatchUp({ drawDefinition: params.drawDefinition, matchUpId: params.matchUpId });
  return matchUp ? { matchUp } : { error: MATCHUP_NOT_FOUND };
}

/** subscribers (TMX, courthive-public) refresh a matchUp on this notice, as for any other matchUp change */
export function onlineResourceMatchUpNotice(params: {
  drawDefinition?: DrawDefinition;
  tournamentRecord: Tournament;
  matchUp: MatchUp;
  context: string;
  event?: Event;
}) {
  modifyMatchUpNotice({
    tournamentId: params.tournamentRecord.tournamentId,
    drawDefinition: params.drawDefinition as DrawDefinition,
    eventId: params.event?.eventId,
    matchUp: params.matchUp,
    context: params.context,
  });
}

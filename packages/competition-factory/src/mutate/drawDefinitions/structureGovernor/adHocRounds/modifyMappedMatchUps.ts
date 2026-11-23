import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';

export function modifyMappedMatchUps({ params, modMap, structure }) {
  const { tournamentRecord, drawDefinition, event } = params;
  for (const matchUp of structure.matchUps) {
    if (modMap[matchUp.matchUpId]) {
      matchUp.roundNumber = modMap[matchUp.matchUpId];
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        event,
        drawDefinition,
        matchUp,
      });
    }
  }
}

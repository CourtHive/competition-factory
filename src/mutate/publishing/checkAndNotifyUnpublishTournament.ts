import { isTournamentPublished } from '@Query/publishing/isTournamentPublished';
import { hasTopic, addNotice } from '@Global/state/globalState';

// constants
import { UNPUBLISH_TOURNAMENT } from '@Constants/topicConstants';

/**
 * Emit UNPUBLISH_TOURNAMENT when the tournament is no longer published by any component.
 *
 * Callers that can remove the LAST published component without an explicit unpublish (deleting a
 * draw or an event) should capture `isTournamentPublished` before mutating and call this only when it
 * was true, so the notice marks a transition rather than restating a state.
 */
export function checkAndNotifyUnpublishTournament({ tournamentRecord }) {
  if (!hasTopic(UNPUBLISH_TOURNAMENT)) return undefined;
  if (isTournamentPublished(tournamentRecord)) return undefined;

  addNotice({
    topic: UNPUBLISH_TOURNAMENT,
    payload: { tournamentId: tournamentRecord.tournamentId },
  });
  return undefined;
}

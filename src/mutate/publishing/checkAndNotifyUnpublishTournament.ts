import { getTournamentPublishStatus } from '@Query/tournaments/getTournamentPublishStatus';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getDrawPublishStatus } from '@Query/event/getDrawPublishStatus';
import { hasTopic, addNotice } from '@Global/state/globalState';
import { getDrawId } from '@Functions/global/extractors';

// constants
import { UNPUBLISH_TOURNAMENT } from '@Constants/topicConstants';

export function checkAndNotifyUnpublishTournament({ tournamentRecord }) {
  if (!hasTopic(UNPUBLISH_TOURNAMENT)) return;

  const pubStatus = getTournamentPublishStatus({ tournamentRecord });
  if (pubStatus?.orderOfPlay?.published || pubStatus?.participants?.published) return;

  for (const event of tournamentRecord.events ?? []) {
    const eventPubStatus = getEventPublishStatus({ event });
    const drawDetails = eventPubStatus?.drawDetails ?? {};
    for (const drawId of event.drawDefinitions?.map(getDrawId) ?? []) {
      if (getDrawPublishStatus({ drawDetails, drawId, ignoreEmbargo: true })) return;
    }
  }

  addNotice({
    topic: UNPUBLISH_TOURNAMENT,
    payload: { tournamentId: tournamentRecord.tournamentId },
  });
}

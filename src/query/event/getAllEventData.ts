import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
import { extractEventInfo } from '@Query/event/extractEventInfo';
import { getDrawMatchUps } from '@Query/matchUps/drawMatchUps';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

export function getAllEventData({ tournamentRecord, policyDefinitions }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const events = tournamentRecord.events ?? [];
  const tournamentParticipants = tournamentRecord?.participants ?? [];

  const { tournamentInfo } = getTournamentInfo({ tournamentRecord });

  const { venues: venuesData } = getVenuesAndCourts({
    tournamentRecord,
  });

  const eventsData = events.map((event) => {
    const { eventId } = event;
    const eventInfo = extractEventInfo({ event }).eventInfo;

    const scheduleTiming = getScheduleTiming({
      tournamentRecord,
      event,
    }).scheduleTiming;

    const drawsData = (event.drawDefinitions ?? []).map((drawDefinition) => {
      const { drawId, drawName, matchUpFormat, updatedAt } = drawDefinition;
      const drawInfo = { drawId, drawName, matchUpFormat, updatedAt };

      const { abandonedMatchUps, completedMatchUps, upcomingMatchUps, pendingMatchUps } = getDrawMatchUps({
        requireParticipants: true,
        tournamentParticipants,
        context: { eventId },
        policyDefinitions,
        tournamentRecord,
        inContext: true,
        scheduleTiming,
        drawDefinition,
        event,
      });

      return {
        drawInfo,
        matchUps: {
          abandonedMatchUps,
          completedMatchUps,
          upcomingMatchUps,
          pendingMatchUps,
        },
      };
    });

    const publish = getEventPublishStatus({ event });

    Object.assign(eventInfo, {
      drawsData,
      publish,
    });

    return eventInfo;
  });

  const allEventData = { tournamentInfo, venuesData, eventsData };

  return { allEventData };
}

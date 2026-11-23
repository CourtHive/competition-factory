import { getEventPublishStatus } from './getEventPublishStatus';
import { getDrawPublishStatus } from './getDrawPublishStatus';

// constants
import { MISSING_TOURNAMENT_RECORD, MISSING_VALUE } from '@Constants/errorConditionConstants';

/**
 *
 * @param {object[]} outcomes - array of outcomes to be applied to matchUps, relevent attributes: { eventId: string; drawId: string; }
 *
 */
export function bulkUpdatePublishedEventIds({ tournamentRecord, outcomes }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!outcomes?.length) return { error: MISSING_VALUE, info: 'Missing outcomes' };

  const eventIdsMap = outcomes.reduce((eventIdsMap, outcome) => {
    const { drawId, eventId } = outcome;
    if (eventId && drawId) {
      if (!eventIdsMap[eventId]) {
        eventIdsMap[eventId] = [drawId];
      } else if (!eventIdsMap[eventId].includes(drawId)) {
        eventIdsMap[eventId].push(drawId);
      }
    }
    return eventIdsMap;
  }, {});

  const relevantEventsIds = Object.keys(eventIdsMap);
  const relevantEvents = tournamentRecord.events?.filter((event) => relevantEventsIds.includes(event.eventId));
  const publishedEventIds = relevantEvents
    .filter((event) => {
      const pubStatus = getEventPublishStatus({ event });
      const { drawDetails, drawIds } = pubStatus ?? {};

      const { eventId } = event;
      const publishedDrawIds = eventIdsMap[eventId].filter((drawId) => {
        const keyedDrawIds = drawDetails
          ? Object.keys(pubStatus.drawDetails).filter((drawId) => getDrawPublishStatus({ drawId, drawDetails }))
          : [];
        return drawIds?.includes(drawId) || keyedDrawIds.includes(drawId);
      });

      return publishedDrawIds.length;
    })
    .map((event) => event.eventId);

  return { publishedEventIds, eventIdPublishedDrawIdsMap: eventIdsMap };
}

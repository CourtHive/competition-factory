// fixtures and constants
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { DOUBLES } from '@Constants/eventConstants';

const DEFAULT_RATING = 0;

export function getSideRatings({ tournamentParticipants, adHocRatings, eventType, scaleName, pairing }) {
  const defaultRating = ratingsParameters[scaleName]?.defaultInitialization ?? DEFAULT_RATING;
  return pairing.split('|').map((participantId) => {
    if (eventType === DOUBLES) {
      const individualParticipantIds = tournamentParticipants?.find(
        (participant) => participant.participantId === participantId,
      )?.individualParticipantIds;

      return !individualParticipantIds
        ? defaultRating * 2
        : individualParticipantIds?.map((participantId) => adHocRatings[participantId] || defaultRating);
    } else {
      return adHocRatings[participantId] || defaultRating;
    }
  });
}

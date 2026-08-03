import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';

// constants and fixtures
import { EVENT_TYPE, TOURNAMENT_RECORD, VALIDATE } from '@Constants/attributeConstants';
import { EventTypeUnion, Participant, Tournament } from '@Types/tournamentTypes';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { DYNAMIC, RATING, SCALE } from '@Constants/scaleConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function removeRatings(params: {
  tournamentRecord: Tournament;
  eventType: EventTypeUnion;
  asDynamic?: boolean;
  ratingType: string;
}) {
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true, [EVENT_TYPE]: true },
    { ratingType: false, [VALIDATE]: (value) => ratingsParameters[value] },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const dynamicScaleName = `${params.ratingType}.${DYNAMIC}`;
  const ratingType = params.asDynamic ? dynamicScaleName : params.ratingType;
  const itemType = [SCALE, RATING, params.eventType, ratingType].join('.');

  const participants: Participant[] = params.tournamentRecord.participants ?? [];
  const modifiedParticipants: Participant[] = [];
  for (const participant of participants) {
    if (participant.timeItems) {
      const before = participant.timeItems.length;
      participant.timeItems = participant.timeItems.filter((timeItem) => timeItem.itemType !== itemType);
      if (participant.timeItems.length !== before) modifiedParticipants.push(participant);
    }
  }

  if (modifiedParticipants.length) {
    modifyParticipantsNotice({
      tournamentId: params.tournamentRecord.tournamentId,
      participants: modifiedParticipants,
    });
  }

  return { ...SUCCESS };
}

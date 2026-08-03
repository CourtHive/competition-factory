import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { addNotice } from '@Global/state/globalState';

// constants and fixtures
import { EVENT_TYPE, TOURNAMENT_RECORD, VALIDATE } from '@Constants/attributeConstants';
import { EventTypeUnion, Participant, Tournament } from '@Types/tournamentTypes';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { DYNAMIC, RATING, SCALE } from '@Constants/scaleConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
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
    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: { tournamentId: params.tournamentRecord.tournamentId, participants: modifiedParticipants },
    });
  }

  return { ...SUCCESS };
}

import { participantScaleItem } from '../participant/participantScaleItem';
import { requireParams } from '@Helpers/parameters/requireParams';

import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { RANKING, RATING, SEEDING } from '@Constants/timeItemConstants';

export function getEventProperties({ tournamentRecord, event }) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const eventEntries = event.entries || [];
  const tournamentParticipants = tournamentRecord.participants || [];

  const scaleName = event.category?.categoryName || event.category?.ageCategoryCode;
  const { eventType } = event;

  const enteredParticipantIds = new Set(eventEntries.map((entry) => entry.participantId));
  const enteredParticipants = tournamentParticipants.filter((participant) =>
    enteredParticipantIds.has(participant.participantId),
  );

  let hasSeededParticipants, hasRankedParticipants, hasRatedParticipants;
  const entryScaleAttributes = enteredParticipants.map((participant) => {
    const { participantId, participantName, name } = participant;

    let scaleAttributes = { scaleType: SEEDING, eventType, scaleName };
    const seed = participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue;
    scaleAttributes = { scaleType: RANKING, eventType, scaleName };
    const ranking = participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue;
    scaleAttributes = { scaleType: RATING, eventType, scaleName };
    const rating = participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue;

    hasSeededParticipants = !!(hasSeededParticipants || seed);
    hasRankedParticipants = !!(hasRankedParticipants || ranking);
    hasRatedParticipants = !!(hasRatedParticipants || rating);
    return {
      participantId,
      participantName: participantName || name, // support legacy
      seed,
      ranking,
      rating,
    };
  });

  return {
    entryScaleAttributes,
    hasSeededParticipants,
    hasRankedParticipants,
    hasRatedParticipants,
  };
}

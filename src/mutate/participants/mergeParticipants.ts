import { coercePersonSex, isUnrecognizedSex, UNRECOGNIZED_SEX_INFO } from '@Helpers/coercedSex';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { addNotice, getTopics } from '@Global/state/globalState';
import { xa } from '@Tools/extractAttributes';
import { deepMerge } from '@Tools/deepMerge';

// constants and types
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { ADD_PARTICIPANTS, MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Participant } from '@Types/tournamentTypes';

export function mergeParticipants({
  participants: incomingParticipants = [] as Participant[],
  tournamentRecord,
  arraysToMerge,
}) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  tournamentRecord.participants ??= [];

  // Checked before anything is merged, so one bad person refuses the whole merge
  // rather than leaving the record half-written.
  const unrecognizedSex = incomingParticipants.find((p) => isUnrecognizedSex(p?.person?.sex));
  if (unrecognizedSex) {
    return {
      error: INVALID_VALUES,
      info: UNRECOGNIZED_SEX_INFO,
      context: { participantId: unrecognizedSex.participantId, sex: unrecognizedSex.person?.sex },
    };
  }
  incomingParticipants.forEach((p) => coercePersonSex(p?.person));

  const mappedParticipants = incomingParticipants
    .filter(xa(PARTICIPANT_ID))
    .map((p: any) => ({ [p.participantId]: p }));
  const incomingIdMap = Object.assign({}, ...mappedParticipants);

  // check for overlap with existing players, add any newly retrieved attributes to existing
  const modifiedParticipants: Participant[] = [];
  tournamentRecord.participants = tournamentRecord.participants.map((participant) => {
    if (incomingIdMap[participant.participantId]) {
      const mergedParticipant = deepMerge(participant, incomingIdMap[participant.participantId], arraysToMerge);
      modifiedParticipants.push(mergedParticipant);
      return mergedParticipant;
    }
    return participant;
  });

  const existingParticipantIds = tournamentRecord.participants.map(xa(PARTICIPANT_ID)) ?? [];
  const newParticipants = incomingParticipants.filter(
    ({ participantId }) => !existingParticipantIds.includes(participantId),
  );

  const { topics } = getTopics();

  if (newParticipants.length) {
    tournamentRecord.participants = tournamentRecord.participants.concat(...newParticipants);

    if (topics.includes(ADD_PARTICIPANTS)) {
      addNotice({
        topic: ADD_PARTICIPANTS,
        payload: { participants: newParticipants },
      });
    }
  }

  if (modifiedParticipants.length && topics.includes(MODIFY_PARTICIPANTS)) {
    modifyParticipantsNotice({
      tournamentId: tournamentRecord.tournamentId,
      participants: modifiedParticipants,
    });
  }

  return {
    modifiedParticipantsCount: modifiedParticipants.length,
    newParticipantsCount: newParticipants.length,
    ...SUCCESS,
  };
}

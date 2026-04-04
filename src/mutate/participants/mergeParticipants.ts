import { addNotice, getTopics } from '@Global/state/globalState';
import { xa } from '@Tools/extractAttributes';
import { deepMerge } from '@Tools/deepMerge';

// Contants and Types
import { ADD_PARTICIPANTS, MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { PARTICIPANT_ID } from '@Constants/attributeConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function mergeParticipants({ participants: incomingParticipants = [], tournamentRecord, arraysToMerge }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  tournamentRecord.participants ??= [];

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
    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: modifiedParticipants,
      },
    });
  }

  return {
    modifiedParticipantsCount: modifiedParticipants.length,
    newParticipantsCount: newParticipants.length,
    ...SUCCESS,
  };
}

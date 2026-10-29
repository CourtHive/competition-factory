import { definedAttributes } from '@Tools/definedAttributes';
import { addNotice } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { indexParticipants } from './participantsIndex';
import { addParticipant } from './addParticipant';
import { UUID } from '@Tools/UUID';

// constants and types
import { MISSING_TOURNAMENT_RECORD, EXISTING_PARTICIPANT } from '@Constants/errorConditionConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

type AddParticipantsType = {
  allowDuplicateParticipantIdPairs?: boolean;
  returnParticipants?: boolean;
  participants?: Participant[];
  tournamentRecord: Tournament;
};

export function addParticipants({
  allowDuplicateParticipantIdPairs,
  returnParticipants,
  tournamentRecord,
  participants = [],
}: AddParticipantsType) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const tournamentParticipants = tournamentRecord.participants ?? [];

  const existingParticipantIds = new Set(tournamentParticipants.map((p) => p.participantId));

  participants.forEach((participant) => {
    participant.participantId ??= UUID();
  });

  const newParticipants = participants.filter((participant) => !existingParticipantIds.has(participant.participantId));

  const notAdded = participants.filter((participant) => existingParticipantIds.has(participant.participantId));

  const individualParticipants = newParticipants.filter((participant) => participant.participantType === INDIVIDUAL);

  const groupedParticipants = newParticipants.filter((participant) => participant.participantType !== INDIVIDUAL);

  // add individual participants first so that grouped participants which include them are valid
  const participantsToAdd = individualParticipants.concat(...groupedParticipants);

  const addedParticipants: Participant[] = [];
  if (participantsToAdd.length) {
    // created only when something is added: an empty or refused call wrote an empty array
    const hadParticipants = Array.isArray(tournamentRecord.participants);
    tournamentRecord.participants = tournamentParticipants;
    const countBefore = tournamentParticipants.length;
    // the pool is read once for the batch, not once per participant
    const participantsIndex = indexParticipants(tournamentParticipants);
    for (const participant of participantsToAdd) {
      const result = addParticipant({
        allowDuplicateParticipantIdPairs,
        participantsIndex,
        returnParticipant: true,
        disableNotice: true,
        tournamentRecord,
        participant,
      });
      if (result.error) {
        // all or nothing: a participant is checked against those added before it in the call, so a refusal is known
        // only part way through; the participants appended before it are removed (they were kept, unannounced)
        tournamentParticipants.length = countBefore;
        if (!hadParticipants) delete tournamentRecord.participants;
        return result;
      }

      if (result.success && !result.existingParticipant) addedParticipants.push(result.participant);
    }

    if (addedParticipants.length) {
      addNotice({
        topic: ADD_PARTICIPANTS,
        payload: {
          tournamentId: tournamentRecord.tournamentId,
          participants: addedParticipants,
        },
      });
    }

    const result = {
      participants: returnParticipants && makeDeepCopy(addedParticipants),
      addedCount: addedParticipants.length,
      ...SUCCESS,
    };

    if (notAdded.length) {
      Object.assign(result, { notAdded, info: EXISTING_PARTICIPANT });
    }

    return definedAttributes(result);
  } else {
    return {
      info: 'No new participants to add',
      addedCount: 0,
      ...SUCCESS,
    };
  }
}

import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { addNotice } from '@Global/state/globalState';
import { addParticipant } from './addParticipant';
import { UUID } from '@Tools/UUID';

import { Participant, Tournament } from '@Types/tournamentTypes';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { MISSING_TOURNAMENT_RECORD, EXISTING_PARTICIPANT } from '@Constants/errorConditionConstants';

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
  tournamentRecord.participants ??= [];
  const tournamentParticipants = tournamentRecord.participants;

  const existingParticipantIds = tournamentParticipants.map((p) => p.participantId) ?? [];

  participants.forEach((participant) => {
    participant.participantId ??= UUID();
  });

  const newParticipants = participants.filter(
    (participant) => !existingParticipantIds.includes(participant.participantId),
  );

  const notAdded = participants.filter((participant) => existingParticipantIds.includes(participant.participantId));

  const individualParticipants = newParticipants.filter((participant) => participant.participantType === INDIVIDUAL);

  const groupedParticipants = newParticipants.filter((participant) => participant.participantType !== INDIVIDUAL);

  // add individual participants first so that grouped participants which include them are valid
  const participantsToAdd = individualParticipants.concat(...groupedParticipants);

  const addedParticipants: Participant[] = [];
  if (participantsToAdd.length) {
    for (const participant of participantsToAdd) {
      const result = addParticipant({
        allowDuplicateParticipantIdPairs,
        returnParticipant: true,
        disableNotice: true,
        tournamentRecord,
        participant,
      });
      if (result.error) return result;

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

import { getParticipants } from '@Query/participants/getParticipants';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice, getTopics } from '@Global/state/globalState';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { addParticipant } from './addParticipant';
import { UUID } from '@Tools/UUID';

import { ErrorType, INVALID_PARTICIPANT_TYPE, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { GROUP, INDIVIDUAL } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { OTHER } from '@Constants/participantRoles';

type CreateGroupParticipantType = {
  participantRoleResponsibilities?: string[];
  individualParticipantIds: string[];
  tournamentRecord: Tournament;
  participantRole?: string;
  participantId: string;
  groupName: string;
};

export function createGroupParticipant({
  individualParticipantIds = [],
  participantRoleResponsibilities,
  participantRole = OTHER,
  tournamentRecord,
  participantId,
  groupName,
}: CreateGroupParticipantType): {
  participant?: Participant;
  participantId?: string;
  success?: boolean;
  error?: ErrorType;
  info?: any;
} {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!groupName) return { error: MISSING_VALUE, info: 'Missing groupName' };
  if (!Array.isArray(individualParticipantIds))
    return {
      info: 'Invalid individualParticipantIds',
      error: INVALID_VALUES,
    };

  const participants =
    getParticipants({
      participantFilters: { participantTypes: [INDIVIDUAL] },
      tournamentRecord,
    }).participants ?? [];
  const tournamentIndividualParticipantIds = participants.map((participant) => participant.participantId);

  for (const participantId of individualParticipantIds) {
    if (!tournamentIndividualParticipantIds.includes(participantId)) {
      return { error: INVALID_PARTICIPANT_TYPE, participantId };
    }
  }

  const groupParticipant = definedAttributes({
    participantId: participantId || UUID(),
    participantRoleResponsibilities,
    participantName: groupName,
    individualParticipantIds,
    participantType: GROUP,
    participantRole,
  });

  const result = addParticipant({
    participant: groupParticipant,
    tournamentRecord,
  });
  if (result.error) return result;

  const { topics } = getTopics();
  if (topics.includes(ADD_PARTICIPANTS)) {
    addNotice({
      topic: ADD_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: [groupParticipant],
      },
    });
  }

  return { ...SUCCESS, participant: makeDeepCopy(groupParticipant) };
}

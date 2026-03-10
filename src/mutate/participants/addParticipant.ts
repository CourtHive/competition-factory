import { decorateResult } from '@Functions/global/decorateResult';
import { definedAttributes } from '@Tools/definedAttributes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { addNotice } from '@Global/state/globalState';
import { intersection } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';

import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { GROUP, INDIVIDUAL, PAIR, participantTypes, TEAM } from '@Constants/participantConstants';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_PARTICIPANT_TYPE,
  MISSING_PARTICIPANT_ROLE,
  MISSING_PARTICIPANT_IDS,
  MISSING_PERSON_DETAILS,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_ID_EXISTS,
  MISSING_PARTICIPANT,
  INVALID_VALUES,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type AddParticipantType = {
  allowDuplicateParticipantIdPairs?: boolean;
  tournamentRecords?: TournamentRecords;
  tournamentRecord: Tournament;
  activeTournamentId?: string;
  returnParticipant?: boolean;
  disableNotice?: boolean;
  pairOverride?: boolean;
  tournamentId?: string;
  participant: any; // participantId may be missing and is added by the method
};

export function addParticipant(params: AddParticipantType) {
  const stack = 'addParticipant';

  const { allowDuplicateParticipantIdPairs, returnParticipant, disableNotice, pairOverride, participant } = params;

  const tournamentRecord = params.tournamentId // if a tournamentId is specified, use it!
    ? params.tournamentRecords?.[params.tournamentId]
    : (params.tournamentRecord ?? (params.activeTournamentId && params.tournamentRecords?.[params.activeTournamentId]));

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!participant) return decorateResult({ result: { error: MISSING_PARTICIPANT }, stack });
  if (!participant.participantId) participant.participantId = UUID();
  if (!tournamentRecord.participants) tournamentRecord.participants = [];

  const { participantId, individualParticipantIds } = participant;

  const idExists = tournamentRecord.participants.reduce((p, c) => c.participantId === participantId || p, false);
  if (idExists) return { error: PARTICIPANT_ID_EXISTS };

  const { participantType, participantRole } = participant;
  if (!participantType || !Object.keys(participantTypes).includes(participantType))
    return { error: INVALID_PARTICIPANT_TYPE, participantType };

  if (!participantRole) return { error: MISSING_PARTICIPANT_ROLE };

  const tournamentParticipants = tournamentRecord.participants || [];
  const tournamentIndividualParticipantIds = tournamentParticipants
    .filter((tournamentParticipant) => tournamentParticipant.participantType === INDIVIDUAL)
    .map((individualParticipant) => individualParticipant.participantId);

  if (participantType !== INDIVIDUAL && participant.person)
    return { error: INVALID_VALUES, person: participant.person };

  if (individualParticipantIds && !Array.isArray(individualParticipantIds))
    return { error: INVALID_VALUES, individualParticipantIds };

  if (participantType === PAIR) {
    if (participant.person) return { error: INVALID_VALUES, person: participant.person };
    if (!participant.individualParticipantIds) {
      return decorateResult({
        result: { error: MISSING_PARTICIPANT_IDS },
        stack,
      });
    } else if (participant.individualParticipantIds.length !== 2 && !pairOverride) {
      return decorateResult({
        info: 'PAIR must be 2 individualParticipantIds',
        result: { error: INVALID_PARTICIPANT_IDS },
        stack,
      });
    } else {
      const individualParticipantIds = tournamentParticipants
        .filter((participant) => participant.participantType === INDIVIDUAL)
        .map((participant) => participant.participantId);

      if (!Array.isArray(participant.individualParticipantIds))
        return decorateResult({
          result: { error: INVALID_PARTICIPANT_IDS },
          stack,
        });

      const validPairParticipants = participant.individualParticipantIds.reduce(
        (valid, participantId) => individualParticipantIds.includes(participantId) && valid,
        true,
      );
      if (!validPairParticipants)
        return decorateResult({
          result: { error: INVALID_PARTICIPANT_IDS },
          stack,
        });
    }

    const existingPairParticipants = tournamentParticipants
      .filter((participant) => participant.participantType === PAIR)
      .map((participant) => ({
        individualParticipantIds: participant.individualParticipantIds,
        participant,
      }));

    // determine whether a PAIR participant already exists
    const existingPairParticipant =
      participant.participantType === PAIR &&
      existingPairParticipants.find(
        (existingPairParticipant) =>
          intersection(existingPairParticipant.individualParticipantIds, participant.individualParticipantIds)
            .length === 2,
      );

    if (existingPairParticipant && !allowDuplicateParticipantIdPairs) {
      return {
        ...SUCCESS,
        existingParticipant: true,
        participant: returnParticipant && makeDeepCopy(existingPairParticipant.participant),
      };
    }

    if (!participant.participantName) {
      const individualParticipants = tournamentParticipants.filter((tournamentParticipant) =>
        participant.individualParticipantIds?.includes(tournamentParticipant.participantId),
      );

      let participantName = individualParticipants
        .map((participant) => participant.person?.standardFamilyName)
        .filter(Boolean)
        .join('/');
      if (individualParticipants.length === 1) participantName += '/Unknown';

      participant.participantName = participantName;
    }
  } else if (participantType === INDIVIDUAL) {
    if (!participant.person?.standardFamilyName || !participant.person?.standardGivenName)
      return { error: MISSING_PERSON_DETAILS };

    if (!participant.participantName) {
      participant.participantName = `${participant.person.standardGivenName} ${participant.person.standardFamilyName}`;
    }
  } else if (participantType && [TEAM, GROUP].includes(participantType)) {
    if (!individualParticipantIds) participant.individualParticipantIds = [];
    if (participant.individualParticipantIds?.length) {
      for (const individualParticipantId of participant.individualParticipantIds) {
        if (typeof individualParticipantId !== 'string') {
          return decorateResult({
            result: {
              participantId: individualParticipantId,
              error: INVALID_VALUES,
            },
            stack,
          });
        }
        if (!tournamentIndividualParticipantIds.includes(individualParticipantId)) {
          return decorateResult({
            result: {
              participantId: individualParticipantId,
              error: PARTICIPANT_NOT_FOUND,
            },
            stack,
          });
        }
      }
    }
  } else {
    return { error: INVALID_PARTICIPANT_TYPE };
  }

  tournamentRecord.participants.push(participant);

  if (!disableNotice) {
    addNotice({
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: [participant],
      },
      topic: ADD_PARTICIPANTS,
    });
  }

  const result = {
    participant: returnParticipant && makeDeepCopy(participant),
    ...SUCCESS,
  };
  return definedAttributes(result);
}

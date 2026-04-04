import { decorateResult } from '@Functions/global/decorateResult';
import { definedAttributes } from '@Tools/definedAttributes';
import { addNotice } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { intersection } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';

import { GROUP, INDIVIDUAL, PAIR, participantTypes, TEAM } from '@Constants/participantConstants';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
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

function validateBaseParticipant(participant, tournamentRecord) {
  if (!participant) return { error: MISSING_PARTICIPANT };
  participant.participantId ??= UUID();
  tournamentRecord.participants ??= [];

  const { participantId } = participant;
  const idExists = tournamentRecord.participants.reduce((p, c) => c.participantId === participantId || p, false);
  if (idExists) return { error: PARTICIPANT_ID_EXISTS };

  const { participantType, participantRole } = participant;
  if (!participantType || !Object.keys(participantTypes).includes(participantType))
    return { error: INVALID_PARTICIPANT_TYPE, participantType };

  if (!participantRole) return { error: MISSING_PARTICIPANT_ROLE };

  if (participantType !== INDIVIDUAL && participant.person)
    return { error: INVALID_VALUES, person: participant.person };

  if (participant.individualParticipantIds && !Array.isArray(participant.individualParticipantIds))
    return { error: INVALID_VALUES, individualParticipantIds: participant.individualParticipantIds };

  return undefined;
}

function validatePairParticipant({
  participant,
  tournamentParticipants,
  pairOverride,
  allowDuplicateParticipantIdPairs,
  returnParticipant,
}) {
  const stack = 'addParticipant';

  if (participant.person) return { error: INVALID_VALUES, person: participant.person };
  if (!participant.individualParticipantIds) {
    return decorateResult({
      result: { error: MISSING_PARTICIPANT_IDS },
      stack,
    });
  }
  if (participant.individualParticipantIds.length !== 2 && !pairOverride) {
    return decorateResult({
      info: 'PAIR must be 2 individualParticipantIds',
      result: { error: INVALID_PARTICIPANT_IDS },
      stack,
    });
  }

  const individualParticipantIds = new Set(
    tournamentParticipants.filter((p) => p.participantType === INDIVIDUAL).map((p) => p.participantId),
  );

  if (!Array.isArray(participant.individualParticipantIds))
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_IDS },
      stack,
    });

  const validPairParticipants = participant.individualParticipantIds.reduce(
    (valid, participantId) => individualParticipantIds.has(participantId) && valid,
    true,
  );
  if (!validPairParticipants)
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_IDS },
      stack,
    });

  const existingPairParticipants = tournamentParticipants
    .filter((p) => p.participantType === PAIR)
    .map((p) => ({
      individualParticipantIds: p.individualParticipantIds,
      participant: p,
    }));

  const existingPairParticipant = existingPairParticipants.find(
    (existing) => intersection(existing.individualParticipantIds, participant.individualParticipantIds).length === 2,
  );

  if (existingPairParticipant && !allowDuplicateParticipantIdPairs) {
    return {
      earlyReturn: true,
      ...SUCCESS,
      existingParticipant: true,
      participant: returnParticipant && makeDeepCopy(existingPairParticipant.participant),
    };
  }

  if (!participant.participantName) {
    const individualParticipants = tournamentParticipants.filter((tp) =>
      participant.individualParticipantIds?.includes(tp.participantId),
    );

    let participantName = individualParticipants
      .map((p) => p.person?.standardFamilyName)
      .filter(Boolean)
      .join('/');
    if (individualParticipants.length === 1) participantName += '/Unknown';

    participant.participantName = participantName;
  }

  return undefined;
}

function validateTeamGroupParticipant({ participant, tournamentIndividualParticipantIds }) {
  const stack = 'addParticipant';

  participant.individualParticipantIds ??= [];
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

  return undefined;
}

export function addParticipant(params: AddParticipantType) {
  const stack = 'addParticipant';

  const { allowDuplicateParticipantIdPairs, returnParticipant, disableNotice, pairOverride, participant } = params;

  const tournamentRecord = params.tournamentId
    ? params.tournamentRecords?.[params.tournamentId]
    : (params.tournamentRecord ?? (params.activeTournamentId && params.tournamentRecords?.[params.activeTournamentId]));

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const baseError = validateBaseParticipant(participant, tournamentRecord);
  if (baseError) return decorateResult({ result: baseError, stack });

  const { participantType } = participant;
  const tournamentParticipants = tournamentRecord.participants ?? [];
  const tournamentIndividualParticipantIds = tournamentParticipants
    .filter((tp) => tp.participantType === INDIVIDUAL)
    .map((tp) => tp.participantId);

  if (participantType === PAIR) {
    const pairError: any = validatePairParticipant({
      participant,
      tournamentParticipants,
      pairOverride,
      allowDuplicateParticipantIdPairs,
      returnParticipant,
    });
    if (pairError?.earlyReturn) {
      const { earlyReturn: _, ...rest } = pairError;
      return rest;
    }
    if (pairError) return pairError;
  } else if (participantType === INDIVIDUAL) {
    if (!participant.person?.standardFamilyName || !participant.person?.standardGivenName)
      return { error: MISSING_PERSON_DETAILS };

    if (!participant.participantName) {
      participant.participantName = `${participant.person.standardGivenName} ${participant.person.standardFamilyName}`;
    }
  } else if (participantType && [TEAM, GROUP].includes(participantType)) {
    const teamError = validateTeamGroupParticipant({ participant, tournamentIndividualParticipantIds });
    if (teamError) return teamError;
  } else {
    return { error: INVALID_PARTICIPANT_TYPE };
  }

  tournamentRecord.participants?.push(participant);

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

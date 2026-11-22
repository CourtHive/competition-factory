import { coercePersonSex, isUnrecognizedSex, UNRECOGNIZED_SEX_INFO } from '@Helpers/coercedSex';
import { retiredParticipantCheck } from '@Query/participants/individualMerge/aliases';
import { indexParticipant, ParticipantsIndex } from './participantsIndex';
import { normalizePersonNames } from '@Helpers/normalizedPersonName';
import { decorateResult } from '@Functions/global/decorateResult';
import { definedAttributes } from '@Tools/definedAttributes';
import { planPairParticipant } from './planPairParticipant';
import { normalizeGender } from '@Helpers/coercedGender';
import { addNotice } from '@Global/state/globalState';
import { collapseWhitespace } from '@Tools/strings';
import { planFieldWrite } from '@Mutate/planCommit';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { planTeamColors } from './teamColors';
import { UUID } from '@Tools/UUID';

// constants and types
import { GROUP, INDIVIDUAL, PAIR, participantTypes, TEAM } from '@Constants/participantConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { ADD_PARTICIPANTS } from '@Constants/topicConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_PARTICIPANT_TYPE,
  MISSING_PARTICIPANT_ROLE,
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
  /** the record's participants indexed by a caller adding a batch (addParticipants); else the record is scanned */
  participantsIndex?: ParticipantsIndex;
};

function validateBaseParticipant(participant, participantId, tournamentRecord, participantsIndex?: ParticipantsIndex) {
  if (!participant) return { error: MISSING_PARTICIPANT };
  const idExists = participantsIndex
    ? participantsIndex.ids.has(participantId)
    : tournamentRecord.participants?.some((c) => c.participantId === participantId);
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

function validateTeamGroupParticipant({ participant, tournamentIndividualParticipantIds }) {
  const stack = 'addParticipant';

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
      if (!tournamentIndividualParticipantIds.has(individualParticipantId)) {
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

/** the record's individual participantIds: the batch's index when there is one, else a scan */
function individualIdsOf(tournamentParticipants: Participant[], participantsIndex?: ParticipantsIndex): Set<string> {
  return (
    participantsIndex?.individualIds ??
    new Set(tournamentParticipants.filter((tp) => tp.participantType === INDIVIDUAL).map((tp) => tp.participantId))
  );
}

type ParticipantPlan = {
  result: ReturnType<typeof definedAttributes>;
  writes?: (() => void)[];
  notice?: Parameters<typeof addNotice>[0];
  committedResult?: () => ReturnType<typeof definedAttributes>;
};

export function addParticipant(params: AddParticipantType) {
  const plan = planAddParticipant(params);
  for (const write of plan.writes ?? []) write();
  if (plan.notice) addNotice(plan.notice);
  return plan.committedResult?.() ?? plan.result;
}

export function planAddParticipant(params: AddParticipantType): ParticipantPlan {
  const stack = 'addParticipant';

  const { participantsIndex, returnParticipant, disableNotice, participant } = params;

  const tournamentRecord = params.tournamentId
    ? params.tournamentRecords?.[params.tournamentId]
    : (params.tournamentRecord ?? (params.activeTournamentId && params.tournamentRecords?.[params.activeTournamentId]));

  if (!tournamentRecord) return { result: { error: MISSING_TOURNAMENT_RECORD } };

  const colors = planTeamColors(participant?.teamColors, participant?.participantType);
  if (colors.error) return { result: colors };
  const suppliedId = participant?.participantId;
  const retired = participant && retiredParticipantCheck(tournamentRecord, suppliedId ? [suppliedId] : []);
  if (retired) return { result: decorateResult({ result: retired, stack }) };
  const participantId = suppliedId ?? (participant && UUID());
  const baseError = validateBaseParticipant(participant, participantId, tournamentRecord, participantsIndex);
  if (baseError) return { result: decorateResult({ result: baseError, stack }) };

  const writes: (() => void)[] = [];
  if (suppliedId == null) writes.push(planFieldWrite(participant, 'participantId', participantId));
  const list = tournamentRecord.participants;
  if (list == null) writes.push(planFieldWrite(tournamentRecord, 'participants', []));
  const name = participant.participantName && collapseWhitespace(participant.participantName);
  if (participant.participantName) writes.push(planFieldWrite(participant, 'participantName', name));

  const tournamentParticipants = tournamentRecord.participants ?? [];
  const early = planParticipantDetails({ params, tournamentParticipants, participant, name, writes });
  if (early) return early;

  if (colors.teamColors) writes.push(planFieldWrite(participant, 'teamColors', colors.teamColors));
  else
    writes.push(() => {
      delete participant.teamColors;
    });

  // A missing list is initialized in the original order. Append through the list installed by its setter.
  let stored: Participant;
  writes.push(() => {
    const target = list ?? tournamentRecord.participants!;
    const position = target.length;
    target.push(participant);
    stored = target[position];
    if (participantsIndex) indexParticipant(participantsIndex, stored, position);
  });

  const result = { ...SUCCESS };
  const committedResult = () =>
    definedAttributes({
      participant: returnParticipant && materialParticipant(participant, stored),
      ...SUCCESS,
    });
  const notice = disableNotice
    ? undefined
    : {
        payload: { tournamentId: tournamentRecord.tournamentId, participants: [participant] },
        topic: ADD_PARTICIPANTS,
      };
  return {
    writes,
    result,
    committedResult,
    notice,
  };
}

// Document arrays may cast a plain submission into a subdocument. Keep the submission's public
// shape (including application fields and hydrated inputs) while taking stored fields from the cast.
function materialParticipant(input, stored) {
  if (input === stored) return makeDeepCopy(input);
  const options = { transform: false, virtuals: false, getters: false };
  const hydratedInput = typeof input.toObject === 'function' && typeof input.$clone === 'function';
  const supplied = hydratedInput ? input.toObject(options) : input;
  const values = typeof stored.toObject === 'function' ? stored.toObject(options) : stored;
  let material = supplied;
  for (const key of Object.keys(supplied)) {
    if (Object.hasOwn(values, key) && stored[key] !== input[key]) {
      if (material === supplied) material = { ...supplied };
      material[key] = values[key];
    }
  }
  if (material === supplied) return makeDeepCopy(input);
  // A submitted document has a different public shape than the subdocument installed by the roster.
  // Initialize a detached clone with the committed data, without reapplying the submission's setters.
  if (hydratedInput) return makeDeepCopy(input.$clone().$init(material));
  return makeDeepCopy(material);
}

function planIndividual({ participant, name, writes }) {
  const { person } = participant;
  if (isUnrecognizedSex(person?.sex)) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: UNRECOGNIZED_SEX_INFO,
      context: { sex: person.sex },
      stack: 'addParticipant',
    });
  }
  const fields = {
    standardGivenName: person?.standardGivenName,
    standardFamilyName: person?.standardFamilyName,
  };
  normalizePersonNames(fields);
  const composed =
    fields.standardGivenName && fields.standardFamilyName && `${fields.standardGivenName} ${fields.standardFamilyName}`;
  const participantName = name || composed || participant.participantOtherName;
  if (!participantName) return { error: MISSING_PERSON_DETAILS };

  writes.push(() => {
    coercePersonSex(person);
    normalizePersonNames(person);
    // A hydrated setter can canonicalize either name. Compose from what the setters stored.
    if (!participant.participantName) {
      participant.participantName =
        person?.standardGivenName && person?.standardFamilyName
          ? `${person.standardGivenName} ${person.standardFamilyName}`
          : (participant.participantOtherName ?? '');
    }
  });
  return undefined;
}

function planParticipantDetails({ params, tournamentParticipants, participant, name, writes }) {
  const { participantType, person } = participant;
  const { allowDuplicateParticipantIdPairs, participantsIndex, pairOverride, returnParticipant } = params;

  if (participantType === PAIR) {
    const pair = planPairParticipant({
      participant: { person, individualParticipantIds: participant.individualParticipantIds, participantName: name },
      tournamentParticipants,
      participantsIndex,
      pairOverride,
      allowDuplicateParticipantIdPairs,
    });
    if (pair && 'existing' in pair) {
      const existing = pair.existing;
      const result = { ...SUCCESS, existingParticipant: true, participant: existing };
      return {
        writes,
        result,
        committedResult: () => ({ ...result, participant: returnParticipant && makeDeepCopy(existing) }),
      };
    }
    if (pair && 'error' in pair) return { result: pair };
    if (pair && 'participantName' in pair)
      writes.push(planFieldWrite(participant, 'participantName', pair.participantName));
  } else if (participantType === INDIVIDUAL) {
    const refusal = planIndividual({ participant, name, writes });
    if (refusal) return { result: refusal };
  } else if ([TEAM, GROUP].includes(participantType)) {
    const teamError = validateTeamGroupParticipant({
      participant,
      tournamentIndividualParticipantIds: individualIdsOf(tournamentParticipants, participantsIndex),
    });
    if (teamError) return { result: teamError };
    if (participant.gender) writes.push(planFieldWrite(participant, 'gender', normalizeGender(participant.gender)));
    if (participant.individualParticipantIds == null)
      writes.push(planFieldWrite(participant, 'individualParticipantIds', []));
  } else {
    return { result: { error: INVALID_PARTICIPANT_TYPE } };
  }

  return undefined;
}

import { generatePairParticipantName } from '@Functions/participants/generatePairParticipantName';
import { decorateResult } from '@Functions/global/decorateResult';
import { pairKey, ParticipantsIndex } from './participantsIndex';
import { intersection } from '@Tools/arrays';

// constants and types
import { INVALID_PARTICIPANT_IDS, INVALID_VALUES, MISSING_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import type { Participant } from '@Types/tournamentTypes';

export function planPairParticipant({
  participant,
  tournamentParticipants,
  participantsIndex,
  pairOverride,
  allowDuplicateParticipantIdPairs,
}: {
  participant: Pick<Participant, 'individualParticipantIds' | 'participantName' | 'person'>;
  tournamentParticipants: Participant[];
  participantsIndex?: ParticipantsIndex;
  pairOverride?: boolean;
  allowDuplicateParticipantIdPairs?: boolean;
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

  const individualParticipantIds =
    participantsIndex?.individualIds ??
    new Set(tournamentParticipants.filter((p) => p.participantType === INDIVIDUAL).map((p) => p.participantId));

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

  const existingPairParticipant = findExistingPair({ participant, tournamentParticipants, participantsIndex });

  if (existingPairParticipant && !allowDuplicateParticipantIdPairs) {
    return { existing: existingPairParticipant.participant };
  }

  if (!participant.participantName) {
    const individualParticipants = participantsIndex
      ? pairIndividualsInRecordOrder({ participant, tournamentParticipants, participantsIndex })
      : tournamentParticipants.filter((tp) => participant.individualParticipantIds?.includes(tp.participantId));

    return { participantName: generatePairParticipantName({ individualParticipants }) };
  }

  return undefined;
}

/**
 * The first PAIR in record order sharing two distinct individualParticipantIds with the participant. The index answers
 * when both pairs hold exactly two distinct ids (a pair with fewer can match nothing); otherwise the record is scanned.
 */
function findExistingPair({ participant, tournamentParticipants, participantsIndex }) {
  const distinct = new Set(participant.individualParticipantIds ?? []).size;
  if (participantsIndex && !participantsIndex.irregularPairs && distinct <= 2) {
    const key = pairKey(participant.individualParticipantIds);
    const existing = key ? participantsIndex.pairs.get(key) : undefined;
    return existing && { individualParticipantIds: existing.individualParticipantIds, participant: existing };
  }
  return tournamentParticipants
    .filter((p) => p.participantType === PAIR)
    .map((p) => ({ individualParticipantIds: p.individualParticipantIds, participant: p }))
    .find(
      (existing) => intersection(existing.individualParticipantIds, participant.individualParticipantIds).length === 2,
    );
}

/** the record's participants a pair names, in record order (each once, as a filter of the record gives them) */
function pairIndividualsInRecordOrder({ participant, tournamentParticipants, participantsIndex }) {
  const positions = [...new Set<string>(participant.individualParticipantIds ?? [])]
    .map((id) => participantsIndex.positions.get(id))
    .filter((position) => position !== undefined)
    .sort((a, b) => a - b);
  return positions.map((position) => tournamentParticipants[position]);
}

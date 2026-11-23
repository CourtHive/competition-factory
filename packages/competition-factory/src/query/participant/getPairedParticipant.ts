import { ParticipantLookup, pairMembersKey } from '@Query/participants/participantLookup';
import { decorateResult } from '@Functions/global/decorateResult';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { intersection } from '@Tools/arrays';

// constants and types
import { Participant, Tournament } from '@Types/tournamentTypes';
import { PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_PARTICIPANT_IDS,
  MISSING_PARTICIPANT_IDS,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type GetPairedParticipantArgs = {
  tournamentParticipants?: any[];
  tournamentRecord?: Tournament;
  participantIds: string[];
};

type GetPairedParticipantResult = {
  duplicatedPairParticipants?: any[];
  participant?: Participant;
  error?: ErrorType;
  success?: boolean;
};

export function getPairedParticipant({
  tournamentParticipants,
  tournamentRecord,
  participantIds,
}: GetPairedParticipantArgs): GetPairedParticipantResult {
  return findPairedParticipant({ tournamentParticipants, tournamentRecord, participantIds });
}

/**
 * `getPairedParticipant`, for a read that holds a lookup over the SAME participant list (`participantLookup`, see
 * participantLookup.ts): the pairs come from the lookup rather than from a scan of every participant. Without one,
 * or for ids the lookup has no key for, it scans. Not an engine method.
 */
export function findPairedParticipant({
  tournamentParticipants,
  participantLookup,
  tournamentRecord,
  participantIds,
}: GetPairedParticipantArgs & { participantLookup?: ParticipantLookup }): GetPairedParticipantResult {
  const stack = 'getPairedParticipant';

  if (!tournamentParticipants && !tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!Array.isArray(participantIds) || participantIds.length > 2) return { error: INVALID_PARTICIPANT_IDS };
  if (!participantIds.length)
    return decorateResult({
      result: { error: MISSING_PARTICIPANT_IDS },
      stack,
    });

  const candidates = tournamentParticipants ?? tournamentRecord?.participants ?? [];

  const membersKey = participantLookup && pairMembersKey(participantIds);
  const existingPairedParticipants = membersKey
    ? (participantLookup.pairsByMembers.get(membersKey) ?? [])
    : candidates.filter(
        (participant) =>
          participant.participantType === PAIR &&
          intersection(participantIds, participant.individualParticipantIds).length === participantIds.length &&
          participant.individualParticipantIds.length === participantIds.length,
      );
  const existingPairedParticipant = existingPairedParticipants[0];
  if (!existingPairedParticipant) {
    return decorateResult({ result: { error: PARTICIPANT_NOT_FOUND }, stack });
  }

  const duplicatedPairParticipants = makeDeepCopy(existingPairedParticipants.slice(1), false, true);

  return {
    participant: makeDeepCopy(existingPairedParticipant),
    duplicatedPairParticipants,
    ...SUCCESS,
  };
}

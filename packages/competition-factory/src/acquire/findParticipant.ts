import { getScaleValues } from '@Query/participant/getScaleValues';
import { attributeFilter } from '@Tools/attributeFilter';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import type { ParticipantLookup } from '@Query/participants/participantLookup';
import { ContextProfile, PolicyDefinitions } from '@Types/factoryTypes';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';
import { Participant } from '@Types/tournamentTypes';

type HydratedParticipant = {
  [key: string | number | symbol]: unknown;
} & Participant;

type FindParticipantArgs = {
  /** a lookup over `tournamentParticipants`, built in the same read: answers a find by `participantId` alone */
  participantLookup?: ParticipantLookup;
  tournamentParticipants: Participant[];
  policyDefinitions?: PolicyDefinitions;
  contextProfile?: ContextProfile;
  participantId?: string;
  internalUse?: boolean;
  personId?: string;
};

export function findParticipant({
  tournamentParticipants = [],
  policyDefinitions = {},
  participantLookup,
  contextProfile,
  participantId,
  internalUse,
  personId,
}: FindParticipantArgs): HydratedParticipant | undefined {
  // by id alone the scan answers the first participant holding it, which is what the lookup holds
  const foundParticipant =
    participantLookup && !personId && participantId && typeof participantId === 'string'
      ? participantLookup.firstById.get(participantId)
      : tournamentParticipants.find(
          (candidate) =>
            (participantId && candidate.participantId === participantId) ||
            (personId && candidate.person && candidate.person.personId === personId),
        );

  const participant = makeDeepCopy(foundParticipant, false, internalUse) as HydratedParticipant | undefined;

  if (participant) {
    const participantAttributes = policyDefinitions?.[POLICY_TYPE_PARTICIPANT];

    if (contextProfile?.withScaleValues) {
      const { ratings, rankings } = getScaleValues({ participant });
      participant.rankings = rankings;
      participant.ratings = ratings;
    }

    if (participantAttributes?.participant) {
      return attributeFilter({
        template: participantAttributes.participant,
        source: participant,
      });
    }
  }

  return participant;
}

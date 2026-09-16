import { idsShareIndividual } from '@Query/participants/individualParticipantIds';
import { pairingHash } from './generateCandidate';

type GetPairingsDataArgs = {
  // participantId -> individualParticipantIds; when absent, only self-pairing is excluded
  individualIdsMap?: Record<string, string[]>;
  participantIds: string[];
};

/**
 * Builds the pool of possible pairings for a round.
 *
 * A participant has never been a possible opponent for itself. A PAIR or TEAM that shares an
 * individual with another is the same disqualification partially applied — someone would be on both
 * sides of the matchUp — so it is excluded here rather than penalized later. Excluding at the pool
 * means no downstream mechanism (valueObjects, valueSortedPairings, generateCandidate) can select
 * an impossible pairing: `generateCandidate` minimizes over what it is given and always emits the
 * best available candidate, so a weight — however large — could only make such a pairing unlikely,
 * never impossible.
 */
export function getPairingsData({ participantIds, individualIdsMap }: GetPairingsDataArgs) {
  const possiblePairings = {};
  const uniquePairings: any = [];

  const canMeet = (a: string, b: string) =>
    a !== b && !(individualIdsMap && idsShareIndividual(individualIdsMap, a, b));

  participantIds.forEach((participantId) => {
    possiblePairings[participantId] = participantIds.filter((id) => canMeet(participantId, id));
    possiblePairings[participantId].forEach((id) => {
      const pairing = pairingHash(id, participantId);
      if (!uniquePairings.includes(pairing)) uniquePairings.push(pairing);
    });
  });

  const deltaObjects = Object.assign({}, ...uniquePairings.map((pairing) => ({ [pairing]: 0 })));
  return { uniquePairings, possiblePairings, deltaObjects };
}

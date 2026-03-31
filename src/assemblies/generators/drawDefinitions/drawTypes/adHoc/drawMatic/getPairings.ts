import { getParticipantPairingValues } from './getParticipantPairingValues';
import { generateCandidate } from './generateCandidate';
import { getSideRatings } from './getSideRatings';

export function getPairings(params) {
  const {
    tournamentParticipants,
    adHocRatings = {},
    possiblePairings, // participant keyed; provides array of possible opponents
    uniquePairings, // hashes of all possible participantId pairings
    maxIterations,
    minimizeDelta, // useful for the first round
    deltaObjects, // difference in rating between paired participants
    valueObjects, // calculated value of a pairing of participants, used for sorting pairings
    eventType,
    scaleName,
    salted,
  } = params;

  // modify valueObjects by ratings ratingsDifference squared
  // update deltaObjects to reflect the current difference between participant's ratings
  uniquePairings.forEach((pairing) => {
    const ratings = getSideRatings({
      tournamentParticipants,
      adHocRatings,
      scaleName,
      eventType,
      pairing,
    });

    const salting = (typeof salted === 'number' && salted) || 0.5;
     
    const rng = params.random ?? Math.random;
    const salt = (salted && (Math.round(rng()) ? salting : salting * -1)) || 0;
    const ratingsDifference = Math.abs(ratings[0] - ratings[1]) + salt;
    const pairingDelta = Math.abs(ratings[0] - ratings[1]);
    deltaObjects[pairing] = pairingDelta;

    if (!valueObjects[pairing]) valueObjects[pairing] = 0;
    valueObjects[pairing] += ratingsDifference ? Math.pow(ratingsDifference, 2) : 0;
  });

  /**
   * valueSortedPairings are uniquePairings sorted by the ratings difference of the pairings, lowest to highest
   */
  const valueSortedPairings = uniquePairings
    .map((pairing) => ({ pairing, value: valueObjects[pairing] }))
    .sort((a, b) => a.value - b.value);

  /**
   * pairingValues is keyed by participantId and provides a value-sorted array of pairings for each participantId
   * 'actorId': [
        { opponent: 'potentialId1', value: 1 },
        { opponent: 'potentialId2', value: 1 },
   */
  const { pairingValues } = getParticipantPairingValues({
    possiblePairings,
    valueObjects,
  });

  const { candidate, candidatesCount, deltaCandidate, iterations } = generateCandidate({
    random: params.random,
    valueSortedPairings,
    maxIterations,
    pairingValues,
    deltaObjects,
    valueObjects,
  });

  const { participantIdPairings } = minimizeDelta ? deltaCandidate : candidate;

  return {
    participantIdPairings,
    candidatesCount,
    deltaCandidate,
    iterations,
    candidate,
  };
}

import { chunkArray, randomPop, shuffleArray } from '@Tools/arrays';
import { stringSort } from '@Functions/sorters/stringSort';

type GenerateCandidateArgs = {
  valueSortedPairings: { [key: string]: number }[];
  deltaObjects: { [key: string]: number };
  valueObjects: { [key: string]: number };
  random?: () => number;
  maxIterations: number;
  pairingValues: any;
};

export function generateCandidate({
  maxIterations = 4000, // cap the processing intensity of the candidate generator
  valueSortedPairings, // pairings sorted by value from low to high
  pairingValues,
  valueObjects,
  deltaObjects,
  random,
}: GenerateCandidateArgs) {
  const rng = random ?? Math.random;
  const pairingValueMap = Object.assign({}, ...valueSortedPairings.map((rm) => ({ [rm.pairing]: rm.value })));

  const actors = Object.keys(pairingValues);
  let proposedCandidates: any[] = [];

  // generate an initial candidate value with no stipulated pairings
  const initialProposal = roundCandidate({
    actorsCount: actors.length,
    valueSortedPairings,
    pairingValueMap,
    deltaObjects,
    valueObjects,
    random,
  });

  const candidateHashes: any[] = [candidateHash(initialProposal)];
  proposedCandidates.push(initialProposal);
  let lowCandidateValue = initialProposal.value;
  let deltaCandidate = initialProposal;

  // iterations is the number of loops over valueSortedPairings
  let candidatesCount = 1; // initial proposal
  let iterations = 0;

  let opponentCount = actors.length;
  let calculatedIterations;

  // calculate the number of opponents to consider for each participantId
  do {
    opponentCount -= 1;
    calculatedIterations = actors.length * pairingValues[actors[0]].length;
  } while (calculatedIterations > maxIterations && opponentCount > 5);

  // keep track of proposed pairings
  const stipulatedPairs: string[] = [];

  // for each actor generate a roundCandidate using opponentCount of pairing values
  actors.forEach((actor) => {
    const participantIdPairings = pairingValues[actor];

    // opponentCount limits the number of opponents to consider
    participantIdPairings.slice(0, opponentCount).forEach((pairing) => {
      iterations += 1;
      const stipulatedPair = pairingHash(actor, pairing.opponent);

      if (!stipulatedPairs.includes(stipulatedPair)) {
        const proposed = roundCandidate({
          // each roundCandidate starts with stipulated pairings
          stipulated: [[actor, pairing.opponent]],
          actorsCount: actors.length,
          valueSortedPairings,
          pairingValueMap,
          deltaObjects,
          valueObjects,
          random,
        });

        // ensure no duplicate candidates are considered
        if (!candidateHashes.includes(candidateHash(proposed))) {
          candidateHashes.push(candidateHash(proposed));
          proposedCandidates.push(proposed);

          const { maxDelta, value } = proposed;

          if (maxDelta < deltaCandidate.maxDelta) deltaCandidate = proposed;

          if (
            value < lowCandidateValue ||
             
            (value === lowCandidateValue && Math.round(rng())) // randomize if equivalent values
          ) {
            lowCandidateValue = value;
          }

          stipulatedPairs.push(stipulatedPair);
          candidatesCount += 1;
        }
      }
    });
    proposedCandidates = proposedCandidates.filter((proposed) => Math.abs(proposed.value - lowCandidateValue) < 5);
  });

  proposedCandidates.sort((a, b) => a.maxDiff - b.maxDiff);
  const candidate = randomPop(proposedCandidates, random);

  return {
    candidatesCount,
    deltaCandidate,
    maxIterations,
    iterations,
    candidate,
  };
}

function candidateHash(candidate) {
  return candidate.participantIdPairings
    .map(({ participantIds }) => participantIds.sort().join('|'))
    .sort()
    .join('/');
}

type RoundCandiateArgs = {
  pairingValueMap: any;
  valueSortedPairings: any;
  random?: () => number;
  actorsCount: number;
  stipulated?: any[];
  deltaObjects: any;
  valueObjects: any;
};

function roundCandidate({
  valueSortedPairings,
  stipulated = [],
  pairingValueMap,
  deltaObjects,
  valueObjects,
  actorsCount,
  random,
}: RoundCandiateArgs) {
  const rng = random ?? Math.random;
  // roundPlayers starts with the stipulated pairing
  const roundPlayers: any[] = stipulated.flat();

  // aggregates the pairings generated for a roundCandidate
  const participantIdPairings: any[] = [];

  // candidateValue is the sum of all participantIdPairings in a roundCandidate
  // the winning candidate has the LOWEST total value
  let candidateValue = 0;

  // candidateValue is initialized with any stipulated pairings
  stipulated.filter(Boolean).forEach((participantIds) => {
    const [p1, p2] = participantIds;
    const pairing = pairingHash(p1, p2);
    const value = pairingValueMap[pairing];
    participantIdPairings.push({ participantIds, value });
    candidateValue += pairingValueMap[pairing];
  });

  // valueSortedPairings is an array sorted from lowest value to highest value
  // introduce random shuffling of chunks of valueSortedPairings
  const consideredPairings = chunkArray(valueSortedPairings, actorsCount).flatMap((pairings) =>
    shuffleArray(pairings, random).map((pairing) => ({
      ...pairing,

      value: pairing.value + rng() * Math.round(rng()),
    })),
  );

  // go through the valueSortedPairings (of all possible unique pairings)
  consideredPairings.forEach((rankedPairing) => {
    const participantIds = rankedPairing.pairing.split('|');
    const opponentExists = participantIds.reduce((p, c) => roundPlayers.includes(c) || p, false);

    if (!opponentExists) {
      roundPlayers.push(...participantIds);
      const value = rankedPairing.value;
      candidateValue += value;
      participantIdPairings.push({ participantIds, value });
    }
  });

  // sort the candidate's proposed pairings by value
  participantIdPairings.sort((a, b) => a.value - b.value);

  // determine the greatest delta in the candidate's pairings
  const maxDelta = participantIdPairings.reduce((p, c) => {
    const [p1, p2] = c.participantIds;
    const hash = pairingHash(p1, p2);
    const delta = deltaObjects[hash];
    return Math.max(delta, p);
  }, 0);

  // determine the greatest diff in the candidate's pairings
  const maxDiff = participantIdPairings.reduce((p, c) => {
    const [p1, p2] = c.participantIds;
    const hash = pairingHash(p1, p2);
    const diff = valueObjects[hash];
    return Math.max(diff, p);
  }, 0);

  return { value: candidateValue, participantIdPairings, maxDelta, maxDiff };
}

export function pairingHash(id1, id2) {
  return [id1, id2].sort(stringSort).join('|');
}

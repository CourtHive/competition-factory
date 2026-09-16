import { groupRounds } from '@Generators/drawDefinitions/drawTypes/roundRobin/roundRobinGroups';
import { idsShareIndividual } from '@Query/participants/individualParticipantIds';
import { generateRange } from '@Tools/arrays';

// constants and types
import { INVALID_VALUES, SHARED_INDIVIDUAL_PARTICIPANT } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

type GenerateRoundRobinPairingsArgs = {
  participantIds: string[];
  // 1 = single round robin, 2 = double (each pairing meets twice), 3 = triple, ...
  encounters?: number;
  // subsequent cycles swap side order, so a double round robin is home-and-home. Defaults to true.
  mirrored?: boolean;
  // truncates the schedule to its first N rounds — a partial round robin
  roundsCount?: number;
  // participantId -> individualParticipantIds; when supplied, entrants sharing an individual are refused
  individualIdsMap?: Record<string, string[]>;
};

export type PairingRound = string[][];

/**
 * Produces the pairing schedule for a round robin as rounds of participantId pairs.
 *
 * A round robin is a SHAPE applied by round generation, not a draw structure: every entrant meets every
 * other entrant once per encounter, over (entrants - 1) rounds per encounter. With an odd number of
 * entrants one participant sits out each round, which the circle method expresses as a bye position.
 *
 * The schedule itself comes from `groupRounds` — the same circle method the ROUND_ROBIN draw type uses to
 * order group matchUps — so both paths agree on which meetings belong to which round.
 */
export function generateRoundRobinPairings(
  params: GenerateRoundRobinPairingsArgs,
): ResultType & { rounds?: PairingRound[] } {
  const { participantIds, encounters = 1, mirrored = true, roundsCount } = params ?? {};

  if (!Array.isArray(participantIds) || participantIds.length < 2) {
    return { error: INVALID_VALUES, info: 'at least two participantIds are required' };
  }

  if (!Number.isInteger(encounters) || encounters < 1) {
    return { error: INVALID_VALUES, info: 'encounters must be a positive integer' };
  }

  // A round robin is every-entrant-meets-every-other. Two entrants sharing an individual can never
  // meet, so the shape is not partially unsatisfiable -- it is impossible -- and the request is
  // refused rather than silently reduced to the meetings that happen to be legal.
  const conflictingPairs = getConflictingPairs(participantIds, params.individualIdsMap);
  if (conflictingPairs.length) {
    return {
      error: SHARED_INDIVIDUAL_PARTICIPANT,
      info: 'a round robin requires every entrant to be able to meet every other entrant',
      context: { conflictingPairs },
    };
  }

  const roundsPerEncounter = participantIds.length - 1;
  const availableRounds = roundsPerEncounter * encounters;

  if (roundsCount !== undefined && (!Number.isInteger(roundsCount) || roundsCount < 1)) {
    return { error: INVALID_VALUES, info: 'roundsCount must be a positive integer' };
  }

  // an unsatisfiable request is reported, never quietly reduced to what happens to be possible
  if (roundsCount !== undefined && roundsCount > availableRounds) {
    return {
      error: INVALID_VALUES,
      info: 'roundsCount exceeds the rounds available for the requested encounters',
      context: { availableRounds, roundsPerEncounter, encounters, roundsCount },
    };
  }

  const positionRounds = groupRounds({ groupSize: participantIds.length, drawPositionOffset: 0 });

  const rounds = generateRange(0, encounters).flatMap((encounter) => {
    // groupPosition is 1-based; a pairing whose position exceeds the entrant count is a bye and is
    // already filtered out by groupRounds
    const swapSides = mirrored && encounter % 2 === 1;
    return positionRounds.map((positionRound) =>
      positionRound.map((hash) => {
        const pairing = hash.split('|').map((groupPosition) => participantIds[Number(groupPosition) - 1]);
        return swapSides ? [...pairing].reverse() : pairing;
      }),
    );
  });

  return { rounds: roundsCount ? rounds.slice(0, roundsCount) : rounds };
}

/**
 * Entrant pairs that share an individual and therefore can never meet.
 * Returns every offending pair, not the first, so a caller can report the whole problem at once.
 */
function getConflictingPairs(participantIds: string[], individualIdsMap?: Record<string, string[]>): string[][] {
  if (!individualIdsMap) return [];
  const conflicting: string[][] = [];
  for (let i = 0; i < participantIds.length; i++) {
    for (let j = i + 1; j < participantIds.length; j++) {
      if (idsShareIndividual(individualIdsMap, participantIds[i], participantIds[j])) {
        conflicting.push([participantIds[i], participantIds[j]]);
      }
    }
  }
  return conflicting;
}

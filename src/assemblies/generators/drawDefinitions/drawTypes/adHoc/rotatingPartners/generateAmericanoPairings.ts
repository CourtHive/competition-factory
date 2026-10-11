import { generateRoundRobinPairings } from '../roundRobinPairing/generateRoundRobinPairings';
import { createSeededRandom, randomSource } from '@Tools/prng';
import { validIndividualIds } from './rotatingPartnerTypes';

// constants and types
import type { RotatingPartnerRound, RotatingPartnerSide } from './rotatingPartnerTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';

type GenerateAmericanoPairingsArgs = {
  participantIds: string[];
  seed?: number;
  random?: () => number;
  roundsCount?: number;
};

/** Pure individual partnership rotation; match sides are memberships, not PAIR participant IDs. */
export function generateAmericanoPairings(params: GenerateAmericanoPairingsArgs): ResultType & {
  rounds?: RotatingPartnerRound[];
  expectedRounds?: number;
  completeCoverage?: boolean;
  seedUsed?: number;
  opponentBalance?: { minEncounters: number; maxEncounters: number; unseenPairs: number };
} {
  const { participantIds, roundsCount, seed } = params ?? {};
  if (!validIndividualIds(participantIds) || (seed !== undefined && !Number.isSafeInteger(seed))) {
    return {
      error: INVALID_VALUES,
      info: 'distinct individual IDs in multiples of four and an integer seed are required',
    };
  }

  const orderedIds = participantIds.toSorted((a, b) => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
  const seedUsed = seed ?? Math.floor((params.random ?? randomSource())() * 2 ** 32);
  const random = createSeededRandom(seedUsed);
  for (let i = orderedIds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [orderedIds[i], orderedIds[j]] = [orderedIds[j], orderedIds[i]];
  }

  const result = generateRoundRobinPairings({ participantIds: orderedIds, roundsCount });
  if (result.error) return { error: result.error, info: result.info, context: result.context };

  const opponents = new Map<string, Map<string, number>>();
  const rounds = (result.rounds ?? []).map((partnerships) => pairPartnerships(partnerships, opponents));
  const expectedRounds = participantIds.length - 1;
  const encounters = participantIds.flatMap((player, index) =>
    participantIds.slice(index + 1).map((opponent) => opponents.get(player)?.get(opponent) ?? 0),
  );
  const opponentBalance = {
    minEncounters: Math.min(...encounters),
    maxEncounters: Math.max(...encounters),
    unseenPairs: encounters.filter((count) => count === 0).length,
  };
  return { rounds, expectedRounds, seedUsed, opponentBalance, completeCoverage: rounds.length === expectedRounds };
}

function pairPartnerships(partnerships: string[][], opponents: Map<string, Map<string, number>>): RotatingPartnerRound {
  const remaining = partnerships.map(([a, b]): RotatingPartnerSide => [a, b]);
  const matches: RotatingPartnerRound = [];
  while (remaining.length) {
    const first = remaining.shift()!;
    let bestIndex = 0;
    let bestCost = Infinity;
    remaining.forEach((candidate, index) => {
      const cost = opponentCost(first, candidate, opponents);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    });
    const second = remaining.splice(bestIndex, 1)[0];
    matches.push([first, second]);
    recordOpponents(first, second, opponents);
  }
  return matches;
}

function opponentCost(
  a: RotatingPartnerSide,
  b: RotatingPartnerSide,
  opponents: Map<string, Map<string, number>>,
): number {
  let cost = 0;
  for (const player of a) {
    for (const opponent of b) {
      // Marginal squared encounter cost favors variety, without claiming global optimality.
      cost += 2 * (opponents.get(player)?.get(opponent) ?? 0) + 1;
    }
  }
  return cost;
}

function recordOpponents(a: RotatingPartnerSide, b: RotatingPartnerSide, opponents: Map<string, Map<string, number>>) {
  for (const [side, otherSide] of [
    [a, b],
    [b, a],
  ]) {
    for (const player of side) {
      const counts = opponents.get(player) ?? new Map<string, number>();
      for (const opponent of otherSide) counts.set(opponent, (counts.get(opponent) ?? 0) + 1);
      opponents.set(player, counts);
    }
  }
}

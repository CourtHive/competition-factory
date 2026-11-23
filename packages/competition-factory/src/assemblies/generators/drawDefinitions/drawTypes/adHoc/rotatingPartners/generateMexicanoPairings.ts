import { createSeededRandom, randomSource } from '@Tools/prng';
import { validIndividualIds } from './rotatingPartnerTypes';

// constants and types
import type { RotatingPartnerRound, RotatingPartnerStanding } from './rotatingPartnerTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';

type GenerateMexicanoPairingsArgs = {
  standings: RotatingPartnerStanding[];
  seed?: number;
  roundNumber?: number;
  random?: () => number;
};

/** Pure next-round pairing: adjacent standings groups, first/fourth versus second/third. */
export function generateMexicanoPairings(params: GenerateMexicanoPairingsArgs): ResultType & {
  round?: RotatingPartnerRound;
  orderedParticipantIds?: string[];
  seedUsed?: number;
  baseSeed?: number;
} {
  const { standings, seed, roundNumber } = params ?? {};
  if (
    !Array.isArray(standings) ||
    !validIndividualIds(standings.map((standing) => standing?.participantId)) ||
    !standings.every((standing) => Number.isSafeInteger(standing.pointsScored) && standing.pointsScored >= 0) ||
    (seed !== undefined && !Number.isSafeInteger(seed)) ||
    (roundNumber !== undefined && (!Number.isSafeInteger(roundNumber) || roundNumber < 1))
  ) {
    return {
      error: INVALID_VALUES,
      info: 'distinct individual standings in multiples of four with integer points are required',
    };
  }

  // Canonical input order makes equal-score pairing reproducible across callers.
  const ordered = [...standings].sort((a, b) =>
    a.participantId < b.participantId ? -1 : Number(a.participantId > b.participantId),
  );
  const baseSeed = seed ?? Math.floor((params.random ?? randomSource())() * 2 ** 32);
  const seedUsed = roundNumber === undefined ? baseSeed : deriveRoundSeed(baseSeed, roundNumber);
  const random = createSeededRandom(seedUsed);
  const tieOrder = new Map(ordered.map(({ participantId }) => [participantId, random()]));
  ordered.sort(
    (a, b) => b.pointsScored - a.pointsScored || tieOrder.get(a.participantId)! - tieOrder.get(b.participantId)!,
  );
  const orderedParticipantIds = ordered.map(({ participantId }) => participantId);
  const round: RotatingPartnerRound = [];
  for (let i = 0; i < ordered.length; i += 4) {
    const [a, b, c, d] = orderedParticipantIds.slice(i, i + 4);
    round.push([
      [a, d],
      [b, c],
    ]);
  }
  return { round, orderedParticipantIds, seedUsed, baseSeed };
}

// FNV-1a over the full integer values avoids discarding high bits before round mixing.
// This is a reproducibility key, not a cryptographic hash or a guarantee of distinct groupings.
function deriveRoundSeed(baseSeed: number, roundNumber: number): number {
  let hash = 2166136261;
  for (const character of `${baseSeed}:${roundNumber}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

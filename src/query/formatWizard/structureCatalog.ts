// constants and types
import { ConsolationAppetite, StructureKind, StructureRecommendation } from '@Types/formatWizardTypes';

const MIN_FLIGHT_SIZE = 2;
const ROUND_ROBIN_GROUP_SIZES = [4, 6, 8];
const SWISS_ROUND_VARIANTS = [3, 5, 7];
const DRAW_MATIC_ROUND_VARIANTS = [3, 5];

const APPETITE_KINDS: Record<ConsolationAppetite, StructureKind[]> = {
  NONE: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'DRAW_MATIC', 'LUCKY_DRAW'],
  LIGHT: [
    'SINGLE_ELIMINATION',
    'ROUND_ROBIN',
    'SWISS',
    'DRAW_MATIC',
    'LUCKY_DRAW',
    'FIRST_MATCH_LOSER_CONSOLATION',
    'ROUND_ROBIN_WITH_PLAYOFF',
    'DOUBLE_ELIMINATION',
  ],
  FULL: [
    'SINGLE_ELIMINATION',
    'ROUND_ROBIN',
    'SWISS',
    'DRAW_MATIC',
    'LUCKY_DRAW',
    'FIRST_MATCH_LOSER_CONSOLATION',
    'ROUND_ROBIN_WITH_PLAYOFF',
    'DOUBLE_ELIMINATION',
    'FIRST_ROUND_LOSER_CONSOLATION',
    'COMPASS',
    'ADAPTIVE',
    'STAGGERED_FRENCH',
  ],
};

const WITHDRAWAL_RISK: Record<StructureKind, number> = {
  ROUND_ROBIN: 0,
  ROUND_ROBIN_WITH_PLAYOFF: 0,
  SWISS: 0,
  SINGLE_ELIMINATION: 0,
  DOUBLE_ELIMINATION: 0.1,
  DRAW_MATIC: 0.1,
  STAGGERED_FRENCH: 0.1,
  LUCKY_DRAW: 0.1,
  FIRST_MATCH_LOSER_CONSOLATION: 0.2,
  FIRST_ROUND_LOSER_CONSOLATION: 0.25,
  COMPASS: 0.3,
  ADAPTIVE: 0.3,
};

function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// Effective min reflects the discount from withdrawal risk on
// consolation-bearing structures. The structural floor stays at
// minMatchesPerPlayer; the effective floor is what the TD should
// expect in practice.
function applyWithdrawalDiscount(min: number, kind: StructureKind, base: number): number {
  if (min <= base) return min;
  const above = min - base;
  return base + above * (1 - WITHDRAWAL_RISK[kind]);
}

function buildRecommendation(
  kind: StructureKind,
  minMatchesPerPlayer: number,
  totalMatches: number,
  base: number,
  extras: Partial<StructureRecommendation> = {},
): StructureRecommendation {
  return {
    effectiveMinMatchesPerPlayer: applyWithdrawalDiscount(minMatchesPerPlayer, kind, base),
    withdrawalRiskFactor: WITHDRAWAL_RISK[kind],
    minMatchesPerPlayer,
    totalMatches,
    kind,
    ...extras,
  };
}

function singleEliminationFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < MIN_FLIGHT_SIZE) return [];
  const padded = nextPowerOfTwo(flightSize);
  const totalMatches = flightSize - 1;
  const rounds = Math.max(1, Math.ceil(Math.log2(padded)));
  return [
    buildRecommendation('SINGLE_ELIMINATION', 1, totalMatches, 1),
    buildRecommendation('FIRST_MATCH_LOSER_CONSOLATION', 2, Math.round(totalMatches * 1.5), 1, { variantId: 'FMLC' }),
    buildRecommendation('FIRST_ROUND_LOSER_CONSOLATION', rounds, Math.round(totalMatches * 1.7), 1, {
      variantId: 'FRLC',
      rounds,
    }),
    buildRecommendation('DOUBLE_ELIMINATION', 2, totalMatches * 2 - 1, 1),
  ];
}

function compassFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize >= 7 && flightSize <= 8) {
    return [buildRecommendation('COMPASS', 3, 12, 1, { variantId: 'COMPASS_8' })];
  }
  if (flightSize >= 13 && flightSize <= 16) {
    return [buildRecommendation('COMPASS', 4, 28, 1, { variantId: 'COMPASS_16' })];
  }
  return [];
}

function roundRobinSingleGroup(flightSize: number): StructureRecommendation[] {
  if (flightSize < MIN_FLIGHT_SIZE || flightSize > 8) return [];
  const total = (flightSize * (flightSize - 1)) / 2;
  return [
    buildRecommendation('ROUND_ROBIN', flightSize - 1, total, flightSize - 1, {
      groupSize: flightSize,
    }),
  ];
}

function roundRobinMultiGroup(flightSize: number, groupSize: number): StructureRecommendation[] {
  if (flightSize < groupSize * 2 || flightSize % groupSize !== 0) return [];
  const groups = flightSize / groupSize;
  const groupTotal = (groupSize * (groupSize - 1)) / 2;
  const total = groupTotal * groups;
  const playoffSize = nextPowerOfTwo(groups);
  const playoffMatches = playoffSize - 1;
  return [
    buildRecommendation('ROUND_ROBIN', groupSize - 1, total, groupSize - 1, {
      variantId: `RR_${groupSize}x${groups}`,
      groupSize,
    }),
    buildRecommendation(
      'ROUND_ROBIN_WITH_PLAYOFF',
      groupSize - 1 + Math.max(0, Math.ceil(Math.log2(playoffSize))),
      total + playoffMatches,
      groupSize - 1,
      { variantId: `RR_${groupSize}x${groups}_PLAYOFF`, groupSize },
    ),
  ];
}

function roundRobinFamily(flightSize: number): StructureRecommendation[] {
  const multiGroup = ROUND_ROBIN_GROUP_SIZES.flatMap((groupSize) => roundRobinMultiGroup(flightSize, groupSize));
  return [...roundRobinSingleGroup(flightSize), ...multiGroup];
}

function swissFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < MIN_FLIGHT_SIZE) return [];
  const recommendedRounds = Math.max(3, Math.ceil(Math.log2(flightSize)));
  return SWISS_ROUND_VARIANTS.filter((rounds) => rounds <= flightSize - 1).map((rounds) => {
    const total = Math.floor((flightSize * rounds) / 2);
    return buildRecommendation('SWISS', rounds, total, rounds, {
      variantId: `SWISS_R${rounds}${rounds === recommendedRounds ? '_REC' : ''}`,
      rounds,
    });
  });
}

function drawMaticFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < MIN_FLIGHT_SIZE) return [];
  return DRAW_MATIC_ROUND_VARIANTS.filter((r) => r <= flightSize - 1).map((rounds) =>
    buildRecommendation('DRAW_MATIC', rounds, Math.floor((flightSize * rounds) / 2), rounds, {
      variantId: `DRAW_MATIC_R${rounds}`,
      rounds,
    }),
  );
}

function luckyDrawFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < MIN_FLIGHT_SIZE) return [];
  // Lucky Draw is the non-power-of-two-friendly alternative — most
  // useful when SE would need padding. For pow2 sizes it offers no
  // advantage over plain SE, so skip those.
  if (isPowerOfTwo(flightSize)) return [];
  const totalMatches = flightSize - 1;
  return [buildRecommendation('LUCKY_DRAW', 1, totalMatches, 1)];
}

function adaptiveFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < 4) return [];
  // Adaptive is a Lucky-Draw-rooted compass with cascading
  // consolations — the floor for matches per player is high but
  // withdrawals erode the effective floor more than for SE.
  const rounds = Math.max(2, Math.ceil(Math.log2(flightSize)));
  const totalMatches = Math.round(flightSize * 1.6);
  return [buildRecommendation('ADAPTIVE', rounds, totalMatches, 1)];
}

function staggeredFrenchFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < 8) return [];
  // French-style staggered SE: a single bracket with multiple entry
  // tiers. Min matches per player is 1 (top-tier seed loses their
  // first match and is out); the average across tiers is much
  // higher, but the floor metric is the conservative guarantee.
  const totalMatches = flightSize - 1;
  const rounds = Math.max(1, Math.ceil(Math.log2(flightSize)));
  return [
    buildRecommendation('STAGGERED_FRENCH', 1, totalMatches, 1, {
      rounds,
      variantId: `STAGGERED_${rounds}_TIERS`,
    }),
  ];
}

function recommendationsByKind(flightSize: number): StructureRecommendation[] {
  return [
    ...singleEliminationFamily(flightSize),
    ...compassFamily(flightSize),
    ...roundRobinFamily(flightSize),
    ...swissFamily(flightSize),
    ...drawMaticFamily(flightSize),
    ...luckyDrawFamily(flightSize),
    ...adaptiveFamily(flightSize),
    ...staggeredFrenchFamily(flightSize),
  ];
}

// Returns every structure recommendation eligible for a flight
// of `flightSize`, filtered by consolation appetite and (when
// supplied) the governance-allowed draw-type whitelist.
export function getStructureRecommendations({
  consolationAppetite = 'LIGHT',
  allowedDrawTypes,
  flightSize,
}: {
  consolationAppetite?: ConsolationAppetite;
  allowedDrawTypes?: string[];
  flightSize: number;
}): StructureRecommendation[] {
  const allowedKinds = new Set(APPETITE_KINDS[consolationAppetite]);
  const governanceAllowed = allowedDrawTypes && allowedDrawTypes.length > 0 ? new Set(allowedDrawTypes) : undefined;

  return recommendationsByKind(flightSize).filter((rec) => {
    if (!allowedKinds.has(rec.kind)) return false;
    if (governanceAllowed && !governanceAllowed.has(rec.kind)) return false;
    return true;
  });
}

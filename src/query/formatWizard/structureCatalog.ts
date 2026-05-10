// constants and types
import { ConsolationAppetite, StructureKind, StructureRecommendation } from '@Types/formatWizardTypes';

const MIN_FLIGHT_SIZE = 2;
const ROUND_ROBIN_GROUP_SIZES = [4, 6, 8];
const SWISS_ROUND_VARIANTS = [3, 5, 7];
const DRAW_MATIC_ROUND_VARIANTS = [3, 5];

// Voluntary-consolation modeling. The structural floor never moves
// (VC is opt-in), but estimated extra match volume is added to the
// total so utilization scoring stays honest. Conservative sign-up
// rate of 50% — empirically TDs see anywhere from 30–70%.
const VC_SIGNUP_RATE = 0.5;

const APPETITE_KINDS: Record<ConsolationAppetite, StructureKind[]> = {
  NONE: ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'DRAW_MATIC', 'LUCKY_DRAW', 'FEED_IN'],
  LIGHT: [
    'SINGLE_ELIMINATION',
    'ROUND_ROBIN',
    'SWISS',
    'DRAW_MATIC',
    'LUCKY_DRAW',
    'FEED_IN',
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
    'FEED_IN',
    'FIRST_MATCH_LOSER_CONSOLATION',
    'ROUND_ROBIN_WITH_PLAYOFF',
    'DOUBLE_ELIMINATION',
    'FIRST_ROUND_LOSER_CONSOLATION',
    'COMPASS',
    'ADAPTIVE',
  ],
};

const WITHDRAWAL_RISK: Record<StructureKind, number> = {
  ROUND_ROBIN: 0,
  ROUND_ROBIN_WITH_PLAYOFF: 0,
  SWISS: 0,
  SINGLE_ELIMINATION: 0,
  FEED_IN: 0.05,
  DOUBLE_ELIMINATION: 0.1,
  DRAW_MATIC: 0.1,
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

// minMatchesPerPlayer is the structural guarantee — the count every
// player gets when the bracket runs to completion (i.e., absent
// withdrawals). It is always an integer. Withdrawal risk is exposed
// separately via withdrawalRiskFactor so the caller can render a
// chip / warning rather than baking a fractional discount into the
// match-count number.
function buildRecommendation(
  kind: StructureKind,
  minMatchesPerPlayer: number,
  totalMatches: number,
  extras: Partial<StructureRecommendation> = {},
): StructureRecommendation {
  return {
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
    buildRecommendation('SINGLE_ELIMINATION', 1, totalMatches),
    buildRecommendation('FIRST_MATCH_LOSER_CONSOLATION', 2, Math.round(totalMatches * 1.5), { variantId: 'FMLC' }),
    buildRecommendation('FIRST_ROUND_LOSER_CONSOLATION', rounds, Math.round(totalMatches * 1.7), {
      variantId: 'FRLC',
      rounds,
    }),
    buildRecommendation('DOUBLE_ELIMINATION', 2, totalMatches * 2 - 1),
  ];
}

function compassFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize >= 7 && flightSize <= 8) {
    return [buildRecommendation('COMPASS', 3, 12, { variantId: 'COMPASS_8' })];
  }
  if (flightSize >= 13 && flightSize <= 16) {
    return [buildRecommendation('COMPASS', 4, 28, { variantId: 'COMPASS_16' })];
  }
  return [];
}

function roundRobinSingleGroup(flightSize: number): StructureRecommendation[] {
  if (flightSize < MIN_FLIGHT_SIZE || flightSize > 8) return [];
  const total = (flightSize * (flightSize - 1)) / 2;
  return [buildRecommendation('ROUND_ROBIN', flightSize - 1, total, { groupSize: flightSize })];
}

function roundRobinMultiGroup(flightSize: number, groupSize: number): StructureRecommendation[] {
  if (flightSize < groupSize * 2 || flightSize % groupSize !== 0) return [];
  const groups = flightSize / groupSize;
  const groupTotal = (groupSize * (groupSize - 1)) / 2;
  const total = groupTotal * groups;
  const playoffSize = nextPowerOfTwo(groups);
  const playoffMatches = playoffSize - 1;
  return [
    buildRecommendation('ROUND_ROBIN', groupSize - 1, total, {
      variantId: `RR_${groupSize}x${groups}`,
      groupSize,
    }),
    buildRecommendation(
      'ROUND_ROBIN_WITH_PLAYOFF',
      groupSize - 1 + Math.max(0, Math.ceil(Math.log2(playoffSize))),
      total + playoffMatches,
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
    return buildRecommendation('SWISS', rounds, total, {
      variantId: `SWISS_R${rounds}${rounds === recommendedRounds ? '_REC' : ''}`,
      rounds,
    });
  });
}

function drawMaticFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < MIN_FLIGHT_SIZE) return [];
  return DRAW_MATIC_ROUND_VARIANTS.filter((r) => r <= flightSize - 1).map((rounds) =>
    buildRecommendation('DRAW_MATIC', rounds, Math.floor((flightSize * rounds) / 2), {
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
  return [buildRecommendation('LUCKY_DRAW', 1, totalMatches)];
}

function adaptiveFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < 4) return [];
  // Adaptive is a Lucky-Draw-rooted compass with cascading
  // consolations.
  const rounds = Math.max(2, Math.ceil(Math.log2(flightSize)));
  const totalMatches = Math.round(flightSize * 1.6);
  return [buildRecommendation('ADAPTIVE', rounds, totalMatches)];
}

// FEED_IN — the connected-bracket "French staggered" archetype.
// One bracket, lowest-rated tiers play the early rounds, higher
// tiers feed in at later rounds. The wizard treats this as a
// SINGLE-FLIGHT-only structure (it IS the cross-tier bracket), so
// the catalog only emits it for whole-pool plans.
//
// Variants:
//   - FEED_IN              — bare feed-in, no consolation
//   - FIC_R16 / FIC_QF /
//     FIC_SF              — feed-in championship to round-of-N
//   - FIC                  — full feed-in championship (everyone
//                            plays to placement)
//   - MFIC                 — modified FIC (consolation truncated)
//
// FIC variants follow factory's drawDefinitionConstants family.
function feedInFamily(flightSize: number): StructureRecommendation[] {
  if (flightSize < 8) return [];
  const tiers = Math.max(2, Math.ceil(Math.log2(flightSize)));
  const baseTotal = flightSize - 1;
  const recs: StructureRecommendation[] = [
    buildRecommendation('FEED_IN', 1, baseTotal, {
      rounds: tiers,
      variantId: `FEED_IN_${tiers}_TIERS`,
    }),
  ];
  // FIC family — only emitted when consolationAppetite filtering
  // permits (caller handles); min matches per player rises with
  // consolation depth because more rounds get consolation matches.
  if (flightSize >= 8) {
    recs.push(
      buildRecommendation('FEED_IN', 2, Math.round(baseTotal * 1.4), {
        rounds: tiers,
        variantId: 'FIC_SF',
      }),
    );
  }
  if (flightSize >= 12) {
    recs.push(
      buildRecommendation('FEED_IN', 2, Math.round(baseTotal * 1.6), {
        rounds: tiers,
        variantId: 'FIC_QF',
      }),
    );
  }
  if (flightSize >= 16) {
    recs.push(
      buildRecommendation('FEED_IN', 3, Math.round(baseTotal * 1.8), {
        rounds: tiers,
        variantId: 'FIC_R16',
      }),
    );
    recs.push(
      buildRecommendation('FEED_IN', 3, Math.round(baseTotal * 2.0), {
        rounds: tiers,
        variantId: 'FIC',
      }),
    );
    recs.push(
      buildRecommendation('FEED_IN', 2, Math.round(baseTotal * 1.7), {
        rounds: tiers,
        variantId: 'MFIC',
      }),
    );
  }
  return recs;
}

// Adds the voluntary-consolation twin of every recommendation. VC
// is opt-in: the structural floor never moves, but the estimated
// extra match volume from VC sign-ups is folded into totalMatches
// so the utilization signal stays honest.
function withVoluntaryConsolation(recs: StructureRecommendation[], flightSize: number): StructureRecommendation[] {
  if (recs.length === 0 || flightSize < 4) return [];
  const expectedSignups = Math.max(2, Math.floor(flightSize * VC_SIGNUP_RATE));
  const vcBracketSize = nextPowerOfTwo(expectedSignups);
  const vcExtraMatches = Math.max(0, vcBracketSize - 1);
  return recs.map((rec) => ({
    ...rec,
    voluntaryConsolation: true,
    totalMatches: rec.totalMatches + vcExtraMatches,
    variantId: rec.variantId ? `${rec.variantId}_VC` : 'VC',
  }));
}

function recommendationsByKind(flightSize: number, singleFlight: boolean): StructureRecommendation[] {
  const recs: StructureRecommendation[] = [
    ...singleEliminationFamily(flightSize),
    ...compassFamily(flightSize),
    ...roundRobinFamily(flightSize),
    ...swissFamily(flightSize),
    ...drawMaticFamily(flightSize),
    ...luckyDrawFamily(flightSize),
    ...adaptiveFamily(flightSize),
  ];
  // FEED_IN is "the whole pool in one connected bracket". It only
  // makes sense for single-flight plans; multi-flight plans treat
  // each flight as an independent draw.
  if (singleFlight) recs.push(...feedInFamily(flightSize));
  return recs;
}

// Returns every structure recommendation eligible for a flight
// of `flightSize`, filtered by consolation appetite and (when
// supplied) the governance-allowed draw-type whitelist.
//
// `singleFlight` — when false, FEED_IN family is suppressed since
// it only models the single-bracket case.
// `voluntaryConsolation` — when true, every recommendation is
// emitted twice: once bare, once with a `_VC` variant whose total
// matches reflect the expected sign-up volume.
export function getStructureRecommendations({
  consolationAppetite = 'LIGHT',
  voluntaryConsolation = false,
  allowedDrawTypes,
  singleFlight = true,
  flightSize,
}: {
  consolationAppetite?: ConsolationAppetite;
  voluntaryConsolation?: boolean;
  allowedDrawTypes?: string[];
  singleFlight?: boolean;
  flightSize: number;
}): StructureRecommendation[] {
  const allowedKinds = new Set(APPETITE_KINDS[consolationAppetite]);
  const governanceAllowed = allowedDrawTypes && allowedDrawTypes.length > 0 ? new Set(allowedDrawTypes) : undefined;

  const base = recommendationsByKind(flightSize, singleFlight).filter((rec) => {
    if (!allowedKinds.has(rec.kind)) return false;
    if (governanceAllowed && !governanceAllowed.has(rec.kind)) return false;
    return true;
  });

  if (!voluntaryConsolation) return base;
  return [...base, ...withVoluntaryConsolation(base, flightSize)];
}

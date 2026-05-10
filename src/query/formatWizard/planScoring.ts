import { predictBandsFromDelta, PredictionModel } from '@Query/matchUp/competitiveBandsPrediction';
import { predictDrawCompetitiveBands } from '@Query/drawDefinition/predictDrawCompetitiveBands';

// constants and types
import {
  FlightStructure,
  FlightingStrategy,
  PlanWarning,
  RankedPlan,
  RankedPlanAggregate,
  StructureKind,
  StructureRecommendation,
  WizardConstraints,
  WizardFlight,
} from '@Types/formatWizardTypes';
import {
  ADAPTIVE,
  COMPASS,
  DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
  SWISS,
} from '@Constants/drawDefinitionConstants';

const DEFAULT_AVG_MINUTES = 90;
const DEFAULT_HOURS_PER_DAY = 8;
const HIGH_WITHDRAWAL_RISK_THRESHOLD = 0.2;

const KIND_TO_DRAW_TYPE: Partial<Record<StructureKind, string>> = {
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  DOUBLE_ELIMINATION,
  COMPASS,
  LUCKY_DRAW,
  ADAPTIVE,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SWISS,
};

const SCORE_WEIGHTS = {
  competitive: 60,
  floor: 20,
  utilization: 15,
  withdrawal: 5,
};

function predictBandsForFlight({
  predictionModel,
  structure,
  flight,
}: {
  structure: StructureRecommendation;
  flight: WizardFlight;
  predictionModel?: PredictionModel;
}): { competitive: number; decisive: number; routine: number } {
  const { kind } = structure;
  const ratings = flight.ratings;

  if (kind === 'DRAW_MATIC') {
    return predictDrawCompetitiveBands({ ratings, projectionMode: 'MIN_DELTA', predictionModel });
  }

  if (kind === 'FEED_IN') {
    // FEED_IN's whole point is balanced cross-tier matchups — model
    // it as the balanced-bracket projection, same as the prior
    // staggered family used.
    return predictDrawCompetitiveBands({ ratings, projectionMode: 'BALANCED_BRACKET', predictionModel });
  }

  const drawType = KIND_TO_DRAW_TYPE[kind];
  if (drawType) {
    return predictDrawCompetitiveBands({
      ratings,
      drawType,
      groupSize: structure.groupSize,
      predictionModel,
    });
  }

  // Fallback: pair each rating with itself (zero delta) — should
  // never trigger if the catalog and KIND_TO_DRAW_TYPE stay aligned.
  return predictBandsFromDelta(0, predictionModel ?? { competitiveAnchors: [], decisiveAnchors: [] });
}

function aggregateBands(flightStructures: FlightStructure[]): {
  competitive: number;
  decisive: number;
  routine: number;
  totalMatches: number;
} {
  const totals = flightStructures.reduce(
    (acc, fs) => {
      const matches = fs.structure.totalMatches;
      acc.competitive += fs.predictedBands.competitive * matches;
      acc.decisive += fs.predictedBands.decisive * matches;
      acc.routine += fs.predictedBands.routine * matches;
      acc.totalMatches += matches;
      return acc;
    },
    { competitive: 0, decisive: 0, routine: 0, totalMatches: 0 },
  );

  if (totals.totalMatches === 0) {
    return { competitive: 0, decisive: 0, routine: 0, totalMatches: 0 };
  }

  return {
    competitive: totals.competitive / totals.totalMatches,
    decisive: totals.decisive / totals.totalMatches,
    routine: totals.routine / totals.totalMatches,
    totalMatches: totals.totalMatches,
  };
}

function computeFloors(flightStructures: FlightStructure[]): { minMatchesPerPlayer: number } {
  if (flightStructures.length === 0) return { minMatchesPerPlayer: 0 };
  let min = Infinity;
  for (const fs of flightStructures) {
    if (fs.structure.minMatchesPerPlayer < min) min = fs.structure.minMatchesPerPlayer;
  }
  return { minMatchesPerPlayer: min };
}

function computeCourtUtilization(
  totalMatches: number,
  constraints: WizardConstraints,
): {
  courtHoursRequired: number;
  courtHoursAvailable: number;
  courtUtilization: number;
} {
  const avgMinutes = constraints.avgMinutes ?? DEFAULT_AVG_MINUTES;
  const hoursPerDay = constraints.hoursPerDay ?? DEFAULT_HOURS_PER_DAY;
  const courtHoursRequired = (totalMatches * avgMinutes) / 60;
  const courtHoursAvailable = constraints.courts * constraints.days * hoursPerDay;
  const courtUtilization = courtHoursAvailable > 0 ? courtHoursRequired / courtHoursAvailable : Infinity;
  return { courtHoursRequired, courtHoursAvailable, courtUtilization };
}

function buildWarnings({
  minMatchesPerPlayer,
  flightStructures,
  courtUtilization,
  constraints,
}: {
  flightStructures: FlightStructure[];
  minMatchesPerPlayer: number;
  courtUtilization: number;
  constraints: WizardConstraints;
}): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  if (
    typeof constraints.targetMatchesPerPlayer === 'number' &&
    minMatchesPerPlayer < constraints.targetMatchesPerPlayer
  ) {
    warnings.push('BELOW_FLOOR');
  }
  if (courtUtilization > 1) warnings.push('OVER_CAPACITY');
  if (flightStructures.some((fs) => fs.structure.withdrawalRiskFactor >= HIGH_WITHDRAWAL_RISK_THRESHOLD)) {
    warnings.push('WITHDRAWAL_RISK');
  }
  return warnings;
}

function competitiveDistance(target: number | undefined, actual: number): number {
  if (typeof target !== 'number') return actual;
  const distance = Math.abs(actual - target);
  return Math.max(0, 1 - distance);
}

// Score how close the plan's structural floor is to the TD's target.
// Plans at or above target score full marks for the floor component;
// plans below score linearly toward zero. Going above target is not
// penalized — utilization is the gating constraint when matches per
// player exceed the budget.
function floorScore(minMatchesPerPlayer: number, target: number | undefined): number {
  if (typeof target !== 'number') return 1;
  if (minMatchesPerPlayer >= target) return 1;
  return Math.max(0, minMatchesPerPlayer / target);
}

function utilizationScore(courtUtilization: number): number {
  if (!Number.isFinite(courtUtilization)) return 0;
  if (courtUtilization > 1) return Math.max(0, 2 - courtUtilization);
  return courtUtilization;
}

function withdrawalScore(flightStructures: FlightStructure[]): number {
  if (flightStructures.length === 0) return 1;
  const maxRisk = Math.max(...flightStructures.map((fs) => fs.structure.withdrawalRiskFactor));
  return 1 - maxRisk;
}

function compositeScore({
  minMatchesPerPlayer,
  flightStructures,
  courtUtilization,
  constraints,
  competitive,
}: {
  minMatchesPerPlayer: number;
  flightStructures: FlightStructure[];
  courtUtilization: number;
  constraints: WizardConstraints;
  competitive: number;
}): number {
  const competitiveComponent = competitiveDistance(constraints.targetCompetitivePct, competitive);
  const floorComponent = floorScore(minMatchesPerPlayer, constraints.targetMatchesPerPlayer);
  const utilComponent = utilizationScore(courtUtilization);
  const withdrawalComponent = withdrawalScore(flightStructures);

  const total =
    competitiveComponent * SCORE_WEIGHTS.competitive +
    floorComponent * SCORE_WEIGHTS.floor +
    utilComponent * SCORE_WEIGHTS.utilization +
    withdrawalComponent * SCORE_WEIGHTS.withdrawal;

  const max = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  return total / max;
}

// Builds one or more candidate plans by pairing each flight in the
// strategy with each eligible structure recommendation. The
// Cartesian product is intentional — different structures can be
// chosen per flight, but for Phase 1.A simplicity we apply the
// same structure across all flights of a strategy (one
// recommendation per plan). Per-flight structure mixing is a
// future refinement.
export function scorePlansForStrategy({
  recommendationsByFlightSize,
  predictionModel,
  constraints,
  strategy,
}: {
  recommendationsByFlightSize: (size: number, singleFlight: boolean) => StructureRecommendation[];
  predictionModel?: PredictionModel;
  constraints: WizardConstraints;
  strategy: FlightingStrategy;
}): Omit<RankedPlan, 'rank'>[] {
  if (strategy.flights.length === 0) return [];

  // Group flights by size — same-size flights can use the same
  // structure recommendation list, avoiding duplicate lookups.
  const isSingleFlight = strategy.flights.length === 1;
  const sizes = new Set(strategy.flights.map((f) => f.participantIds.length));
  const recsBySize = new Map<number, StructureRecommendation[]>();
  for (const size of sizes) recsBySize.set(size, recommendationsByFlightSize(size, isSingleFlight));

  // Find structures available to every flight (intersection by
  // kind+variantId), then build one plan per common structure.
  const commonRecs = intersectRecommendations(strategy.flights, recsBySize);
  const plans: Omit<RankedPlan, 'rank'>[] = [];

  for (const rec of commonRecs) {
    const flightStructures = strategy.flights.map<FlightStructure>((flight) => {
      const flightRec = recsBySize.get(flight.participantIds.length)!.find((r) => sameRecommendation(r, rec))!;
      return {
        predictedBands: predictBandsForFlight({ flight, structure: flightRec, predictionModel }),
        structure: flightRec,
        flight,
      };
    });

    const plan = assemblePlan({ strategy, flightStructures, constraints });
    plans.push(plan);
  }

  return plans;
}

function sameRecommendation(a: StructureRecommendation, b: StructureRecommendation): boolean {
  return a.kind === b.kind && (a.variantId ?? '') === (b.variantId ?? '') && (a.groupSize ?? 0) === (b.groupSize ?? 0);
}

function intersectRecommendations(
  flights: WizardFlight[],
  recsBySize: Map<number, StructureRecommendation[]>,
): StructureRecommendation[] {
  if (flights.length === 0) return [];
  const firstSize = flights[0].participantIds.length;
  const seed = recsBySize.get(firstSize) ?? [];

  return seed.filter((candidate) => {
    return flights.every((flight) => {
      const recs = recsBySize.get(flight.participantIds.length) ?? [];
      return recs.some((r) => sameRecommendation(r, candidate));
    });
  });
}

function assemblePlan({
  flightStructures,
  constraints,
  strategy,
}: {
  flightStructures: FlightStructure[];
  constraints: WizardConstraints;
  strategy: FlightingStrategy;
}): Omit<RankedPlan, 'rank'> {
  const aggregateBandsResult = aggregateBands(flightStructures);
  const floors = computeFloors(flightStructures);
  const utilization = computeCourtUtilization(aggregateBandsResult.totalMatches, constraints);

  const aggregate: RankedPlanAggregate = {
    minMatchesPerPlayer: floors.minMatchesPerPlayer,
    courtHoursRequired: utilization.courtHoursRequired,
    courtHoursAvailable: utilization.courtHoursAvailable,
    courtUtilization: utilization.courtUtilization,
    totalMatches: aggregateBandsResult.totalMatches,
    competitive: aggregateBandsResult.competitive,
    decisive: aggregateBandsResult.decisive,
    routine: aggregateBandsResult.routine,
  };

  const warnings = buildWarnings({
    minMatchesPerPlayer: floors.minMatchesPerPlayer,
    courtUtilization: utilization.courtUtilization,
    flightStructures,
    constraints,
  });

  const score = compositeScore({
    minMatchesPerPlayer: floors.minMatchesPerPlayer,
    courtUtilization: utilization.courtUtilization,
    competitive: aggregateBandsResult.competitive,
    flightStructures,
    constraints,
  });

  return {
    strategy: strategy.type,
    variant: strategy.variant,
    flightStructures,
    aggregate,
    warnings,
    score,
  };
}

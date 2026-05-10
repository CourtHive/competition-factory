// Types for the Format Wizard — a tournament-level engine that
// suggests level-based formats given a participant pool, TD
// constraints, and provider/governance caps. Singles only.

export type WizardParticipant = {
  participantId: string;
  rating: number;
  category?: string;
  gender?: string;
};

export type ConsolationAppetite = 'NONE' | 'LIGHT' | 'FULL';

export type WizardConstraints = {
  consolationAppetite?: ConsolationAppetite;
  allowCollapsedCategories?: boolean;
  voluntaryConsolation?: boolean;
  targetMatchesPerPlayer?: number;
  targetCompetitivePct?: number;
  allowMixedGender?: boolean;
  matchUpFormat?: string;
  hoursPerDay?: number;
  avgMinutes?: number;
  courts: number;
  days: number;
};

export type WizardGovernance = {
  allowedMatchUpFormats?: string[];
  allowedDrawTypes?: string[];
};

export type DistributionBin = {
  binStart: number;
  binEnd: number;
  count: number;
};

export type DistributionGap = {
  start: number;
  end: number;
  size: number;
};

export type RatingDistributionStats = {
  histogram: DistributionBin[];
  gaps: DistributionGap[];
  stddev: number;
  median: number;
  count: number;
  mean: number;
  iqr: number;
  min: number;
  max: number;
};

export type FlightingStrategyType = 'STAGGERED_SINGLE' | 'NATURAL_CLUSTER' | 'EQUAL_COUNT' | 'EQUAL_BAND';

export type WizardFlight = {
  participantIds: string[];
  ratings: number[];
  category?: string;
  gender?: string;
  label: string;
};

export type FlightingStrategy = {
  type: FlightingStrategyType;
  flights: WizardFlight[];
  variant?: string;
};

export type StructureKind =
  | 'FIRST_ROUND_LOSER_CONSOLATION'
  | 'FIRST_MATCH_LOSER_CONSOLATION'
  | 'ROUND_ROBIN_WITH_PLAYOFF'
  | 'DOUBLE_ELIMINATION'
  | 'SINGLE_ELIMINATION'
  | 'ROUND_ROBIN'
  | 'DRAW_MATIC'
  | 'LUCKY_DRAW'
  | 'ADAPTIVE'
  | 'COMPASS'
  | 'FEED_IN'
  | 'SWISS';

export type StructureRecommendation = {
  withdrawalRiskFactor: number;
  minMatchesPerPlayer: number;
  kind: StructureKind;
  totalMatches: number;
  voluntaryConsolation?: boolean;
  groupSize?: number;
  variantId?: string;
  rounds?: number;
};

export type FlightStructure = {
  predictedBands: { competitive: number; decisive: number; routine: number };
  structure: StructureRecommendation;
  flight: WizardFlight;
};

export type PlanWarning =
  | 'MIXED_GENDER_VARIANT'
  | 'COLLAPSED_CATEGORY'
  | 'WITHDRAWAL_RISK'
  | 'OVER_CAPACITY'
  | 'BELOW_FLOOR';

export type RankedPlanAggregate = {
  minMatchesPerPlayer: number;
  courtHoursAvailable: number;
  courtHoursRequired: number;
  courtUtilization: number;
  totalMatches: number;
  competitive: number;
  decisive: number;
  routine: number;
};

export type RankedPlan = {
  flightStructures: FlightStructure[];
  aggregate: RankedPlanAggregate;
  strategy: FlightingStrategyType;
  warnings: PlanWarning[];
  variant?: string;
  score: number;
  rank: number;
};

export type RejectedStrategy = {
  strategy: FlightingStrategyType;
  reason: string;
};

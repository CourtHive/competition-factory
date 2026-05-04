import { computeRatingDistributionStats } from './distributionStats';
import { generateFlightingStrategies } from './flightingStrategies';
import { getStructureRecommendations } from './structureCatalog';
import { scorePlansForStrategy } from './planScoring';
import { findPolicy } from '@Acquire/findPolicy';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { PredictionModel } from '@Query/matchUp/competitiveBandsPrediction';
import {
  RankedPlan,
  RatingDistributionStats,
  RejectedStrategy,
  StructureRecommendation,
  WizardConstraints,
  WizardGovernance,
  WizardParticipant,
} from '@Types/formatWizardTypes';
import { Tournament } from '@Types/tournamentTypes';

// Fixtures
import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';

const DEFAULT_PREDICTION_MODEL: PredictionModel =
  POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS].predictionModel;

type SuggestFormatPlansArgs = {
  predictionModel?: PredictionModel;
  tournamentRecord?: Tournament;
  participants: WizardParticipant[];
  governance?: WizardGovernance;
  constraints: WizardConstraints;
};

type SuggestFormatPlansResult = {
  rejected?: RejectedStrategy[];
  distribution: RatingDistributionStats;
  plans: RankedPlan[];
  error?: ErrorType;
};

const EMPTY_DISTRIBUTION: RatingDistributionStats = {
  histogram: [],
  count: 0,
  stddev: 0,
  median: 0,
  mean: 0,
  iqr: 0,
  min: 0,
  max: 0,
  gaps: [],
};

function resolvePredictionModel(
  predictionModel: PredictionModel | undefined,
  tournamentRecord: Tournament | undefined,
): PredictionModel {
  if (predictionModel) return predictionModel;

  if (tournamentRecord) {
    const { policy } = findPolicy({
      policyType: POLICY_TYPE_COMPETITIVE_BANDS,
      tournamentRecord,
    });
    if (policy?.predictionModel) return policy.predictionModel;
  }

  return DEFAULT_PREDICTION_MODEL;
}

function rankPlans(plans: Omit<RankedPlan, 'rank'>[]): RankedPlan[] {
  const sorted = [...plans].sort((a, b) => b.score - a.score);
  return sorted.map((plan, index) => ({ ...plan, rank: index + 1 }));
}

// Tournament-level entry point. Pure read query: takes a
// participant pool, TD constraints, and optional governance caps;
// returns a ranked table of plan candidates plus the rating
// distribution stats used as input to the strategies.
//
// Singles only. Gender / category segregation is the caller's
// responsibility — filter `participants` upstream and run the
// engine multiple times to compare segregated plans.
export function suggestFormatPlans({
  predictionModel,
  tournamentRecord,
  participants,
  governance,
  constraints,
}: SuggestFormatPlansArgs): SuggestFormatPlansResult {
  if (!Array.isArray(participants) || participants.length < 2) {
    return { plans: [], distribution: EMPTY_DISTRIBUTION, error: INVALID_VALUES };
  }
  if (!constraints || typeof constraints.courts !== 'number' || typeof constraints.days !== 'number') {
    return { plans: [], distribution: EMPTY_DISTRIBUTION, error: INVALID_VALUES };
  }

  const ratings = participants.map((p) => p.rating);
  const distribution = computeRatingDistributionStats({ ratings });
  const strategies = generateFlightingStrategies(participants);
  const resolvedModel = resolvePredictionModel(predictionModel, tournamentRecord);

  const recommendationsByFlightSize = (size: number): StructureRecommendation[] =>
    getStructureRecommendations({
      consolationAppetite: constraints.consolationAppetite,
      allowedDrawTypes: governance?.allowedDrawTypes,
      flightSize: size,
    });

  const rejected: RejectedStrategy[] = [];
  const allPlans: Omit<RankedPlan, 'rank'>[] = [];

  for (const strategy of strategies) {
    const planCandidates = scorePlansForStrategy({
      recommendationsByFlightSize,
      predictionModel: resolvedModel,
      constraints,
      strategy,
    });

    if (planCandidates.length === 0) {
      rejected.push({ strategy: strategy.type, reason: 'NO_ELIGIBLE_STRUCTURE' });
      continue;
    }
    allPlans.push(...planCandidates);
  }

  return {
    rejected: rejected.length > 0 ? rejected : undefined,
    plans: rankPlans(allPlans),
    distribution,
  };
}

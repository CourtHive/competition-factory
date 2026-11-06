// Types
import type { CompetitionPolicy } from '@Types/competitionPolicyTypes';

type ActualOutputArgs = {
  pointsWon: number;
  pointsLost: number;
  competitionPolicy: CompetitionPolicy;
};

/**
 * Computes the actual output (0-1) for a participant in a matchUp.
 * POINT_SHARE: pointsWon / totalPoints
 * WEIGHTED: weighted combination of point share, normalized differential, and context factor
 */
export function computeActualOutput({ pointsWon, pointsLost, competitionPolicy }: ActualOutputArgs): number {
  const totalPoints = pointsWon + pointsLost;
  if (totalPoints === 0) return 0.5; // no data — assume even

  const pointShare = pointsWon / totalPoints;
  const pressureConfig = competitionPolicy.ratingPolicy.pressureRating;

  if (!pressureConfig || pressureConfig.actualOutputMethod === 'POINT_SHARE') {
    return pointShare;
  }

  // WEIGHTED mode
  const weights = pressureConfig.weights ?? { pointShare: 1 };
  const normalizedDifferential = (pointsWon - pointsLost) / totalPoints;
  // Context factor is a future extension point
  const contextFactor = 0;

  const w1 = weights.pointShare ?? 1;
  const w2 = weights.pointDifferential ?? 0;
  const w3 = weights.contextFactor ?? 0;
  const totalWeight = w1 + w2 + w3;

  if (totalWeight === 0) return pointShare;

  return (w1 * pointShare + w2 * normalizedDifferential + w3 * contextFactor) / totalWeight;
}

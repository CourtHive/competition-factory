import { LINEAR_DECAY, NO_DECAY, STEPPED_DECAY } from '@Constants/rankingConstants';
import type { AggregationRules, RankingListAward } from '@Types/rankingTypes';

const DAY_MS = 86_400_000;

// Every numeric point field an award carries. Decay scales all of them by the
// same factor so `points` still equals the sum of the granular components and a
// bucket summing either form reports the same total.
const DECAYED_FIELDS = ['points', 'positionPoints', 'perWinPoints', 'bonusPoints', 'qualityWinPoints', 'linePoints'];

type DecayRules = Pick<AggregationRules, 'decayFunction' | 'decaySteps' | 'rollingPeriodDays'>;

/**
 * The multiplier an award of `ageDays` receives under the policy's decay rules.
 *
 * - `linear`: full value at age 0, falling to 0 at the edge of the rolling
 *   window. Undefined without `rollingPeriodDays` — a line needs an end — so
 *   the factor is 1 rather than an invented slope.
 * - `stepped`: the multiplier of the largest `afterDays` the award has reached;
 *   1 until the first step.
 * - `none` / absent: 1.
 */
export function getDecayFactor(ageDays: number, rules: DecayRules): number {
  const { decayFunction, decaySteps, rollingPeriodDays } = rules;
  if (ageDays <= 0) return 1;

  if (decayFunction === LINEAR_DECAY) {
    if (!rollingPeriodDays || rollingPeriodDays <= 0) return 1;
    return Math.max(0, 1 - ageDays / rollingPeriodDays);
  }

  if (decayFunction === STEPPED_DECAY && decaySteps?.length) {
    let factor = 1;
    let reached = -Infinity;
    for (const step of decaySteps) {
      if (ageDays >= step.afterDays && step.afterDays > reached) {
        reached = step.afterDays;
        factor = step.multiplier;
      }
    }
    return factor;
  }

  return 1;
}

/**
 * Apply the policy's point decay to awards, relative to `asOfDate`.
 *
 * Returns new award objects; the inputs are not mutated. An award with no
 * `endDate`, or a list with no `asOfDate`, has no age and is left at full
 * value. A decayed award records its `decayFactor` so a list can explain why
 * a result counts for less than it was awarded.
 */
export function applyPointDecay(
  awards: RankingListAward[],
  rules: DecayRules,
  asOfDate: string | undefined,
): RankingListAward[] {
  if (!asOfDate || !rules.decayFunction || rules.decayFunction === NO_DECAY) return awards;
  const asOfTime = new Date(asOfDate).getTime();
  if (Number.isNaN(asOfTime)) return awards;

  return awards.map((award) => {
    if (!award.endDate) return award;
    const endTime = new Date(award.endDate).getTime();
    if (Number.isNaN(endTime)) return award;

    const factor = getDecayFactor((asOfTime - endTime) / DAY_MS, rules);
    if (factor === 1) return award;

    const decayed: RankingListAward = { ...award, decayFactor: factor };
    for (const field of DECAYED_FIELDS) {
      if (typeof award[field] === 'number') decayed[field] = award[field] * factor;
    }
    return decayed;
  });
}

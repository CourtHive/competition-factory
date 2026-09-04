import type { RankingListAward, MandatoryRule } from '@Types/rankingTypes';

export type ScoredAward = {
  award: RankingListAward;
  value: number;
};

type ProcessBucketResultsArgs = {
  awards: RankingListAward[];
  pointComponents: string[];
  bestOfCount: number;
  maxResultsPerLevel?: Record<number, number>;
  mandatoryRules?: MandatoryRule[];
};

export function processBucketResults({
  awards,
  pointComponents,
  bestOfCount,
  maxResultsPerLevel,
  mandatoryRules,
}: ProcessBucketResultsArgs): {
  counting: ScoredAward[];
  dropped: ScoredAward[];
  bucketTotal: number;
} {
  // 1. Score each award by summing pointComponents
  const scoredAwards: ScoredAward[] = awards.map((a) => {
    let value = 0;
    for (const component of pointComponents) {
      value += typeof a[component] === 'number' ? a[component] : 0;
    }
    return { award: a, value };
  });

  // 2. Sort descending by score
  scoredAwards.sort((a, b) => b.value - a.value);

  // 3. Apply maxResultsPerLevel caps
  let capped = scoredAwards;
  let levelDropped: ScoredAward[] = [];
  if (maxResultsPerLevel) {
    const levelCounts: Record<number, number> = {};
    capped = [];
    for (const sa of scoredAwards) {
      const lvl = sa.award.level;
      if (lvl === undefined || !maxResultsPerLevel[lvl]) {
        capped.push(sa);
      } else {
        levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
        if (levelCounts[lvl] <= maxResultsPerLevel[lvl]) {
          capped.push(sa);
        } else {
          levelDropped.push(sa);
        }
      }
    }
  }

  // 4. Mandatory selection + optional fill
  if (mandatoryRules?.length) {
    return processMandatory(capped, levelDropped, bestOfCount, mandatoryRules);
  }

  // No mandatory rules — standard bestOfCount
  const counting = bestOfCount > 0 ? capped.slice(0, bestOfCount) : capped;
  const dropped = [...(bestOfCount > 0 ? capped.slice(bestOfCount) : []), ...levelDropped];
  const bucketTotal = counting.reduce((sum, sa) => sum + sa.value, 0);

  return { counting, dropped, bucketTotal };
}

function processMandatory(
  capped: ScoredAward[],
  levelDropped: ScoredAward[],
  bestOfCount: number,
  mandatoryRules: MandatoryRule[],
): {
  counting: ScoredAward[];
  dropped: ScoredAward[];
  bucketTotal: number;
} {
  // Build set of indices already claimed by mandatory rules
  const mandatoryIndices = new Set<number>();

  for (const rule of mandatoryRules) {
    const levelSet = new Set(rule.levels);

    // Collect indices of matching awards (already sorted descending by value)
    const matchingIndices: number[] = [];
    for (let i = 0; i < capped.length; i++) {
      const lvl = capped[i].award.level;
      if (lvl !== undefined && levelSet.has(lvl)) {
        matchingIndices.push(i);
      }
    }

    // If rule has bestOfCount, take only best N; otherwise all
    const selected = rule.bestOfCount ? matchingIndices.slice(0, rule.bestOfCount) : matchingIndices;
    for (const idx of selected) {
      mandatoryIndices.add(idx);
    }
  }

  // Separate mandatory counting from remaining pool
  const mandatoryCounting: ScoredAward[] = [];
  const remaining: ScoredAward[] = [];

  for (let i = 0; i < capped.length; i++) {
    if (mandatoryIndices.has(i)) {
      mandatoryCounting.push(capped[i]);
    } else {
      remaining.push(capped[i]);
    }
  }

  // Fill optional slots: remaining capacity after mandatory results
  let optionalCounting: ScoredAward[];
  let optionalDropped: ScoredAward[];

  if (bestOfCount > 0) {
    const optionalSlots = Math.max(0, bestOfCount - mandatoryCounting.length);
    optionalCounting = remaining.slice(0, optionalSlots);
    optionalDropped = remaining.slice(optionalSlots);
  } else {
    // bestOfCount=0 means count all
    optionalCounting = remaining;
    optionalDropped = [];
  }

  const counting = [...mandatoryCounting, ...optionalCounting];
  const dropped = [...optionalDropped, ...levelDropped];
  const bucketTotal = counting.reduce((sum, sa) => sum + sa.value, 0);

  return { counting, dropped, bucketTotal };
}

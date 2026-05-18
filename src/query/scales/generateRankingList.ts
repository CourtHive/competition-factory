import { processBucketResults, type ScoredAward } from './processBucketResults';
import type {
  CategoryAggregationRule,
  CategoryScope,
  DoublesAttribution,
  MandatoryRule,
  PointComponent,
  PointPoolModel,
  SourceFilter,
  TiebreakCriterion,
} from '@Types/rankingTypes';

type PointAward = Record<string, any>;

type CountingBucket = {
  bucketName: string;
  eventTypes?: string[];
  pointComponents: string[];
  bestOfCount: number;
  maxResultsPerLevel?: Record<number, number>;
  mandatoryRules?: MandatoryRule[];
};

type AggregationRules = {
  rollingPeriodDays?: number;
  separateByGender?: boolean;
  perCategory?: boolean;
  countingBuckets?: CountingBucket[];
  tiebreakCriteria?: TiebreakCriterion[];
  minCountableResults?: number;
  maxResultsPerLevel?: Record<number, number>;
  bestOfCount?: number;
  doublesAttribution?: DoublesAttribution;
  categoryAggregation?: CategoryAggregationRule[];
};

type CategoryFilter = {
  ageCategoryCodes?: string[];
  genders?: string[];
  eventTypes?: string[];
};

export type RankingListEntry = {
  personId: string;
  totalPoints: number;
  rank: number;
  meetsMinimum: boolean;
  countingResults: PointAward[];
  droppedResults: PointAward[];
  bucketBreakdown?: {
    bucketName: string;
    countingResults: PointAward[];
    droppedResults: PointAward[];
    bucketTotal: number;
  }[];
};

type GenerateRankingListArgs = {
  pointAwards: PointAward[];
  aggregationRules?: AggregationRules;
  categoryFilter?: CategoryFilter;
  asOfDate?: string;
  /**
   * Per RankingPolicy.pointPoolModel:
   * - 'per-category' (default): apply categoryFilter + categoryAggregation rules.
   * - 'shared': skip categoryAggregation entirely; categoryFilter still applies
   *   as an eligibility filter on the same pool.
   */
  pointPoolModel?: PointPoolModel;
};

export function generateRankingList({
  pointAwards,
  aggregationRules = {},
  categoryFilter,
  asOfDate,
  pointPoolModel = 'per-category',
}: GenerateRankingListArgs): RankingListEntry[] {
  const {
    rollingPeriodDays,
    countingBuckets,
    tiebreakCriteria = [],
    minCountableResults = 0,
    maxResultsPerLevel,
    bestOfCount,
    categoryAggregation = [],
  } = aggregationRules;

  // Native awards — those matching the categoryFilter directly.
  const nativeFiltered = filterAwards(pointAwards, categoryFilter, rollingPeriodDays, asOfDate);
  const nativeByPerson = groupByPerson(nativeFiltered);

  // Carried contributions from categoryAggregation rules whose target matches
  // the categoryFilter. Skipped entirely under shared-pool model.
  const carriedByPerson: Record<string, PointAward[]> =
    pointPoolModel === 'shared'
      ? {}
      : expandCarriedContributions({
          pointAwards,
          rules: categoryAggregation,
          categoryFilter,
          rollingPeriodDays,
          asOfDate,
        });

  // Participation gating — only meaningful under 'per-category'.
  const eligiblePersonIds = applyParticipationGating({
    nativeByPerson,
    carriedByPerson,
    rules: pointPoolModel === 'shared' ? [] : categoryAggregation,
    categoryFilter,
  });

  // Compute per-person entries on the combined bag.
  const entries: RankingListEntry[] = [];
  for (const personId of eligiblePersonIds) {
    const native = nativeByPerson[personId] ?? [];
    const carried = carriedByPerson[personId] ?? [];
    const entry = computePersonEntry({
      countingBuckets,
      minCountableResults,
      maxResultsPerLevel,
      bestOfCount,
      personId,
      awards: [...native, ...carried],
    });
    entries.push(entry);
  }

  sortAndRankEntries(entries, tiebreakCriteria);

  return entries;
}

function filterAwards(
  pointAwards: PointAward[],
  categoryFilter: CategoryFilter | undefined,
  rollingPeriodDays: number | undefined,
  asOfDate: string | undefined,
): PointAward[] {
  let filtered = pointAwards;

  if (categoryFilter) {
    filtered = filtered.filter((award) => {
      if (categoryFilter.ageCategoryCodes?.length) {
        const code = award.category?.ageCategoryCode;
        if (!code || !categoryFilter.ageCategoryCodes.includes(code)) return false;
      }
      if (categoryFilter.genders?.length) {
        const gender = award.category?.gender || award.gender;
        if (!gender || !categoryFilter.genders.includes(gender)) return false;
      }
      return !(
        categoryFilter.eventTypes?.length &&
        (!award.eventType || !categoryFilter.eventTypes.includes(award.eventType))
      );
    });
  }

  if (rollingPeriodDays && asOfDate) {
    const cutoff = new Date(asOfDate);
    cutoff.setDate(cutoff.getDate() - rollingPeriodDays);
    const cutoffTime = cutoff.getTime();
    filtered = filtered.filter((award) => !award.endDate || new Date(award.endDate).getTime() >= cutoffTime);
  }

  return filtered;
}

function groupByPerson(filtered: PointAward[]): Record<string, PointAward[]> {
  const byPerson: Record<string, PointAward[]> = {};
  for (const award of filtered) {
    const key = award.personId;
    if (!key) continue;
    if (!byPerson[key]) byPerson[key] = [];
    byPerson[key].push(award);
  }
  return byPerson;
}

// ─── Cross-category aggregation ──────────────────────────────────────

function expandCarriedContributions({
  pointAwards,
  rules,
  categoryFilter,
  rollingPeriodDays,
  asOfDate,
}: {
  pointAwards: PointAward[];
  rules: CategoryAggregationRule[];
  categoryFilter: CategoryFilter | undefined;
  rollingPeriodDays: number | undefined;
  asOfDate: string | undefined;
}): Record<string, PointAward[]> {
  const carriedByPerson: Record<string, PointAward[]> = {};
  if (!rules.length) return carriedByPerson;

  for (const rule of rules) {
    if (!ruleTargetMatchesFilter(rule.target, categoryFilter)) continue;

    // Collect source awards: match rule.source AND survive excludedSourceFilters.
    const sourceAwards = pointAwards.filter(
      (a) => awardMatchesScope(a, rule.source) && !sourceFilterDisqualifies(a, rule.excludedSourceFilters),
    );

    // Apply rolling window before per-person grouping.
    const inWindow = applyRollingWindow(sourceAwards, rollingPeriodDays, asOfDate);

    // Group, multiply, cap per (personId, rule).
    const perPersonForRule: Record<string, PointAward[]> = {};
    for (const award of inWindow) {
      const personId = award.personId;
      if (!personId) continue;
      const carried = buildCarriedAward(award, rule);
      if (!perPersonForRule[personId]) perPersonForRule[personId] = [];
      perPersonForRule[personId].push(carried);
    }

    // Apply maxCarriedResults cap — keep top-N by `points` per person per rule.
    for (const [personId, carriedAwards] of Object.entries(perPersonForRule)) {
      const ranked = [...carriedAwards].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const capped = rule.maxCarriedResults ? ranked.slice(0, rule.maxCarriedResults) : ranked;
      if (!carriedByPerson[personId]) carriedByPerson[personId] = [];
      carriedByPerson[personId].push(...capped);
    }
  }

  return carriedByPerson;
}

function ruleTargetMatchesFilter(target: CategoryScope, categoryFilter: CategoryFilter | undefined): boolean {
  if (!categoryFilter) return true; // No filter means the rule applies wherever.
  const ageOverlap =
    !categoryFilter.ageCategoryCodes?.length ||
    !target.ageCategoryCodes?.length ||
    target.ageCategoryCodes.some((code) => categoryFilter.ageCategoryCodes!.includes(code));
  if (!ageOverlap) return false;
  const genderOverlap =
    !categoryFilter.genders?.length ||
    !target.genders?.length ||
    target.genders.some((g) => categoryFilter.genders!.includes(g));
  return genderOverlap;
}

function awardMatchesScope(award: PointAward, source: CategoryScope): boolean {
  if (source.ageCategoryCodes?.length) {
    const code = award.category?.ageCategoryCode;
    if (!code || !source.ageCategoryCodes.includes(code)) return false;
  }
  if (source.genders?.length) {
    const gender = award.category?.gender || award.gender;
    if (!gender || !source.genders.includes(gender)) return false;
  }
  if (source.categoryNames?.length) {
    const name = award.category?.categoryName;
    if (!name || !source.categoryNames.includes(name)) return false;
  }
  if (source.ratingTypes?.length) {
    const rt = award.category?.ratingType;
    if (!rt || !source.ratingTypes.includes(rt)) return false;
  }
  return true;
}

function sourceFilterDisqualifies(award: PointAward, filters: SourceFilter[] | undefined): boolean {
  if (!filters?.length) return false;
  return filters.some((f) => {
    if (f.levels?.length && award.level !== undefined && f.levels.includes(award.level)) return true;
    if (f.drawTypes?.length && award.drawType && f.drawTypes.includes(award.drawType)) return true;
    if (f.eventTiers?.length && award.eventTier && f.eventTiers.includes(award.eventTier)) return true;
    // ageEligibility is participant-DOB dependent and is deferred until
    // personService integration; treat as non-disqualifying for now.
    return false;
  });
}

function applyRollingWindow(
  awards: PointAward[],
  rollingPeriodDays: number | undefined,
  asOfDate: string | undefined,
): PointAward[] {
  if (!rollingPeriodDays || !asOfDate) return awards;
  const cutoff = new Date(asOfDate);
  cutoff.setDate(cutoff.getDate() - rollingPeriodDays);
  const cutoffTime = cutoff.getTime();
  return awards.filter((a) => !a.endDate || new Date(a.endDate).getTime() >= cutoffTime);
}

function buildCarriedAward(source: PointAward, rule: CategoryAggregationRule): PointAward {
  // rerateTo is deferred — needs AwardProfile lookup. Multiplier path only here.
  const multiplier = rule.multiplier ?? 1;
  const components: PointComponent[] = rule.carryComponents ?? [
    'positionPoints',
    'perWinPoints',
    'qualityWinPoints',
    'bonusPoints',
  ];

  const carried: PointAward = {
    ...source,
    carriedFromRule: rule.ruleName,
    subjectToBucketLimits: rule.subjectToBucketLimits ?? true,
  };

  // Zero out components not in carryComponents.
  const allComponents: PointComponent[] = ['positionPoints', 'perWinPoints', 'qualityWinPoints', 'bonusPoints'];
  for (const c of allComponents) {
    if (!components.includes(c)) {
      carried[c] = 0;
    }
  }

  // Apply multiplier.
  carried.points = Math.round((source.points ?? 0) * multiplier);
  for (const c of components) {
    if (typeof source[c] === 'number') {
      carried[c] = Math.round(source[c] * multiplier);
    }
  }
  if (typeof source.linePoints === 'number') {
    carried.linePoints = Math.round(source.linePoints * multiplier);
  }

  return carried;
}

function applyParticipationGating({
  nativeByPerson,
  carriedByPerson,
  rules,
  categoryFilter,
}: {
  nativeByPerson: Record<string, PointAward[]>;
  carriedByPerson: Record<string, PointAward[]>;
  rules: CategoryAggregationRule[];
  categoryFilter: CategoryFilter | undefined;
}): string[] {
  const allPersonIds = new Set<string>([...Object.keys(nativeByPerson), ...Object.keys(carriedByPerson)]);
  const eligible: string[] = [];

  // Find rules that gate the target — these constrain who appears in the output.
  const gatingRules = rules.filter((r) => ruleTargetMatchesFilter(r.target, categoryFilter));

  for (const personId of allPersonIds) {
    const nativeCount = nativeByPerson[personId]?.length ?? 0;

    const passes = gatingRules.every((rule) => {
      if (rule.requireParticipationInTarget && nativeCount === 0) return false;
      if (rule.minResultsFromTarget !== undefined && nativeCount < rule.minResultsFromTarget) return false;
      return true;
    });

    if (passes) eligible.push(personId);
  }

  return eligible;
}

// ─── Per-person + sort/rank (unchanged from prior implementation) ────

function computePersonEntry({
  countingBuckets,
  minCountableResults,
  maxResultsPerLevel,
  bestOfCount,
  personId,
  awards,
}: {
  countingBuckets: CountingBucket[] | undefined;
  minCountableResults: number;
  maxResultsPerLevel: Record<number, number> | undefined;
  bestOfCount: number | undefined;
  personId: string;
  awards: PointAward[];
}): RankingListEntry {
  let totalPoints = 0;
  let allCountingResults: PointAward[] = [];
  let allDroppedResults: PointAward[] = [];
  let bucketBreakdown: RankingListEntry['bucketBreakdown'];

  if (countingBuckets?.length) {
    bucketBreakdown = [];

    for (const bucket of countingBuckets) {
      const {
        bucketName,
        eventTypes,
        pointComponents,
        bestOfCount: bucketBestOf,
        maxResultsPerLevel: bucketMaxPerLevel,
        mandatoryRules,
      } = bucket;

      let bucketAwards = awards;
      if (eventTypes?.length) {
        bucketAwards = bucketAwards.filter((a) => a.eventType && eventTypes.includes(a.eventType));
      }

      // Split bucket-limited (default) vs additive (subjectToBucketLimits=false).
      const bucketLimited = bucketAwards.filter((a) => a.subjectToBucketLimits !== false);
      const additive = bucketAwards.filter((a) => a.subjectToBucketLimits === false);

      const {
        counting,
        dropped,
        bucketTotal: limitedTotal,
      } = processBucketResults({
        awards: bucketLimited,
        pointComponents,
        bestOfCount: bucketBestOf,
        maxResultsPerLevel: bucketMaxPerLevel,
        mandatoryRules,
      });

      const additiveScored: ScoredAward[] = additive.map((a) => ({
        award: a,
        value: sumComponents(a, pointComponents),
      }));
      const additiveTotal = additiveScored.reduce((s, sa) => s + sa.value, 0);

      const subTotal = limitedTotal + additiveTotal;
      totalPoints += subTotal;
      allCountingResults.push(...counting.map((sa) => sa.award));
      allCountingResults.push(...additiveScored.map((sa) => sa.award));
      allDroppedResults.push(...dropped.map((sa) => sa.award));

      bucketBreakdown.push({
        bucketName,
        countingResults: [...counting.map((sa) => sa.award), ...additiveScored.map((sa) => sa.award)],
        droppedResults: dropped.map((sa) => sa.award),
        bucketTotal: subTotal,
      });
    }
  } else {
    const bucketLimited = awards.filter((a) => a.subjectToBucketLimits !== false);
    const additive = awards.filter((a) => a.subjectToBucketLimits === false);

    const { counting, dropped, bucketTotal } = processBucketResults({
      awards: bucketLimited,
      pointComponents: ['points', 'qualityWinPoints'],
      bestOfCount: bestOfCount || 0,
      maxResultsPerLevel,
    });

    const additiveScored: ScoredAward[] = additive.map((a) => ({
      award: a,
      value: sumComponents(a, ['points', 'qualityWinPoints']),
    }));
    const additiveTotal = additiveScored.reduce((s, sa) => s + sa.value, 0);

    totalPoints = bucketTotal + additiveTotal;
    allCountingResults = [...counting.map((sa) => sa.award), ...additiveScored.map((sa) => sa.award)];
    allDroppedResults = dropped.map((sa) => sa.award);
  }

  const entry: RankingListEntry = {
    personId,
    totalPoints,
    rank: 0,
    meetsMinimum: allCountingResults.length >= minCountableResults,
    countingResults: allCountingResults,
    droppedResults: allDroppedResults,
  };

  if (bucketBreakdown) entry.bucketBreakdown = bucketBreakdown;
  return entry;
}

function sumComponents(award: PointAward, components: string[] | undefined): number {
  const list = components ?? ['points'];
  let value = 0;
  for (const c of list) {
    if (typeof award[c] === 'number') value += award[c];
  }
  return value;
}

function sortAndRankEntries(entries: RankingListEntry[], tiebreakCriteria: TiebreakCriterion[] | string[]) {
  entries.sort((a, b) => b.totalPoints - a.totalPoints);

  if (tiebreakCriteria.length) {
    entries.sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
      for (const criterion of tiebreakCriteria) {
        const result = applyTiebreaker(criterion, a, b);
        if (result !== 0) return result;
      }
      return 0;
    });
  }

  let currentRank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].totalPoints === entries[i - 1].totalPoints) {
      const tieResolved = tiebreakCriteria.some((c) => applyTiebreaker(c, entries[i - 1], entries[i]) !== 0);

      entries[i].rank = tieResolved ? currentRank : entries[i - 1].rank;
    } else {
      entries[i].rank = currentRank;
    }
    currentRank = i + 2;
  }
}

function applyTiebreaker(criterion: string, a: RankingListEntry, b: RankingListEntry): number {
  switch (criterion) {
    case 'highestSingleResult': {
      const aMax = Math.max(0, ...a.countingResults.map((r) => r.points || 0));
      const bMax = Math.max(0, ...b.countingResults.map((r) => r.points || 0));
      return bMax - aMax;
    }
    case 'mostCountingResults': {
      return b.countingResults.length - a.countingResults.length;
    }
    case 'mostWins': {
      const aWins = a.countingResults.reduce((sum, r) => sum + (r.winCount || 0), 0);
      const bWins = b.countingResults.reduce((sum, r) => sum + (r.winCount || 0), 0);
      return bWins - aWins;
    }
    default:
      return 0;
  }
}

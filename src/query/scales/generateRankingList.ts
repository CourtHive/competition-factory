import { processBucketResults } from './processBucketResults';
import type { MandatoryRule } from '@Types/rankingTypes';

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
  tiebreakCriteria?: string[];
  minCountableResults?: number;
  maxResultsPerLevel?: Record<number, number>;
  bestOfCount?: number;
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
};

export function generateRankingList({
  pointAwards,
  aggregationRules = {},
  categoryFilter,
  asOfDate,
}: GenerateRankingListArgs): RankingListEntry[] {
  const {
    rollingPeriodDays,
    countingBuckets,
    tiebreakCriteria = [],
    minCountableResults = 0,
    maxResultsPerLevel,
    bestOfCount,
  } = aggregationRules;

  const filtered = filterAwards(pointAwards, categoryFilter, rollingPeriodDays, asOfDate);
  const byPerson = groupByPerson(filtered);

  const entries: RankingListEntry[] = [];

  for (const [personId, awards] of Object.entries(byPerson)) {
    const entry = computePersonEntry({
      countingBuckets,
      minCountableResults,
      maxResultsPerLevel,
      bestOfCount,
      personId,
      awards,
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

function computePersonEntry({
  countingBuckets,
  minCountableResults,
  maxResultsPerLevel,
  bestOfCount,
  personId,
  awards,
}): RankingListEntry {
  let totalPoints = 0;
  let allCountingResults: PointAward[] = [];
  let allDroppedResults: PointAward[] = [];
  let bucketBreakdown;

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

      const { counting, dropped, bucketTotal } = processBucketResults({
        awards: bucketAwards,
        pointComponents,
        bestOfCount: bucketBestOf,
        maxResultsPerLevel: bucketMaxPerLevel,
        mandatoryRules,
      });

      totalPoints += bucketTotal;
      allCountingResults.push(...counting.map((sa) => sa.award));
      allDroppedResults.push(...dropped.map((sa) => sa.award));

      bucketBreakdown.push({
        bucketName,
        countingResults: counting.map((sa) => sa.award),
        droppedResults: dropped.map((sa) => sa.award),
        bucketTotal,
      });
    }
  } else {
    const { counting, dropped, bucketTotal } = processBucketResults({
      awards,
      pointComponents: ['points', 'qualityWinPoints'],
      bestOfCount: bestOfCount || 0,
      maxResultsPerLevel,
    });

    totalPoints = bucketTotal;
    allCountingResults = counting.map((sa) => sa.award);
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

function sortAndRankEntries(entries: RankingListEntry[], tiebreakCriteria: string[]) {
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
      const tieResolved =
        tiebreakCriteria.length > 0 &&
        tiebreakCriteria.some((c) => applyTiebreaker(c, entries[i - 1], entries[i]) !== 0);

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

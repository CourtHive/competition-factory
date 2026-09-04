import { DEFAULT_POINT_COMPONENTS } from '@Constants/rankingConstants';
import { processBucketResults } from './processBucketResults';
import type { RankingListBucketBreakdown, RankingListAward, AggregationRules } from '@Types/rankingTypes';

type GetParticipantPointsArgs = {
  pointAwards: RankingListAward[];
  personId: string;
  aggregationRules?: AggregationRules;
};

export function getParticipantPoints({ pointAwards, personId, aggregationRules = {} }: GetParticipantPointsArgs): {
  buckets: RankingListBucketBreakdown[];
  totalPoints: number;
} {
  const { countingBuckets, maxResultsPerLevel, bestOfCount } = aggregationRules;

  // Filter to this participant's awards
  const awards = pointAwards.filter((a) => a.personId === personId);

  if (countingBuckets?.length) {
    const buckets: RankingListBucketBreakdown[] = [];
    let totalPoints = 0;

    for (const [bucketIndex, bucket] of countingBuckets.entries()) {
      const { eventTypes, maxResultsPerLevel: bucketMaxPerLevel, mandatoryRules } = bucket;

      // Same positional fallback generateRankingList uses, so a bucket is
      // labelled identically whichever of the two reports on it.
      const bucketName = bucket.bucketName ?? `bucket-${bucketIndex}`;
      const pointComponents = bucket.pointComponents ?? DEFAULT_POINT_COMPONENTS;
      const bucketBestOf = bucket.bestOfCount ?? 0;

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

      buckets.push({
        bucketName,
        countingResults: counting.map((sa) => sa.award),
        droppedResults: dropped.map((sa) => sa.award),
        bucketTotal,
      });
    }

    return { buckets, totalPoints };
  }

  // No buckets — single "All" bucket
  const { counting, dropped, bucketTotal } = processBucketResults({
    awards,
    pointComponents: DEFAULT_POINT_COMPONENTS,
    bestOfCount: bestOfCount || 0,
    maxResultsPerLevel,
  });

  return {
    buckets: [
      {
        bucketName: 'All',
        countingResults: counting.map((sa) => sa.award),
        droppedResults: dropped.map((sa) => sa.award),
        bucketTotal,
      },
    ],
    totalPoints: bucketTotal,
  };
}

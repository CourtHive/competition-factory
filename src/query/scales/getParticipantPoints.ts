import { processBucketResults } from './processBucketResults';
import { MandatoryRule } from '@Types/rankingTypes';

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
  countingBuckets?: CountingBucket[];
  maxResultsPerLevel?: Record<number, number>;
  bestOfCount?: number;
};

type BucketBreakdown = {
  bucketName: string;
  countingResults: PointAward[];
  droppedResults: PointAward[];
  bucketTotal: number;
};

type GetParticipantPointsArgs = {
  pointAwards: PointAward[];
  personId: string;
  aggregationRules?: AggregationRules;
};

export function getParticipantPoints({ pointAwards, personId, aggregationRules = {} }: GetParticipantPointsArgs): {
  buckets: BucketBreakdown[];
  totalPoints: number;
} {
  const { countingBuckets, maxResultsPerLevel, bestOfCount } = aggregationRules;

  // Filter to this participant's awards
  const awards = pointAwards.filter((a) => a.personId === personId);

  if (countingBuckets?.length) {
    const buckets: BucketBreakdown[] = [];
    let totalPoints = 0;

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
    pointComponents: ['points', 'qualityWinPoints'],
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

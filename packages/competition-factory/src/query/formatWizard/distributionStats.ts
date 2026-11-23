import { DistributionBin, DistributionGap, RatingDistributionStats } from '@Types/formatWizardTypes';

const DEFAULT_BIN_WIDTH = 0.5;
const DEFAULT_GAP_THRESHOLD = 0.5;
const EMPTY_STATS: RatingDistributionStats = {
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

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const fraction = pos - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

function computeHistogram(sorted: number[], min: number, max: number, binWidth: number): DistributionBin[] {
  if (sorted.length === 0 || binWidth <= 0) return [];
  const start = Math.floor(min / binWidth) * binWidth;
  const end = Math.ceil(max / binWidth) * binWidth;
  const bins: DistributionBin[] = [];
  for (let edge = start; edge < end || edge === start; edge += binWidth) {
    bins.push({ binStart: edge, binEnd: edge + binWidth, count: 0 });
    if (edge >= end) break;
  }
  for (const rating of sorted) {
    const index = Math.min(bins.length - 1, Math.floor((rating - start) / binWidth));
    bins[index].count++;
  }
  return bins;
}

function computeGaps(sorted: number[], threshold: number): DistributionGap[] {
  const gaps: DistributionGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const size = sorted[i] - sorted[i - 1];
    if (size >= threshold) {
      gaps.push({ start: sorted[i - 1], end: sorted[i], size });
    }
  }
  return gaps.sort((a, b) => b.size - a.size);
}

// Pure stats over a participant rating array. Used both as direct
// input to a UI distribution viz and as the analytical foundation
// for natural-cluster flighting.
export function computeRatingDistributionStats({
  binWidth = DEFAULT_BIN_WIDTH,
  gapThreshold = DEFAULT_GAP_THRESHOLD,
  ratings,
}: {
  ratings: number[];
  binWidth?: number;
  gapThreshold?: number;
}): RatingDistributionStats {
  if (!Array.isArray(ratings) || ratings.length === 0) return EMPTY_STATS;

  const sorted = [...ratings].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const mean = sorted.reduce((acc, r) => acc + r, 0) / count;
  const median = quantile(sorted, 0.5);
  const variance = sorted.reduce((acc, r) => acc + (r - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;

  return {
    histogram: computeHistogram(sorted, min, max, binWidth),
    gaps: computeGaps(sorted, gapThreshold),
    count,
    stddev,
    median,
    mean,
    iqr,
    min,
    max,
  };
}

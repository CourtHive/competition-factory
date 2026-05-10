import { computeRatingDistributionStats } from '@Query/formatWizard/distributionStats';
import { expect, it, describe } from 'vitest';

describe('computeRatingDistributionStats', () => {
  it('returns the empty stats object when ratings is empty', () => {
    const result = computeRatingDistributionStats({ ratings: [] });
    expect(result.count).toEqual(0);
    expect(result.histogram).toEqual([]);
    expect(result.gaps).toEqual([]);
  });

  it('computes mean / median / stddev / iqr correctly for a uniform pool', () => {
    const ratings = [3, 4, 5, 6, 7];
    const result = computeRatingDistributionStats({ ratings });
    expect(result.count).toEqual(5);
    expect(result.min).toEqual(3);
    expect(result.max).toEqual(7);
    expect(result.mean).toBeCloseTo(5, 6);
    expect(result.median).toBeCloseTo(5, 6);
    expect(result.iqr).toBeCloseTo(2, 6);
    expect(result.stddev).toBeCloseTo(Math.sqrt(2), 6);
  });

  it('detects gaps above threshold and sorts them largest-first', () => {
    const ratings = [3, 3.1, 3.2, 4.5, 4.6];
    const result = computeRatingDistributionStats({ ratings, gapThreshold: 0.5 });
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps[0].size).toBeCloseTo(1.3, 6);
    expect(result.gaps[0].start).toEqual(3.2);
    expect(result.gaps[0].end).toEqual(4.5);
  });

  it('produces a histogram whose bin counts sum to the participant count', () => {
    const ratings = [3, 3.4, 4.1, 4.7, 5.2, 5.9, 6.3];
    const result = computeRatingDistributionStats({ ratings, binWidth: 0.5 });
    const totalInBins = result.histogram.reduce((acc, bin) => acc + bin.count, 0);
    expect(totalInBins).toEqual(ratings.length);
  });

  it('histogram bin edges are aligned to bin width', () => {
    const result = computeRatingDistributionStats({ ratings: [3.2, 4.1, 5.7], binWidth: 0.5 });
    for (const bin of result.histogram) {
      expect(bin.binEnd - bin.binStart).toBeCloseTo(0.5, 6);
      expect(bin.binStart * 2).toBeCloseTo(Math.round(bin.binStart * 2), 6);
    }
  });
});

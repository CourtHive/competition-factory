import { getParticipantPoints } from '@Query/scales/getParticipantPoints';
import { generateRankingList } from '@Query/scales/generateRankingList';
import { describe, expect, it } from 'vitest';

import { SINGLES, DOUBLES } from '@Constants/eventConstants';

// Regression cover for the RankingListEntry reconciliation: `@Types/rankingTypes`
// declared a shape (`participantId`, numeric `countingResults`, `tournamentResults`,
// `tiebreakValues`) that generateRankingList never emitted, and promised a
// `bucketTotals` the implementation had no code to produce. A consumer persisting
// `entry.bucketTotals` therefore stored null for every bucketed policy.

function makeAward(overrides: Record<string, any> = {}) {
  return {
    personId: 'person-1',
    eventType: SINGLES,
    positionPoints: 0,
    perWinPoints: 0,
    bonusPoints: 0,
    points: 0,
    level: 3,
    endDate: '2025-06-01',
    ...overrides,
  };
}

describe('RankingListEntry shape', () => {
  it('emits bucketTotals whenever it emits bucketBreakdown, and the two agree', () => {
    const awards = [
      makeAward({ personId: 'p1', eventType: SINGLES, positionPoints: 500 }),
      makeAward({ personId: 'p1', eventType: SINGLES, positionPoints: 300 }),
      makeAward({ personId: 'p1', eventType: DOUBLES, positionPoints: 120 }),
    ];

    const result: any = generateRankingList({
      pointAwards: awards,
      aggregationRules: {
        countingBuckets: [
          { bucketName: 'Singles', eventTypes: [SINGLES], pointComponents: ['positionPoints'], bestOfCount: 2 },
          { bucketName: 'Doubles', eventTypes: [DOUBLES], pointComponents: ['positionPoints'], bestOfCount: 2 },
        ],
      },
    });

    const p1 = result.find((e: any) => e.personId === 'p1');

    // Control: the fixture is non-degenerate — two buckets actually scored.
    expect(p1.bucketBreakdown).toHaveLength(2);
    expect(p1.totalPoints).toEqual(920);

    expect(p1.bucketTotals).toEqual({ Singles: 800, Doubles: 120 });

    // The summary view must not drift from the detailed one.
    const fromBreakdown = Object.fromEntries(p1.bucketBreakdown.map((b: any) => [b.bucketName, b.bucketTotal]));
    expect(p1.bucketTotals).toEqual(fromBreakdown);
    expect(Object.values(p1.bucketTotals).reduce((a: any, b: any) => a + b, 0)).toEqual(p1.totalPoints);
  });

  it('labels an unnamed bucket by position in both views rather than keying on undefined', () => {
    const result: any = generateRankingList({
      pointAwards: [makeAward({ personId: 'p1', positionPoints: 250 })],
      aggregationRules: {
        countingBuckets: [{ pointComponents: ['positionPoints'], bestOfCount: 0 }],
      },
    });

    const p1 = result.find((e: any) => e.personId === 'p1');
    expect(p1.bucketTotals).toEqual({ 'bucket-0': 250 });
    expect(p1.bucketBreakdown[0].bucketName).toEqual('bucket-0');
    expect(Object.keys(p1.bucketTotals)).not.toContain('undefined');
  });

  it('omits bucketTotals when the policy defines no countingBuckets', () => {
    const result: any = generateRankingList({
      pointAwards: [makeAward({ personId: 'p1', points: 400 })],
    });

    const p1 = result.find((e: any) => e.personId === 'p1');
    expect(p1.totalPoints).toEqual(400);
    expect(p1.bucketBreakdown).toBeUndefined();
    expect(p1.bucketTotals).toBeUndefined();
  });

  it('returns the fields the declared type promises, and none it does not', () => {
    const result: any = generateRankingList({
      pointAwards: [makeAward({ personId: 'p1', points: 400 })],
    });

    const p1 = result.find((e: any) => e.personId === 'p1');
    expect(Object.keys(p1).toSorted((a, b) => a.localeCompare(b, 'en'))).toEqual([
      'countingResults',
      'droppedResults',
      'meetsMinimum',
      'personId',
      'rank',
      'totalPoints',
    ]);

    // countingResults is the contributing awards, not a count — the declared
    // type said `number`, which is what drove a consumer to coerce defensively.
    expect(Array.isArray(p1.countingResults)).toEqual(true);
  });

  it('defaults an unnamed bucket to the same components getParticipantPoints does', () => {
    const awards = [makeAward({ personId: 'p1', points: 300, qualityWinPoints: 50 })];

    const list: any = generateRankingList({
      pointAwards: awards,
      aggregationRules: { countingBuckets: [{ bucketName: 'All' }] },
    });
    const breakdown: any = getParticipantPoints({
      pointAwards: awards,
      personId: 'p1',
      aggregationRules: { countingBuckets: [{ bucketName: 'All' }] },
    });

    // points + qualityWinPoints, from disjoint award populations in the real
    // pipeline; here one award carries both, which is still a single sum.
    expect(list.find((e: any) => e.personId === 'p1').bucketTotals).toEqual({ All: 350 });
    expect(breakdown.totalPoints).toEqual(350);
    expect(breakdown.buckets[0].bucketName).toEqual('All');
  });

  it('sums buckets that share a name rather than letting the last one win', () => {
    const awards = [
      makeAward({ personId: 'p1', eventType: SINGLES, positionPoints: 400 }),
      makeAward({ personId: 'p1', eventType: DOUBLES, positionPoints: 100 }),
    ];

    const result: any = generateRankingList({
      pointAwards: awards,
      aggregationRules: {
        countingBuckets: [
          { bucketName: 'Combined', eventTypes: [SINGLES], pointComponents: ['positionPoints'] },
          { bucketName: 'Combined', eventTypes: [DOUBLES], pointComponents: ['positionPoints'] },
        ],
      },
    });

    const p1 = result.find((e: any) => e.personId === 'p1');

    // Two breakdown rows, one merged total — the points of the second bucket
    // must not vanish because it reused the first one's label.
    expect(p1.bucketBreakdown).toHaveLength(2);
    expect(p1.bucketTotals).toEqual({ Combined: 500 });
    expect(p1.totalPoints).toEqual(500);
  });

  it('getParticipantPoints labels an unnamed bucket by position too', () => {
    const breakdown: any = getParticipantPoints({
      pointAwards: [makeAward({ personId: 'p1', positionPoints: 250 })],
      personId: 'p1',
      aggregationRules: { countingBuckets: [{ pointComponents: ['positionPoints'] }] },
    });

    expect(breakdown.buckets[0].bucketName).toEqual('bucket-0');
    expect(breakdown.totalPoints).toEqual(250);
  });

  it('sums awards marked subjectToBucketLimits=false on top of the best-of cap', () => {
    const awards = [
      makeAward({ personId: 'p1', points: 500 }),
      makeAward({ personId: 'p1', points: 400 }),
      // Exempt from the cap: contributes on top rather than competing for a slot.
      makeAward({ personId: 'p1', points: 50, subjectToBucketLimits: false }),
    ];

    const result: any = generateRankingList({
      pointAwards: awards,
      aggregationRules: { bestOfCount: 1 },
    });

    const p1 = result.find((e: any) => e.personId === 'p1');

    // best-of-1 keeps 500 and drops 400; the exempt 50 is added regardless.
    expect(p1.totalPoints).toEqual(550);
    expect(p1.countingResults).toHaveLength(2);
    expect(p1.droppedResults).toHaveLength(1);
    expect(p1.droppedResults[0].points).toEqual(400);
  });
});

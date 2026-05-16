import { applyDerivedRankings } from '@Query/scales/applyDerivedRankings';
import type { RankingListEntry } from '@Query/scales/generateRankingList';
import { describe, expect, it } from 'vitest';

const mkEntry = (personId: string, totalPoints: number, rank: number): RankingListEntry => ({
  personId,
  totalPoints,
  rank,
  meetsMinimum: true,
  countingResults: [],
  droppedResults: [],
});

describe('applyDerivedRankings', () => {
  it('filters by ageRange max (ČTS U16 = U18 ranking filtered to ≤16)', () => {
    const entries: RankingListEntry[] = [
      mkEntry('p1', 1000, 1), // age 17
      mkEntry('p2', 800, 2), //  age 16
      mkEntry('p3', 600, 3), //  age 15
      mkEntry('p4', 400, 4), //  age 18
    ];

    const ages: Record<string, number> = { p1: 17, p2: 16, p3: 15, p4: 18 };
    const result = applyDerivedRankings({
      entries,
      filter: { ageRange: { max: 16 } },
      participantContext: { ageAtDate: (id) => ages[id] },
    });

    expect(result.map((e) => e.personId)).toEqual(['p2', 'p3']);
    // Ranks renumbered 1..N
    expect(result[0].rank).toEqual(1);
    expect(result[1].rank).toEqual(2);
    // Total points preserved
    expect(result[0].totalPoints).toEqual(800);
    expect(result[1].totalPoints).toEqual(600);
  });

  it('filters by ageRange min', () => {
    const entries: RankingListEntry[] = [mkEntry('p1', 500, 1), mkEntry('p2', 400, 2), mkEntry('p3', 300, 3)];

    const ages: Record<string, number> = { p1: 11, p2: 13, p3: 15 };
    const result = applyDerivedRankings({
      entries,
      filter: { ageRange: { min: 13 } },
      participantContext: { ageAtDate: (id) => ages[id] },
    });

    expect(result.map((e) => e.personId)).toEqual(['p2', 'p3']);
  });

  it('filters by ageRange min + max combined', () => {
    const entries: RankingListEntry[] = [
      mkEntry('p1', 500, 1), // age 12
      mkEntry('p2', 400, 2), // age 14
      mkEntry('p3', 300, 3), // age 16
      mkEntry('p4', 200, 4), // age 18
    ];

    const ages: Record<string, number> = { p1: 12, p2: 14, p3: 16, p4: 18 };
    const result = applyDerivedRankings({
      entries,
      filter: { ageRange: { min: 13, max: 16 } },
      participantContext: { ageAtDate: (id) => ages[id] },
    });

    expect(result.map((e) => e.personId)).toEqual(['p2', 'p3']);
  });

  it('drops participants without age data when ageRange filter is set', () => {
    const entries: RankingListEntry[] = [mkEntry('p1', 1000, 1), mkEntry('p2', 800, 2)];

    // Only p1 has age data; p2 returns undefined.
    const result = applyDerivedRankings({
      entries,
      filter: { ageRange: { max: 16 } },
      participantContext: { ageAtDate: (id) => (id === 'p1' ? 15 : undefined) },
    });

    expect(result.map((e) => e.personId)).toEqual(['p1']);
  });

  it('excludePlayersAgingUp filter (ČTS rCŽ rule)', () => {
    const entries: RankingListEntry[] = [mkEntry('p1', 1000, 1), mkEntry('p2', 800, 2), mkEntry('p3', 600, 3)];

    const agingUp = new Set(['p2']);
    const result = applyDerivedRankings({
      entries,
      filter: { excludePlayersAgingUp: true },
      participantContext: {
        isAgingUpAtPeriodEnd: (id) => agingUp.has(id),
      },
    });

    expect(result.map((e) => e.personId)).toEqual(['p1', 'p3']);
  });

  it('preserves order of entries (source snapshot ordering)', () => {
    const entries: RankingListEntry[] = [
      mkEntry('p1', 1000, 1),
      mkEntry('p2', 999, 2),
      mkEntry('p3', 998, 3),
      mkEntry('p4', 997, 4),
    ];

    const ages: Record<string, number> = { p1: 18, p2: 14, p3: 18, p4: 12 };
    const result = applyDerivedRankings({
      entries,
      filter: { ageRange: { max: 16 } },
      participantContext: { ageAtDate: (id) => ages[id] },
    });

    // Source order p1 > p2 > p3 > p4. After filter survivors: p2, p4.
    expect(result.map((e) => e.personId)).toEqual(['p2', 'p4']);
  });

  it('no filter conditions returns the same entries with ranks renumbered (identity)', () => {
    const entries: RankingListEntry[] = [
      mkEntry('p1', 100, 5), // pre-existing rank not 1 (e.g., spliced view)
      mkEntry('p2', 80, 9),
    ];

    const result = applyDerivedRankings({
      entries,
      filter: {},
    });

    expect(result).toHaveLength(2);
    expect(result[0].rank).toEqual(1);
    expect(result[1].rank).toEqual(2);
    expect(result[0].totalPoints).toEqual(100);
    expect(result[1].totalPoints).toEqual(80);
  });
});

import { generateRankingList } from '@Query/scales/generateRankingList';
import type { AggregationRules } from '@Types/rankingTypes';
import { describe, expect, it } from 'vitest';

// constants
import { SINGLES } from '@Constants/eventConstants';

const award = (personId: string, points: number) => ({ personId, eventType: SINGLES, points, endDate: '2025-06-01' });

// beat[winner] = the persons they beat
function recordOf(beat: Record<string, string[]>) {
  const beaten = new Map(Object.entries(beat).map(([winner, losers]) => [winner, new Set(losers)]));
  return (a: string, b: string) => {
    if (beaten.get(a)?.has(b)) return -1;
    if (beaten.get(b)?.has(a)) return 1;
    return 0;
  };
}

const headToHeadOnly: AggregationRules = { tiebreakCriteria: ['headToHead'] };

describe('generateRankingList — headToHead tiebreak', () => {
  it('orders and separates two tied players by their head-to-head result', () => {
    const result = generateRankingList({
      pointAwards: [award('alice', 100), award('bob', 100), award('carol', 50)],
      headToHead: recordOf({ bob: ['alice'] }),
      aggregationRules: headToHeadOnly,
    });
    expect(result.map((e) => [e.personId, e.rank])).toEqual([
      ['bob', 1],
      ['alice', 2],
      ['carol', 3],
    ]);
  });

  it('without a head-to-head record the criterion resolves nothing', () => {
    const result = generateRankingList({
      pointAwards: [award('alice', 100), award('bob', 100)],
      aggregationRules: headToHeadOnly,
    });
    expect(result.map((e) => e.rank)).toEqual([1, 1]);
  });

  it('players who never met stay tied', () => {
    const result = generateRankingList({
      pointAwards: [award('alice', 100), award('bob', 100)],
      headToHead: recordOf({}),
      aggregationRules: headToHeadOnly,
    });
    expect(result.map((e) => e.rank)).toEqual([1, 1]);
  });

  it('does not apply to a tie of three or more, even when the results are not circular', () => {
    const result = generateRankingList({
      pointAwards: [award('alice', 100), award('bob', 100), award('carol', 100)],
      headToHead: recordOf({ alice: ['bob', 'carol'], bob: ['carol'] }),
      aggregationRules: headToHeadOnly,
    });
    expect(result.map((e) => e.rank)).toEqual([1, 1, 1]);
  });

  it('falls through to the next criterion when head-to-head is level', () => {
    const result = generateRankingList({
      pointAwards: [award('alice', 100), award('bob', 60), award('bob', 40)],
      aggregationRules: { tiebreakCriteria: ['headToHead', 'mostCountingResults'] },
      headToHead: recordOf({}),
    });
    expect(result.map((e) => [e.personId, e.rank])).toEqual([
      ['bob', 1],
      ['alice', 2],
    ]);
  });

  it('a later criterion is not consulted once head-to-head decides', () => {
    const result = generateRankingList({
      pointAwards: [award('alice', 100), award('bob', 60), award('bob', 40)],
      aggregationRules: { tiebreakCriteria: ['headToHead', 'mostCountingResults'] },
      headToHead: recordOf({ alice: ['bob'] }),
    });
    expect(result.map((e) => e.personId)).toEqual(['alice', 'bob']);
  });

  it('only the sign of the head-to-head value matters', () => {
    const result = generateRankingList({
      pointAwards: [award('alice', 100), award('bob', 100)],
      headToHead: (a) => (a === 'bob' ? -7 : 7),
      aggregationRules: headToHeadOnly,
    });
    expect(result.map((e) => e.personId)).toEqual(['bob', 'alice']);
  });
});

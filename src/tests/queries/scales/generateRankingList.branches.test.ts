import { generateRankingList } from '@Query/scales/generateRankingList';
import { setClock } from '@Tools/clock';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// constants
import { SINGLES, DOUBLES } from '@Constants/eventConstants';
import { MALE, FEMALE } from '@Constants/genderConstants';

// The list is judged as of a date inside these fixtures' era: a ranking list now has a rolling window (default 365
// days back from its as-of date, which falls back to the competition clock), and the awards here are dated 2025.
beforeAll(() => setClock('2025-12-31T12:00:00Z'));
afterAll(() => setClock());

function makeAward(overrides: Record<string, any> = {}) {
  return {
    personId: 'person-1',
    eventType: SINGLES,
    points: 0,
    level: 3,
    endDate: '2025-06-01',
    ...overrides,
  };
}

describe('generateRankingList — branch coverage', () => {
  describe('category filter branches', () => {
    it('filters by ageCategoryCodes', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, category: { ageCategoryCode: 'U18' } }),
        makeAward({ personId: 'p2', points: 200, category: { ageCategoryCode: 'U14' } }),
        makeAward({ personId: 'p3', points: 300 }), // no category — excluded
      ];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { ageCategoryCodes: ['U18'] },
      });

      expect(result.length).toEqual(1);
      expect(result[0].personId).toEqual('p1');
    });

    it('excludes awards where ageCategoryCode does not match', () => {
      const awards = [makeAward({ personId: 'p1', points: 100, category: { ageCategoryCode: 'OPEN' } })];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { ageCategoryCodes: ['U18', 'U14'] },
      });

      expect(result.length).toEqual(0);
    });

    it('filters by genders using category.gender', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, category: { gender: MALE } }),
        makeAward({ personId: 'p2', points: 200, category: { gender: FEMALE } }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { genders: [FEMALE] },
      });

      expect(result.length).toEqual(1);
      expect(result[0].personId).toEqual('p2');
    });

    it('filters by genders using award.gender fallback when category.gender is absent', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, gender: MALE }),
        makeAward({ personId: 'p2', points: 200, gender: FEMALE }),
        makeAward({ personId: 'p3', points: 300 }), // no gender at all — excluded
      ];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { genders: [MALE] },
      });

      expect(result.length).toEqual(1);
      expect(result[0].personId).toEqual('p1');
    });

    it('filters by eventTypes', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, eventType: SINGLES }),
        makeAward({ personId: 'p2', points: 200, eventType: DOUBLES }),
        makeAward({ personId: 'p3', points: 300 }), // eventType is SINGLES by default from makeAward
      ];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { eventTypes: [DOUBLES] },
      });

      expect(result.length).toEqual(1);
      expect(result[0].personId).toEqual('p2');
    });

    it('excludes awards with no eventType when eventTypes filter is specified', () => {
      const awards = [makeAward({ personId: 'p1', points: 100, eventType: undefined })];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { eventTypes: [SINGLES] },
      });

      expect(result.length).toEqual(0);
    });

    it('applies multiple category filters simultaneously', () => {
      const awards = [
        makeAward({
          personId: 'p1',
          points: 100,
          category: { ageCategoryCode: 'U18', gender: MALE },
          eventType: SINGLES,
        }),
        makeAward({
          personId: 'p2',
          points: 200,
          category: { ageCategoryCode: 'U18', gender: FEMALE },
          eventType: SINGLES,
        }),
        makeAward({
          personId: 'p3',
          points: 300,
          category: { ageCategoryCode: 'U14', gender: MALE },
          eventType: SINGLES,
        }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { ageCategoryCodes: ['U18'], genders: [MALE], eventTypes: [SINGLES] },
      });

      expect(result.length).toEqual(1);
      expect(result[0].personId).toEqual('p1');
    });

    it('empty ageCategoryCodes array does not filter', () => {
      const awards = [makeAward({ personId: 'p1', points: 100 }), makeAward({ personId: 'p2', points: 200 })];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { ageCategoryCodes: [] },
      });

      expect(result.length).toEqual(2);
    });

    it('empty genders array does not filter', () => {
      const awards = [makeAward({ personId: 'p1', points: 100 })];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { genders: [] },
      });

      expect(result.length).toEqual(1);
    });

    it('empty eventTypes array does not filter', () => {
      const awards = [makeAward({ personId: 'p1', points: 100 })];

      const result = generateRankingList({
        pointAwards: awards,
        categoryFilter: { eventTypes: [] },
      });

      expect(result.length).toEqual(1);
    });
  });

  describe('rolling period branches', () => {
    // CA 2026-11-08: an award with no end date cannot be placed in time, so it is outside every window
    it('excludes awards without endDate when a rolling window applies', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, endDate: undefined }),
        makeAward({ personId: 'p1', points: 200, endDate: '2025-06-01' }),
        makeAward({ personId: 'p1', points: 300, endDate: '2024-01-01' }), // too old
      ];

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { rollingPeriodDays: 365 },
        asOfDate: '2025-07-01',
      });

      const p1 = result.find((e) => e.personId === 'p1');
      // 200 only: the undated award is outside the window, and 2024-01-01 is too old
      expect(p1?.totalPoints).toEqual(200);
      expect(p1?.countingResults.length).toEqual(1);
    });

    // CA 2026-11-08: a clock is an input; without asOfDate the window ends at the competition clock's date (pinned above)
    it('without asOfDate, ends the window at the competition clock date', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, endDate: '2020-01-01' }),
        makeAward({ personId: 'p1', points: 200, endDate: '2025-06-01' }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { rollingPeriodDays: 365 },
        // no asOfDate: the clock is pinned to 2025-12-31, so the window is 2024-12-31 to 2025-12-31
      });

      const p1 = result.find((e) => e.personId === 'p1');
      expect(p1?.totalPoints).toEqual(200);
    });

    // CA 2026-11-08: a list that declares no rolling period gets 365 days
    it('without rollingPeriodDays, defaults the window to 365 days', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, endDate: '2020-01-01' }),
        makeAward({ personId: 'p1', points: 200, endDate: '2025-06-01' }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        asOfDate: '2025-07-01',
        // no rollingPeriodDays: 2024-07-01 to 2025-07-01
      });

      const p1 = result.find((e) => e.personId === 'p1');
      expect(p1?.totalPoints).toEqual(200);
    });
  });

  describe('personId grouping', () => {
    it('skips awards without personId', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100 }),
        makeAward({ personId: undefined, points: 500 }),
        makeAward({ personId: '', points: 300 }),
        makeAward({ personId: null, points: 200 }),
      ];

      const result = generateRankingList({ pointAwards: awards });
      // Only p1 should be present (undefined, null, empty string are falsy)
      expect(result.length).toEqual(1);
      expect(result[0].personId).toEqual('p1');
      expect(result[0].totalPoints).toEqual(100);
    });
  });

  describe('global bestOfCount (no buckets)', () => {
    it('applies bestOfCount without counting buckets', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 500 }),
        makeAward({ personId: 'p1', points: 400 }),
        makeAward({ personId: 'p1', points: 300 }),
        makeAward({ personId: 'p1', points: 200 }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { bestOfCount: 2 },
      });

      const p1 = result.find((e) => e.personId === 'p1');
      expect(p1?.totalPoints).toEqual(900); // 500 + 400
      expect(p1?.countingResults.length).toEqual(2);
      expect(p1?.droppedResults.length).toEqual(2);
      expect(p1?.bucketBreakdown).toBeUndefined();
    });

    it('uses qualityWinPoints in default pointComponents when no buckets', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 100, qualityWinPoints: 50 }),
        makeAward({ personId: 'p1', points: 200, qualityWinPoints: 25 }),
      ];

      const result = generateRankingList({ pointAwards: awards });

      const p1 = result.find((e) => e.personId === 'p1');
      // Default pointComponents are ['points', 'qualityWinPoints']
      // (200+25) + (100+50) = 375
      expect(p1?.totalPoints).toEqual(375);
    });
  });

  describe('tiebreaker branches', () => {
    it('applies mostCountingResults tiebreaker', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 500 }),
        makeAward({ personId: 'p2', points: 250 }),
        makeAward({ personId: 'p2', points: 250 }),
      ];
      // p1: 500 total, 1 result. p2: 500 total, 2 results.

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { tiebreakCriteria: ['mostCountingResults'] },
      });

      expect(result[0].personId).toEqual('p2'); // more counting results
      expect(result[0].rank).toEqual(1);
      expect(result[1].personId).toEqual('p1');
      expect(result[1].rank).toEqual(2);
    });

    it('applies mostWins tiebreaker', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 500, winCount: 3 }),
        makeAward({ personId: 'p2', points: 500, winCount: 5 }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { tiebreakCriteria: ['mostWins'] },
      });

      expect(result[0].personId).toEqual('p2'); // more wins
      expect(result[0].rank).toEqual(1);
      expect(result[1].personId).toEqual('p1');
      expect(result[1].rank).toEqual(2);
    });

    it('returns 0 for unknown tiebreaker criterion', () => {
      const awards = [makeAward({ personId: 'p1', points: 500 }), makeAward({ personId: 'p2', points: 500 })];

      const result = generateRankingList({
        pointAwards: awards,
        // @ts-expect-error -- deliberately not a TiebreakCriterion: this test is about the runtime fallback for one
        aggregationRules: { tiebreakCriteria: ['unknownCriterion'] },
      });

      // Tied — unknown criterion returns 0, so ranks should be tied
      expect(result[0].rank).toEqual(1);
      expect(result[1].rank).toEqual(1);
    });

    it('falls through multiple tiebreakers until one resolves', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 250, winCount: 5 }),
        makeAward({ personId: 'p1', points: 250, winCount: 3 }),
        makeAward({ personId: 'p2', points: 250, winCount: 2 }),
        makeAward({ personId: 'p2', points: 250, winCount: 2 }),
      ];
      // Both have 500 total, 2 counting results each
      // p1 wins = 8, p2 wins = 4

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: {
          tiebreakCriteria: ['mostCountingResults', 'mostWins'],
        },
      });

      // mostCountingResults: both have 2, tie not resolved
      // mostWins: p1 has 8 wins, p2 has 4 → p1 wins
      expect(result[0].personId).toEqual('p1');
      expect(result[0].rank).toEqual(1);
      expect(result[1].personId).toEqual('p2');
      expect(result[1].rank).toEqual(2);
    });

    it('assigns tied ranks when tiebreakers do not resolve', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 500 }),
        makeAward({ personId: 'p2', points: 500 }),
        makeAward({ personId: 'p3', points: 300 }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { tiebreakCriteria: ['highestSingleResult'] },
      });

      // p1 and p2 both have highest single result 500 — still tied
      expect(result[0].rank).toEqual(1);
      expect(result[1].rank).toEqual(1); // tied
      expect(result[2].rank).toEqual(3); // skips to 3
    });

    it('assigns sequential ranks when tiebreaker resolves equal totalPoints', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 300 }),
        makeAward({ personId: 'p1', points: 200 }),
        makeAward({ personId: 'p2', points: 400 }),
        makeAward({ personId: 'p2', points: 100 }),
        makeAward({ personId: 'p3', points: 100 }),
      ];
      // p1: 500 total, highest=300. p2: 500 total, highest=400. p3: 100

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { tiebreakCriteria: ['highestSingleResult'] },
      });

      expect(result[0].personId).toEqual('p2'); // highest single = 400
      expect(result[0].rank).toEqual(1);
      expect(result[1].personId).toEqual('p1'); // highest single = 300
      expect(result[1].rank).toEqual(2); // tiebreaker resolved
      expect(result[2].personId).toEqual('p3');
      expect(result[2].rank).toEqual(3);
    });
  });

  describe('rank assignment edge cases', () => {
    it('single entry gets rank 1', () => {
      const awards = [makeAward({ personId: 'p1', points: 100 })];
      const result = generateRankingList({ pointAwards: awards });
      expect(result.length).toEqual(1);
      expect(result[0].rank).toEqual(1);
    });

    it('returns empty array for no awards', () => {
      const result = generateRankingList({ pointAwards: [] });
      expect(result).toEqual([]);
    });

    it('currentRank progresses correctly after ties', () => {
      const awards = [
        makeAward({ personId: 'p1', points: 500 }),
        makeAward({ personId: 'p2', points: 500 }),
        makeAward({ personId: 'p3', points: 500 }),
        makeAward({ personId: 'p4', points: 100 }),
      ];

      const result = generateRankingList({ pointAwards: awards });
      expect(result[0].rank).toEqual(1);
      expect(result[1].rank).toEqual(1);
      expect(result[2].rank).toEqual(1);
      expect(result[3].rank).toEqual(4); // skips 2 and 3
    });
  });

  describe('bucket eventTypes filtering', () => {
    it('filters bucket awards by eventTypes when specified', () => {
      const awards = [
        makeAward({ personId: 'p1', eventType: SINGLES, points: 100 }),
        makeAward({ personId: 'p1', eventType: DOUBLES, points: 200 }),
        makeAward({ personId: 'p1', eventType: undefined, points: 300 }), // no eventType — excluded from bucket
      ];

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: {
          countingBuckets: [
            {
              bucketName: 'Doubles Only',
              eventTypes: [DOUBLES],
              pointComponents: ['points'],
              bestOfCount: 0,
            },
          ],
        },
      });

      const p1 = result.find((e) => e.personId === 'p1');
      expect(p1?.totalPoints).toEqual(200); // only DOUBLES
    });

    it('includes all awards when bucket has no eventTypes filter', () => {
      const awards = [
        makeAward({ personId: 'p1', eventType: SINGLES, points: 100 }),
        makeAward({ personId: 'p1', eventType: DOUBLES, points: 200 }),
      ];

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: {
          countingBuckets: [
            {
              bucketName: 'All',
              pointComponents: ['points'],
              bestOfCount: 0,
            },
          ],
        },
      });

      const p1 = result.find((e) => e.personId === 'p1');
      expect(p1?.totalPoints).toEqual(300); // both counted
    });
  });

  describe('meetsMinimum with zero default', () => {
    it('meetsMinimum is true by default (minCountableResults defaults to 0)', () => {
      const awards = [makeAward({ personId: 'p1', points: 100 })];
      const result = generateRankingList({ pointAwards: awards });
      expect(result[0].meetsMinimum).toEqual(true);
    });
  });

  describe('highestSingleResult tiebreaker with missing points', () => {
    it('handles counting results with no points property', () => {
      const awards = [
        makeAward({ personId: 'p1', points: undefined, qualityWinPoints: 500 }),
        makeAward({ personId: 'p2', points: undefined, qualityWinPoints: 500 }),
      ];

      // Uses default pointComponents ['points', 'qualityWinPoints'] → both get 500
      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { tiebreakCriteria: ['highestSingleResult'] },
      });

      // Both have totalPoints 500, highestSingleResult looks at r.points (which is undefined → 0)
      // So they remain tied
      expect(result[0].rank).toEqual(1);
      expect(result[1].rank).toEqual(1);
    });
  });

  describe('mostWins with missing winCount', () => {
    it('handles counting results with no winCount property', () => {
      const awards = [makeAward({ personId: 'p1', points: 500 }), makeAward({ personId: 'p2', points: 500 })];
      // Neither has winCount → both default to 0 → tied

      const result = generateRankingList({
        pointAwards: awards,
        aggregationRules: { tiebreakCriteria: ['mostWins'] },
      });

      expect(result[0].rank).toEqual(1);
      expect(result[1].rank).toEqual(1);
    });
  });
});

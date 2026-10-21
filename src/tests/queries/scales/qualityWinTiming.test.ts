import { getQualityWinPoints, getRankingCutoffDate } from '@Query/scales/getQualityWinPoints';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { RANKING, SCALE } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';
import {
  LATEST_AVAILABLE,
  MATCH_DATE,
  NO_BONUS,
  TOURNAMENT_START,
  USE_DEFAULT_RANK,
} from '@Constants/rankingConstants';

const TOURNAMENT_START_DATE = '2025-03-01';
const RANGES = [
  { rankRange: [1, 10], value: 100 },
  { rankRange: [11, 100], value: 20 },
];

const rankingItem = (rank: number, date: string) => ({
  itemType: `${SCALE}.${RANKING}.${SINGLES}.TEST`,
  itemValue: rank,
  itemDate: date,
  createdAt: `${date}T00:00:00Z`,
});

// Ranked 50th before the tournament, 5th on a list published mid-tournament.
const rankedOpponent = {
  participantId: 'p2',
  timeItems: [rankingItem(50, '2025-01-01'), rankingItem(5, '2025-03-10')],
};
const unrankedOpponent = { participantId: 'p2', timeItems: [] };

function points(profile: Record<string, any>, matchUpDates: Record<string, any> = {}, opponent: any = rankedOpponent) {
  const matchUp = {
    matchUpId: 'm1',
    winningSide: 1,
    matchUpStatus: COMPLETED,
    sides: [
      { sideNumber: 1, participantId: 'p1' },
      { sideNumber: 2, participantId: 'p2' },
    ],
    ...matchUpDates,
  };
  return getQualityWinPoints({
    qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: RANGES, ...profile }],
    tournamentParticipants: [{ participantId: 'p1', timeItems: [] }, opponent],
    tournamentStartDate: TOURNAMENT_START_DATE,
    mappedMatchUps: { m1: matchUp },
    participantSideMap: { m1: 1 },
    wonMatchUpIds: ['m1'],
    level: 1,
  }).qualityWinPoints;
}

describe('getRankingCutoffDate', () => {
  const tournamentStartDate = TOURNAMENT_START_DATE;

  it('tournamentStart reads as of the tournament start; latestAvailable has no cutoff', () => {
    expect(getRankingCutoffDate({ rankingSnapshot: TOURNAMENT_START, tournamentStartDate })).toEqual('2025-03-01');
    expect(getRankingCutoffDate({ rankingSnapshot: LATEST_AVAILABLE, tournamentStartDate })).toBeUndefined();
  });

  it('matchDate prefers endDate, then the scheduled date, then the tournament start', () => {
    const scheduled = { schedule: { scheduledDate: '2025-03-04' } };
    expect(
      getRankingCutoffDate({
        rankingSnapshot: MATCH_DATE,
        tournamentStartDate,
        matchUp: { endDate: '2025-03-05', ...scheduled },
      }),
    ).toEqual('2025-03-05');
    expect(getRankingCutoffDate({ rankingSnapshot: MATCH_DATE, tournamentStartDate, matchUp: scheduled })).toEqual(
      '2025-03-04',
    );
    expect(getRankingCutoffDate({ rankingSnapshot: MATCH_DATE, tournamentStartDate, matchUp: {} })).toEqual(
      '2025-03-01',
    );
  });
});

describe('quality wins — rankingSnapshot timing', () => {
  it('tournamentStart uses the ranking published before the tournament', () => {
    expect(points({ rankingSnapshot: TOURNAMENT_START }, { endDate: '2025-03-12' })).toEqual(20);
  });

  it('matchDate uses the ranking in force on the day of the match', () => {
    expect(points({ rankingSnapshot: MATCH_DATE }, { endDate: '2025-03-12' })).toEqual(100);
    expect(points({ rankingSnapshot: MATCH_DATE }, { endDate: '2025-03-05' })).toEqual(20);
  });

  it('matchDate falls back to the scheduled date, then to the tournament start', () => {
    expect(points({ rankingSnapshot: MATCH_DATE }, { schedule: { scheduledDate: '2025-03-11' } })).toEqual(100);
    expect(points({ rankingSnapshot: MATCH_DATE })).toEqual(20);
  });

  it('latestAvailable (the default) uses the most recent ranking', () => {
    expect(points({ rankingSnapshot: LATEST_AVAILABLE }, { endDate: '2025-03-02' })).toEqual(100);
    expect(points({}, { endDate: '2025-03-02' })).toEqual(100);
  });
});

describe('quality wins — unrankedOpponentBehavior', () => {
  it('noBonus (the default) awards nothing for an unranked opponent', () => {
    expect(points({ unrankedOpponentBehavior: NO_BONUS }, {}, unrankedOpponent)).toEqual(0);
    expect(points({}, {}, unrankedOpponent)).toEqual(0);
  });

  it('useDefaultRank ranks an unranked opponent at defaultRank', () => {
    expect(points({ unrankedOpponentBehavior: USE_DEFAULT_RANK, defaultRank: 8 }, {}, unrankedOpponent)).toEqual(100);
    expect(points({ unrankedOpponentBehavior: USE_DEFAULT_RANK, defaultRank: 80 }, {}, unrankedOpponent)).toEqual(20);
  });

  it('useDefaultRank applies when the opponent has no ranking as of the cutoff', () => {
    const laterOnly = { participantId: 'p2', timeItems: [rankingItem(5, '2025-03-10')] };
    const profile = { rankingSnapshot: TOURNAMENT_START, unrankedOpponentBehavior: USE_DEFAULT_RANK, defaultRank: 80 };
    expect(points(profile, {}, laterOnly)).toEqual(20);
  });

  it('useDefaultRank without a defaultRank awards nothing', () => {
    expect(points({ unrankedOpponentBehavior: USE_DEFAULT_RANK }, {}, unrankedOpponent)).toEqual(0);
  });

  it('a ranked opponent is never re-ranked at the default', () => {
    expect(points({ unrankedOpponentBehavior: USE_DEFAULT_RANK, defaultRank: 80 }, { endDate: '2025-03-12' })).toEqual(
      100,
    );
  });
});

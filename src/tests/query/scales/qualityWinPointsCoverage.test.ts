import { getQualityWinPoints } from '@Query/scales/getQualityWinPoints';
import { describe, expect, it } from 'vitest';

// constants
import { RANKING, SCALE } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';

function makeParticipant(id: string, rank?: number, scaleName = 'TEST', date?: string) {
  const timeItems: any[] = [];
  if (rank !== undefined) {
    timeItems.push({
      itemType: `${SCALE}.${RANKING}.${SINGLES}.${scaleName}`,
      itemValue: rank,
      itemDate: date || '2025-01-01',
      createdAt: date || '2025-01-01T00:00:00Z',
    });
  }
  return { participantId: id, timeItems };
}

function makeMatchUp(matchUpId: string, winningSide: number, side1Id: string, side2Id: string, status = 'COMPLETED') {
  return {
    matchUpId,
    winningSide,
    matchUpStatus: status,
    sides: [
      { sideNumber: 1, participantId: side1Id },
      { sideNumber: 2, participantId: side2Id },
    ],
  };
}

describe('getQualityWinPoints', () => {
  it('returns zero points when no matches won', () => {
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 10], value: 100 }] }],
      wonMatchUpIds: [],
      mappedMatchUps: {},
      participantSideMap: {},
      tournamentParticipants: [],
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
    expect(result.qualityWins).toHaveLength(0);
  });

  it('returns zero when matchUp not found in mappedMatchUps', () => {
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 10], value: 100 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: {},
      participantSideMap: { m1: 1 },
      tournamentParticipants: [],
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('skips walkovers and defaults by default', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2', 1)];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2', 'WALKOVER');
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 10], value: 100 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('includes walkovers when includeWalkovers is true', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2', 3)];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2', 'WALKOVER');
    const result = getQualityWinPoints({
      qualityWinProfiles: [
        {
          rankingScaleName: 'TEST',
          includeWalkovers: true,
          rankingRanges: [{ rankRange: [1, 5], value: 50 }],
        },
      ],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(50);
    expect(result.qualityWins).toHaveLength(1);
    expect(result.qualityWins[0].opponentRank).toBe(3);
  });

  it('skips when participant is not the winner', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2', 2)];
    const matchUp = makeMatchUp('m1', 2, 'p1', 'p2'); // p2 won
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 10], value: 100 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 }, // participant was side 1, but winner is side 2
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('skips unranked opponents with noBonus behavior', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2')]; // p2 has no rank
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2');
    const result = getQualityWinPoints({
      qualityWinProfiles: [
        {
          rankingScaleName: 'TEST',
          unrankedOpponentBehavior: 'noBonus',
          rankingRanges: [{ rankRange: [1, 10], value: 100 }],
        },
      ],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('applies maxBonusPerTournament cap', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2', 1), makeParticipant('p3', 2)];
    const m1 = makeMatchUp('m1', 1, 'p1', 'p2');
    const m2 = makeMatchUp('m2', 1, 'p1', 'p3');
    const result = getQualityWinPoints({
      qualityWinProfiles: [
        {
          rankingScaleName: 'TEST',
          rankingRanges: [{ rankRange: [1, 5], value: 100 }],
          maxBonusPerTournament: 150,
        },
      ],
      wonMatchUpIds: ['m1', 'm2'],
      mappedMatchUps: { m1, m2 },
      participantSideMap: { m1: 1, m2: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(150); // capped at 150 instead of 200
  });

  it('resolves value from level object', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2', 2)];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2');
    const result = getQualityWinPoints({
      qualityWinProfiles: [
        {
          rankingScaleName: 'TEST',
          rankingRanges: [{ rankRange: [1, 5], value: { level: { 1: 200, 2: 100 } } }],
        },
      ],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 2,
    });
    expect(result.qualityWinPoints).toBe(100);
  });

  it('uses tournamentStart ranking snapshot filter', () => {
    const participants = [
      makeParticipant('p1'),
      makeParticipant('p2', 3, 'TEST', '2024-12-01'), // before tournament start
    ];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2');
    const result = getQualityWinPoints({
      qualityWinProfiles: [
        {
          rankingScaleName: 'TEST',
          rankingSnapshot: 'tournamentStart',
          rankingRanges: [{ rankRange: [1, 5], value: 75 }],
        },
      ],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      tournamentStartDate: '2025-01-01',
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(75);
  });

  it('filters out rankings after tournament start date', () => {
    const p2 = {
      participantId: 'p2',
      timeItems: [
        {
          itemType: `${SCALE}.${RANKING}.${SINGLES}.TEST`,
          itemValue: 2,
          itemDate: '2025-06-01', // after tournament start
          createdAt: '2025-06-01T00:00:00Z',
        },
      ],
    };
    const participants = [makeParticipant('p1'), p2];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2');
    const result = getQualityWinPoints({
      qualityWinProfiles: [
        {
          rankingScaleName: 'TEST',
          rankingSnapshot: 'tournamentStart',
          rankingRanges: [{ rankRange: [1, 5], value: 50 }],
        },
      ],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      tournamentStartDate: '2025-01-01',
      level: 1,
    });
    // ranking date is after tournament start, so should be filtered out
    expect(result.qualityWinPoints).toBe(0);
  });

  it('skips opponent not found in participant lookup', () => {
    const participants = [makeParticipant('p1')]; // p2 not in participants
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2');
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 5], value: 50 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('handles no opponent on the other side', () => {
    const participants = [makeParticipant('p1')];
    const matchUp = {
      matchUpId: 'm1',
      winningSide: 1,
      matchUpStatus: 'COMPLETED',
      sides: [{ sideNumber: 1, participantId: 'p1' }],
    };
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 5], value: 50 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('skips opponent rank outside all ranges', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2', 50)];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2');
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 10], value: 100 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('skips DEFAULTED matchUps by default', () => {
    const participants = [makeParticipant('p1'), makeParticipant('p2', 1)];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2', 'DEFAULTED');
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 10], value: 100 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });

  it('handles ranking items with non-numeric itemValue', () => {
    const p2 = {
      participantId: 'p2',
      timeItems: [
        {
          itemType: `${SCALE}.${RANKING}.${SINGLES}.TEST`,
          itemValue: 'not-a-number',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
    };
    const participants = [makeParticipant('p1'), p2];
    const matchUp = makeMatchUp('m1', 1, 'p1', 'p2');
    const result = getQualityWinPoints({
      qualityWinProfiles: [{ rankingScaleName: 'TEST', rankingRanges: [{ rankRange: [1, 10], value: 100 }] }],
      wonMatchUpIds: ['m1'],
      mappedMatchUps: { m1: matchUp },
      participantSideMap: { m1: 1 },
      tournamentParticipants: participants,
      level: 1,
    });
    expect(result.qualityWinPoints).toBe(0);
  });
});

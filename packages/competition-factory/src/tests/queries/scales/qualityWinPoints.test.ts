import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { describe, expect, it } from 'vitest';
import { mocksEngine } from '../../..';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

// Helper to set ranking scaleItems on all participants
function setRankingsOnParticipants(participants: any[], scaleName: string, date?: string) {
  // Assign ranks 1..N based on participant order
  participants.forEach((p, index) => {
    const scaleItem = {
      scaleName,
      scaleType: RANKING,
      eventType: SINGLES,
      scaleValue: index + 1,
      scaleDate: date || '2025-01-01',
    };
    const result = tournamentEngine.setParticipantScaleItem({
      participantId: p.participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });
}

const qualityWinPolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    awardProfiles: [
      {
        profileName: 'Standard Elimination',
        drawTypes: [SINGLE_ELIMINATION],
        levels: [1, 2, 3],
        finishingPositionRanges: {
          1: { level: { 1: 1000, 2: 500, 3: 300 } },
          2: { level: { 1: 700, 2: 350, 3: 210 } },
          4: { level: { 1: 400, 2: 200, 3: 120 } },
          8: { level: { 1: 200, 2: 100, 3: 60 } },
        },
      },
    ],
    qualityWinProfiles: [
      {
        rankingScaleName: 'TEST_RANKING',
        rankingSnapshot: 'latestAvailable',
        unrankedOpponentBehavior: 'noBonus',
        includeWalkovers: false,
        rankingRanges: [
          { rankRange: [1, 2], value: 200 },
          { rankRange: [3, 4], value: 150 },
          { rankRange: [5, 8], value: 100 },
        ],
      },
    ],
  },
};

describe('Quality Win Points', () => {
  it('awards quality win bonus when beating a ranked opponent', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);

    // Set rankings on all participants
    const { participants } = tournamentEngine.getParticipants();
    setRankingsOnParticipants(participants, 'TEST_RANKING');

    // Re-read state with rankings applied
    const { tournamentRecord: updatedRecord } = tournamentEngine.getTournament();
    scaleEngine.setState(updatedRecord);

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: qualityWinPolicy, level: 1 });
    expect(result.success).toEqual(true);

    // The champion beat 3 opponents → should have quality win entries
    const allAwards = Object.values(result.personPoints).flat() as any[];
    const qualityWinAwards = allAwards.filter((a: any) => a.qualityWinPoints);
    expect(qualityWinAwards.length).toBeGreaterThan(0);

    // At least one quality win bonus should exist
    const totalQualityWinPoints = qualityWinAwards.reduce((sum, a: any) => sum + a.qualityWinPoints, 0);
    expect(totalQualityWinPoints).toBeGreaterThan(0);
  });

  it('does not award bonus for unranked opponents (noBonus)', () => {
    // Generate tournament without setting any rankings
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: qualityWinPolicy, level: 1 });
    expect(result.success).toEqual(true);

    // No rankings set → no quality win points
    const allAwards = Object.values(result.personPoints).flat() as any[];
    const qualityWinAwards = allAwards.filter((a: any) => a.qualityWinPoints);
    expect(qualityWinAwards.length).toEqual(0);
  });

  it('respects maxBonusPerTournament cap', () => {
    const cappedPolicy = {
      [POLICY_TYPE_RANKING_POINTS]: {
        ...qualityWinPolicy[POLICY_TYPE_RANKING_POINTS],
        qualityWinProfiles: [
          {
            ...qualityWinPolicy[POLICY_TYPE_RANKING_POINTS].qualityWinProfiles[0],
            maxBonusPerTournament: 100, // cap at 100 total
          },
        ],
      },
    };

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);
    const { participants } = tournamentEngine.getParticipants();
    setRankingsOnParticipants(participants, 'TEST_RANKING');

    const { tournamentRecord: updatedRecord } = tournamentEngine.getTournament();
    scaleEngine.setState(updatedRecord);

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: cappedPolicy, level: 1 });
    expect(result.success).toEqual(true);

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const qualityWinAwards = allAwards.filter((a: any) => a.qualityWinPoints);

    // Each quality win award should have points capped at 100
    for (const award of qualityWinAwards as any[]) {
      expect(award.qualityWinPoints).toBeLessThanOrEqual(100);
    }
  });

  it('quality wins include opponent rank and matchUp details', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);
    const { participants } = tournamentEngine.getParticipants();
    setRankingsOnParticipants(participants, 'TEST_RANKING');

    const { tournamentRecord: updatedRecord } = tournamentEngine.getTournament();
    scaleEngine.setState(updatedRecord);

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: qualityWinPolicy, level: 1 });

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const qualityWinAward = allAwards.find((a: any) => a.qualityWins?.length > 0);

    if (qualityWinAward) {
      const qw = qualityWinAward.qualityWins[0];
      expect(qw.opponentRank).toBeDefined();
      expect(qw.points).toBeDefined();
      expect(qw.matchUpId).toBeDefined();
      expect(qw.opponentParticipantId).toBeDefined();
    }
  });

  it('awards correct points based on opponent rank range', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
    });

    tournamentEngine.setState(tournamentRecord);
    const { participants } = tournamentEngine.getParticipants();
    setRankingsOnParticipants(participants, 'TEST_RANKING');

    const { tournamentRecord: updatedRecord } = tournamentEngine.getTournament();
    scaleEngine.setState(updatedRecord);

    const result = scaleEngine.getTournamentPoints({ policyDefinitions: qualityWinPolicy, level: 1 });

    const allAwards = Object.values(result.personPoints).flat() as any[];
    const qualityWinAwards = allAwards.filter((a: any) => a.qualityWins?.length > 0);

    // Check that quality wins have correct point values from rank ranges
    for (const award of qualityWinAwards as any[]) {
      for (const qw of award.qualityWins) {
        if (qw.opponentRank <= 2) {
          expect(qw.points).toEqual(200);
        } else if (qw.opponentRank <= 4) {
          expect(qw.points).toEqual(150);
        } else if (qw.opponentRank <= 8) {
          expect(qw.points).toEqual(100);
        }
      }
    }
  });
});

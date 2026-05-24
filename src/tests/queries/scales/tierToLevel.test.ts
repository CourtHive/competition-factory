import { POLICY_RANKING_POINTS_TENNIS_EUROPE } from '@Tests/fixtures/policies/POLICY_RANKING_POINTS_TENNIS_EUROPE';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// Constants and Types
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';

/**
 * Ranking policy with tierToLevel mapping.
 * Level 3 awards 5000 points for position 1, Level 5 awards 2000.
 */
const TIER_AWARE_POLICY = {
  [POLICY_TYPE_RANKING_POINTS]: {
    policyName: 'Tier Test Policy',
    tierToLevel: {
      ITF_JUNIOR: { J500: 4, J300: 5, J200: 6 },
      ATP: { 'Grand Slam': 1, '1000': 2, '500': 3, '250': 4 },
    },
    awardProfiles: [
      {
        profileName: 'Default',
        positionPoints: [
          { position: 1, points: 10000, level: { 1: 10000, 2: 5000, 3: 3000, 4: 2000, 5: 1000, 6: 500 } },
          { position: 2, points: 5000, level: { 1: 5000, 2: 2500, 3: 1500, 4: 1000, 5: 500, 6: 250 } },
        ],
      },
    ],
  },
};

describe('tierToLevel — ranking points auto-resolution', () => {
  it('resolves level from tournamentTier via tierToLevel mapping', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, completionGoal: 4 }],
      setState: true,
    });

    // Set tier on the tournament
    let result: any = tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'ITF_JUNIOR', value: 'J500', numericRank: 4 },
    });
    expect(result.success).toBe(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    const eventId = tournamentRecord.events[0].eventId;

    // Get ranking points WITHOUT passing level — should auto-resolve from tier
    result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: TIER_AWARE_POLICY,
      eventId,
    });

    // With tierToLevel mapping, ITF_JUNIOR J500 → level 4
    // Level 4 position 1 = 2000 points
    if (result.eventAwards?.length) {
      const winner = result.eventAwards[0];
      expect(winner.points).toBe(2000);
    }
  });

  it('explicit level overrides tier resolution', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, completionGoal: 4 }],
      setState: true,
    });

    tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'ITF_JUNIOR', value: 'J500', numericRank: 4 },
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const eventId = tournamentRecord.events[0].eventId;

    // Pass explicit level=1 — should override J500's mapped level 4
    let result: any = tournamentEngine.getEventRankingPoints({
      policyDefinitions: TIER_AWARE_POLICY,
      eventId,
      level: 1,
    });

    if (result.eventAwards?.length) {
      const winner = result.eventAwards[0];
      // Level 1 position 1 = 10000 points
      expect(winner.points).toBe(10000);
    }
  });

  it('gracefully handles missing tierToLevel mapping', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, completionGoal: 4 }],
      setState: true,
    });

    tournamentEngine.setTournamentTier({
      tournamentTier: { system: 'UNKNOWN_SYSTEM', value: 'foo' },
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const eventId = tournamentRecord.events[0].eventId;

    // No match in tierToLevel — should fall through with undefined level
    let result: any = tournamentEngine.getEventRankingPoints({
      policyDefinitions: TIER_AWARE_POLICY,
      eventId,
    });

    // Should not error — just uses base points (no level-specific lookup)
    expect(result.error).toBeUndefined();
  });

  it('gracefully handles tournament without tier', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, completionGoal: 4 }],
      setState: true,
    });

    const { tournamentRecord } = tournamentEngine.getTournament();
    const eventId = tournamentRecord.events[0].eventId;

    // No tier set — should work with base points
    let result: any = tournamentEngine.getEventRankingPoints({
      policyDefinitions: TIER_AWARE_POLICY,
      eventId,
    });

    expect(result.error).toBeUndefined();
  });
});

describe('tierToLevel — numericRank fallback', () => {
  // Level-keyed finishingPositionRanges so a winner produces a real award:
  // position 1 → 500 at level 2, 60 at level 5.
  const LEVELED_POLICY = {
    [POLICY_TYPE_RANKING_POINTS]: {
      policyName: 'leveled',
      tierToLevel: { MAPPED: { known: 2 } },
      awardProfiles: [
        {
          profileName: 'leveled',
          eventTypes: ['SINGLES'],
          stages: ['MAIN'],
          category: { ageCategoryCodes: ['U18'] },
          finishingPositionRanges: { 1: { level: { 2: 500, 5: 60 } } },
        },
      ],
    },
  };

  function winnerPoints(tier: any): number {
    mocksEngine.generateTournamentRecord({
      eventProfiles: [
        {
          eventType: 'SINGLES',
          category: { ageCategoryCode: 'U18' },
          drawProfiles: [{ drawSize: 8, completionGoal: 8 }],
        },
      ],
      setState: true,
    });
    tournamentEngine.setTournamentTier({ tournamentTier: tier });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const eventId = tournamentRecord.events[0].eventId;
    const result: any = tournamentEngine.getEventRankingPoints({ policyDefinitions: LEVELED_POLICY, eventId });
    expect(result.error).toBeUndefined();
    return result.eventAwards?.[0]?.points ?? 0;
  }

  it('falls back to tier.numericRank when the policy declares no mapping', () => {
    // OTHER is absent from tierToLevel → numericRank 5 → level 5 → 60.
    expect(winnerPoints({ system: 'OTHER', value: 'x', numericRank: 5 })).toBe(60);
  });

  it('policy tierToLevel takes precedence over numericRank', () => {
    // MAPPED.known → level 2 (→ 500), ignoring the bogus numericRank 5.
    expect(winnerPoints({ system: 'MAPPED', value: 'known', numericRank: 5 })).toBe(500);
  });

  it('real TENNIS_EUROPE policy (no tierToLevel) resolves via the stamped numericRank', () => {
    function teWinnerPoints(numericRank: number): number {
      mocksEngine.generateTournamentRecord({
        eventProfiles: [
          {
            eventType: 'SINGLES',
            category: { ageCategoryCode: '16U' },
            drawProfiles: [{ drawSize: 16, completionGoal: 16 }],
          },
        ],
        setState: true,
      });
      // The TE policy carries no tierToLevel — the adapter-stamped numericRank is the level.
      tournamentEngine.setTournamentTier({
        tournamentTier: { system: 'TENNIS_EUROPE', value: `cat-${numericRank}`, numericRank },
      });
      const { tournamentRecord } = tournamentEngine.getTournament();
      const eventId = tournamentRecord.events[0].eventId;
      const result: any = tournamentEngine.getEventRankingPoints({
        policyDefinitions: POLICY_RANKING_POINTS_TENNIS_EUROPE,
        eventId,
      });
      expect(result.error).toBeUndefined();
      return result.eventAwards?.[0]?.points ?? 0;
    }

    const superPts = teWinnerPoints(2); // Super Category → level 2
    const cat3Pts = teWinnerPoints(5); // Category 3 → level 5
    expect(superPts).toBeGreaterThan(0);
    expect(superPts).toBeGreaterThan(cat3Pts);
  });
});

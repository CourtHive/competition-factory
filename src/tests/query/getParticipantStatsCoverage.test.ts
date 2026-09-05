import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { expect, test } from 'vitest';

// constants
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

test('getParticipantStats with withCompetitiveProfiles covers competitiveness paths', () => {
  const drawSize = 8;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize }],
    completeAllMatchUps: true,
    randomWinningSide: true,
    policyDefinitions,
    setState: true,
  });

  // Call with withCompetitiveProfiles to cover lines 256-258, 298-302, and 333-341
  const result = tournamentEngine.getParticipantStats({
    withCompetitiveProfiles: true,
  });

  expect(result.success).toBe(true);
  expect(result.allParticipantStats).toBeDefined();
  expect(result.allParticipantStats.length).toEqual(drawSize);
  expect(result.participatingTeamsCount).toEqual(drawSize);
  expect(result.relevantMatchUps.length).toBeGreaterThan(0);

  // Verify competitiveness data is populated for at least some participants
  const statsWithCompetitiveness = result.allParticipantStats.filter((s) => Object.keys(s.competitiveness).length > 0);
  expect(statsWithCompetitiveness.length).toBeGreaterThan(0);

  // Verify competitiveness ratios are calculated (covers lines 333-341)
  const competitivenessKeys = ['competitive', 'routine', 'decisive'];
  const hasAnyCompetitivenessRatio = result.allParticipantStats.some((s) =>
    competitivenessKeys.some((key) => typeof s[`${key}Ratio`] === 'number'),
  );
  expect(hasAnyCompetitivenessRatio).toBe(true);

  // Verify ranking attributes are populated (covers lines 345-361)
  const rankAttributes = ['tiebreaksRank', 'matchUpsRank', 'pointsRank', 'gamesRank', 'setsRank'];
  const hasAnyRank = result.allParticipantStats.some((s) => rankAttributes.some((attr) => typeof s[attr] === 'number'));
  expect(hasAnyRank).toBe(true);
});

test('getParticipantStats with withCompetitiveProfiles and teamParticipantId', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4 }],
    completeAllMatchUps: true,
    randomWinningSide: true,
    policyDefinitions,
    setState: true,
  });

  // Get TEAM matchUps to find valid participant IDs
  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
  });
  const sideParticipantIds = matchUps[0].sides.map(xa('participantId'));
  const [teamParticipantId, opponentParticipantId] = sideParticipantIds;

  // Call with withCompetitiveProfiles AND teamParticipantId covers lines 364-366
  // The teamParticipantId path skips the ranking loop (lines 345-361)
  const result = tournamentEngine.getParticipantStats({
    withCompetitiveProfiles: true,
    opponentParticipantId,
    teamParticipantId,
  });

  expect(result.success).toBe(true);
  expect(result.teamStats).toBeDefined();
  expect(result.opponentStats).toBeDefined();
  expect(result.allParticipantStats).toBeDefined();
  expect(result.allParticipantStats.length).toEqual(2);

  // Verify competitiveness is populated on team stats
  expect(result.teamStats.competitiveness).toBeDefined();
  expect(result.opponentStats.competitiveness).toBeDefined();

  // participatingTeamsCount should NOT be set when teamParticipantId is provided
  expect(result.participatingTeamsCount).toBeUndefined();
});

test('getParticipantStats without teamParticipantId returns participatingTeamsCount and ranks', () => {
  const drawSize = 8;
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize }],
    completeAllMatchUps: true,
    randomWinningSide: true,
    policyDefinitions,
    setState: true,
  });

  // General call without teamParticipantId covers lines 367-369 (participatingTeamsCount)
  // and ensures ranking loop (lines 345-361) runs
  const result = tournamentEngine.getParticipantStats({});

  expect(result.success).toBe(true);
  expect(result.participatingTeamsCount).toEqual(drawSize);
  expect(result.teamStats).toBeUndefined();
  expect(result.opponentStats).toBeUndefined();

  // All participants should have ratio and rank attributes
  for (const stats of result.allParticipantStats) {
    // Every participating team should have a matchUpsRatio
    if (stats.matchUps[0] + stats.matchUps[1] > 0) {
      expect(typeof stats.matchUpsRatio).toBe('number');
      expect(typeof stats.matchUpsRank).toBe('number');
      expect(stats.matchUpsRank).toBeGreaterThanOrEqual(1);
    }
  }
});

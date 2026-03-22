import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

import { COLLEGE_D3, DOMINANT_DUO, USTA_LEVEL_1, USTA_BREWER_CUP } from '@Constants/tieFormatConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { TEAM_MATCHUP, SINGLES, DOUBLES } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('tieFormat optimisation via aggregateTieFormats', () => {
  it('aggregates a basic team tournament and tieMatchUps still hydrate', () => {
    const drawSize = 8;
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
      setState: true,
    });

    // Before aggregation: verify tieMatchUps hydrate
    let result: any = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    });
    const preTeamMatchUps = result.matchUps;
    expect(preTeamMatchUps.length).toEqual(drawSize - 1);
    expect(preTeamMatchUps.every((m) => m.tieMatchUps?.length > 0)).toBeTruthy();

    const preTieMatchUpCount = preTeamMatchUps.reduce((sum, m) => sum + m.tieMatchUps.length, 0);

    // Aggregate
    result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toBeGreaterThan(0);

    // After aggregation: verify tieMatchUps still hydrate identically
    result = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    });
    const postTeamMatchUps = result.matchUps;
    expect(postTeamMatchUps.length).toEqual(preTeamMatchUps.length);
    expect(postTeamMatchUps.every((m) => m.tieMatchUps?.length > 0)).toBeTruthy();

    const postTieMatchUpCount = postTeamMatchUps.reduce((sum, m) => sum + m.tieMatchUps.length, 0);
    expect(postTieMatchUpCount).toEqual(preTieMatchUpCount);

    // Verify all raw matchUps use tieFormatId references (not inline tieFormat)
    const rawMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
      inContext: false,
    }).matchUps;
    expect(rawMatchUps.every((m) => !m.tieFormat)).toBeTruthy();

    // Verify event has tieFormats array and no inline tieFormat
    const { tournamentRecord: tr } = tournamentEngine.getTournament();
    const event = tr.events.find((e) => e.eventId === eventId);
    expect(event.tieFormats?.length).toBeGreaterThan(0);
    expect(event.tieFormat).toBeUndefined();
  });

  it('adds collection to specific matchUp, aggregates, and verifies hydration', () => {
    const drawSize = 4;
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO }],
      policyDefinitions,
      setState: true,
    });

    // Get a specific team matchUp
    const teamMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    const targetMatchUp = teamMatchUps[0];
    const originalTieMatchUpCount = targetMatchUp.tieMatchUps.length;

    // Add an extra collection to just this matchUp
    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Extra Mixed Doubles',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: DOUBLES,
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId: targetMatchUp.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // The target matchUp should have more tieMatchUps now
    const updatedMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    const updatedTarget = updatedMatchUps.find((m) => m.matchUpId === targetMatchUp.matchUpId);
    expect(updatedTarget.tieMatchUps.length).toBeGreaterThan(originalTieMatchUpCount);

    // Aggregate — should create separate tieFormat entries for modified and unmodified
    result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toBeGreaterThanOrEqual(1);

    // Verify all matchUps still hydrate
    const postMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    expect(postMatchUps.every((m) => m.tieMatchUps?.length > 0)).toBeTruthy();
    expect(postMatchUps.every((m) => m.tieFormat)).toBeTruthy();

    // The modified matchUp should have the extra collection
    const postTarget = postMatchUps.find((m) => m.matchUpId === targetMatchUp.matchUpId);
    expect(postTarget.tieMatchUps.length).toEqual(updatedTarget.tieMatchUps.length);

    // Other matchUps should still have the original count
    const otherMatchUps = postMatchUps.filter((m) => m.matchUpId !== targetMatchUp.matchUpId);
    for (const m of otherMatchUps) {
      if (!m.tieFormat) continue; // inherited from event
      expect(m.tieMatchUps.length).toEqual(originalTieMatchUpCount);
    }
  });

  it('different tieFormat per round via modifyTieFormat, then aggregation preserves per-round formats', () => {
    const drawSize = 4;
    const {
      drawIds: [drawId],
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
      setState: true,
    });

    const originalTieFormat = tournamentEngine.getTieFormat({ eventId, drawId }).tieFormat;
    const originalCollectionCount = originalTieFormat.collectionDefinitions.length;

    // Get round 2 (final) matchUp
    const r2MatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP], roundNumbers: [2] },
    }).matchUps;
    expect(r2MatchUps.length).toEqual(1);

    // Modify the final's tieFormat — change matchUpFormat for all collections
    const modified = copyTieFormat(originalTieFormat);
    modified.tieFormatName = 'Final Format';
    for (const cd of modified.collectionDefinitions) {
      cd.matchUpFormat = 'SET1-S:4/TB7';
    }

    let result: any = tournamentEngine.modifyTieFormat({
      matchUpId: r2MatchUps[0].matchUpId,
      modifiedTieFormat: modified,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Count pre-aggregation tieMatchUps
    const preAllMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    const preTieMatchUpCounts = preAllMatchUps.map((m) => ({
      matchUpId: m.matchUpId,
      count: m.tieMatchUps.length,
    }));

    // Aggregate
    result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);

    // After aggregation — verify tieMatchUp counts preserved
    const postAllMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    expect(postAllMatchUps.every((m) => m.tieMatchUps?.length > 0)).toBeTruthy();

    for (const pre of preTieMatchUpCounts) {
      const post = postAllMatchUps.find((m) => m.matchUpId === pre.matchUpId);
      expect(post.tieMatchUps.length).toEqual(pre.count);
    }

    // The final matchUp's tieFormat should reflect the modification
    const postFinal = postAllMatchUps.find((m) => m.matchUpId === r2MatchUps[0].matchUpId);
    if (postFinal.tieFormat.tieFormatName) {
      // If name was preserved, it should be the modified name
      expect(postFinal.tieFormat.collectionDefinitions[0].matchUpFormat).toEqual('SET1-S:4/TB7');
    }

    // Every tieMatchUp should have proper collection metadata
    for (const teamMatchUp of postAllMatchUps) {
      for (const tieMatchUp of teamMatchUp.tieMatchUps) {
        expect(tieMatchUp.collectionId).toBeDefined();
        expect(tieMatchUp.collectionPosition).toBeDefined();
        expect(tieMatchUp.matchUpId).toBeDefined();
        expect([SINGLES, DOUBLES]).toContain(tieMatchUp.matchUpType);
      }
    }
  });

  it('aggregation is idempotent — running twice produces same result', () => {
    const drawSize = 4;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, eventType: TEAM_EVENT, tieFormatName: USTA_LEVEL_1 }],
      policyDefinitions,
      setState: true,
    });

    // First aggregation
    let result: any = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);

    const firstMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    const firstTieMatchUpCounts = firstMatchUps.map((m) => m.tieMatchUps?.length);

    // Second aggregation — should add 0 more
    result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toEqual(0);

    // MatchUps should hydrate identically
    const secondMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    const secondTieMatchUpCounts = secondMatchUps.map((m) => m.tieMatchUps?.length);
    expect(secondTieMatchUpCounts).toEqual(firstTieMatchUpCounts);
  });

  it('handles multiple events with different tieFormats', () => {
    const {
      eventIds: [eventId1, eventId2],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 4, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 },
        { drawSize: 4, eventType: TEAM_EVENT, tieFormatName: USTA_BREWER_CUP },
      ],
      policyDefinitions,
      setState: true,
    });

    // Aggregate
    let result: any = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);

    // Each event should have its own tieFormats array
    const { tournamentRecord: tr } = tournamentEngine.getTournament();
    const event1 = tr.events.find((e) => e.eventId === eventId1);
    const event2 = tr.events.find((e) => e.eventId === eventId2);
    expect(event1.tieFormats?.length).toBeGreaterThan(0);
    expect(event2.tieFormats?.length).toBeGreaterThan(0);

    // Hydration should work across both events
    const allTeamMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    expect(allTeamMatchUps.length).toEqual(6); // 3 per 4-draw event
    expect(allTeamMatchUps.every((m) => m.tieMatchUps?.length > 0)).toBeTruthy();
    expect(allTeamMatchUps.every((m) => m.tieFormat)).toBeTruthy();

    // Event 1 matchUps should have College D3 format
    const event1MatchUps = allTeamMatchUps.filter((m) => m.eventId === eventId1);
    expect(event1MatchUps.every((m) => m.tieFormat.tieFormatName === 'College D3')).toBeTruthy();

    // Event 2 matchUps should have Brewer Cup format
    const event2MatchUps = allTeamMatchUps.filter((m) => m.eventId === eventId2);
    expect(event2MatchUps.every((m) => m.tieFormat.tieFormatName === 'Brewer Cup')).toBeTruthy();
  });

  it('aggregation with completed matchUps preserves scores and tieMatchUp results', () => {
    const drawSize = 4;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO }],
      completeAllMatchUps: true,
      policyDefinitions,
      setState: true,
    });

    // Before aggregation: capture matchUp scores
    let result: any = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    });
    const preMatchUps = result.matchUps;
    expect(preMatchUps.length).toEqual(drawSize - 1);
    expect(preMatchUps.every((m) => m.winningSide)).toBeTruthy();

    const preScores = preMatchUps.map((m) => ({
      matchUpId: m.matchUpId,
      winningSide: m.winningSide,
      tieMatchUpCount: m.tieMatchUps?.length,
      completedTieMatchUps: m.tieMatchUps?.filter((tm) => tm.winningSide)?.length,
    }));

    // Aggregate
    result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);

    // After aggregation: verify scores preserved
    const postMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;

    for (const pre of preScores) {
      const post = postMatchUps.find((m) => m.matchUpId === pre.matchUpId);
      expect(post).toBeDefined();
      expect(post.winningSide).toEqual(pre.winningSide);
      expect(post.tieMatchUps?.length).toEqual(pre.tieMatchUpCount);
      expect(post.tieMatchUps?.filter((tm) => tm.winningSide)?.length).toEqual(pre.completedTieMatchUps);
    }
  });

  it('tieMatchUp collectionId and matchUpType survive aggregation', () => {
    const drawSize = 4;
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize, eventType: TEAM_EVENT, tieFormatName: USTA_LEVEL_1 }],
      policyDefinitions,
      setState: true,
    });

    // Before aggregation: capture tieMatchUp details
    const preMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;

    const preTieDetails = preMatchUps.flatMap((m) =>
      m.tieMatchUps.map((tm) => ({
        parentMatchUpId: m.matchUpId,
        matchUpId: tm.matchUpId,
        collectionId: tm.collectionId,
        collectionPosition: tm.collectionPosition,
        matchUpType: tm.matchUpType,
      })),
    );

    // Aggregate
    let result: any = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);

    // After aggregation
    const postMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;

    const postTieDetails = postMatchUps.flatMap((m) =>
      m.tieMatchUps.map((tm) => ({
        parentMatchUpId: m.matchUpId,
        matchUpId: tm.matchUpId,
        collectionId: tm.collectionId,
        collectionPosition: tm.collectionPosition,
        matchUpType: tm.matchUpType,
      })),
    );

    expect(postTieDetails.length).toEqual(preTieDetails.length);

    for (const pre of preTieDetails) {
      const post = postTieDetails.find((p) => p.matchUpId === pre.matchUpId);
      expect(post).toBeDefined();
      expect(post.collectionId).toEqual(pre.collectionId);
      expect(post.collectionPosition).toEqual(pre.collectionPosition);
      expect(post.matchUpType).toEqual(pre.matchUpType);
    }
  });

  it('aggregation after multiple draws with different formats in same event', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 }],
      policyDefinitions,
      setState: true,
    });

    // Add a second draw with a different tieFormat to the same event
    const d2 = tournamentEngine.generateDrawDefinition({
      tieFormatName: DOMINANT_DUO,
      eventId,
    });
    expect(d2.success).toEqual(true);

    let result: any = tournamentEngine.addDrawDefinition({
      drawDefinition: d2.drawDefinition,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Count all team matchUps before aggregation
    const preMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    const preTotalTieMatchUps = preMatchUps.reduce((sum, m) => sum + m.tieMatchUps.length, 0);

    // Aggregate
    result = tournamentEngine.aggregateTieFormats();
    expect(result.success).toEqual(true);
    expect(result.addedCount).toBeGreaterThanOrEqual(2); // at least 2 different formats

    // Verify event.tieFormats has entries for both formats
    const { tournamentRecord: tr } = tournamentEngine.getTournament();
    const event = tr.events.find((e) => e.eventId === eventId);
    expect(event.tieFormats?.length).toBeGreaterThanOrEqual(2);

    // All matchUps should still hydrate
    const postMatchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps;
    expect(postMatchUps.every((m) => m.tieMatchUps?.length > 0)).toBeTruthy();
    expect(postMatchUps.every((m) => m.tieFormat)).toBeTruthy();

    const postTotalTieMatchUps = postMatchUps.reduce((sum, m) => sum + m.tieMatchUps.length, 0);
    expect(postTotalTieMatchUps).toEqual(preTotalTieMatchUps);
  });
});

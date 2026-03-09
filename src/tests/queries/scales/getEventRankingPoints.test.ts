import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { MISSING_EVENT, MISSING_POLICY_DEFINITION } from '@Constants/errorConditionConstants';
import { POLICY_RANKING_POINTS_BASIC } from '@Fixtures/policies/POLICY_RANKING_POINTS_BASIC';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

const policyDefinitions = POLICY_RANKING_POINTS_BASIC;

describe('getEventRankingPoints', () => {
  it('returns error without eventId', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ policyDefinitions });
    expect(result.error).toEqual(MISSING_EVENT);
  });

  it('returns error without policy definitions', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8 }],
      completeAllMatchUps: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId });
    expect(result.error).toEqual(MISSING_POLICY_DEFINITION);
  });

  it('generates basic ranking points for a singles elimination event', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions });
    expect(result.success).toBe(true);
    expect(result.eventName).toBeDefined();
    expect(result.eventType).toEqual(SINGLES);
    expect(result.eventAwards).toBeDefined();
    expect(Array.isArray(result.eventAwards)).toBe(true);

    // 8-draw single elimination: 8 participants should all get awards
    // (positions 1, 2, 3-4 x2, 5-8 x4)
    expect(result.eventAwards.length).toBeGreaterThanOrEqual(1);

    // Awards should be sorted by points descending
    for (let i = 1; i < result.eventAwards.length; i++) {
      expect(result.eventAwards[i - 1].points).toBeGreaterThanOrEqual(result.eventAwards[i].points);
    }

    // Each award should have required fields
    for (const award of result.eventAwards) {
      expect(award.participantName).toBeDefined();
      expect(award.participantId).toBeDefined();
      expect(typeof award.points).toBe('number');
      expect(award.points).toBeGreaterThan(0);
    }

    // Check that the winner gets 100 points (basic policy: position 1 = 100)
    const topAward = result.eventAwards[0];
    expect(topAward.positionPoints).toEqual(100);

    // Check finalist gets 70
    const secondAward = result.eventAwards.find((a: any) => a.positionPoints === 70);
    expect(secondAward).toBeDefined();
  });

  it('scopes results to the specified event only', () => {
    const {
      tournamentRecord,
      eventIds: [eventId1, eventId2],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        { drawSize: 8, eventName: 'Event A' },
        { drawSize: 16, eventName: 'Event B' },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result1 = tournamentEngine.getEventRankingPoints({ eventId: eventId1, policyDefinitions });
    const result2 = tournamentEngine.getEventRankingPoints({ eventId: eventId2, policyDefinitions });

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    // Event A has 8 participants, Event B has 16
    // Awards should differ in count (some participants may share across events,
    // but awards scoped to each event's draws should be different)
    expect(result1.eventAwards.length).toBeLessThan(result2.eventAwards.length);
    expect(result1.eventName).toEqual('Event A');
    expect(result2.eventName).toEqual('Event B');
  });

  it('works with a 32-draw and validates point distribution', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 32, drawType: SINGLE_ELIMINATION }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions });
    expect(result.success).toBe(true);

    // With requireWinForPoints, first-round losers (17-32, worth 8 pts) get no award.
    // Remaining positions: 100 (1st), 70 (2nd), 50 (3-4), 30 (5-8), 15 (9-16)
    const pointValues = new Set(result.eventAwards.map((a: any) => a.positionPoints));
    expect(pointValues.has(100)).toBe(true);
    expect(pointValues.has(70)).toBe(true);
    expect(pointValues.has(50)).toBe(true);
    expect(pointValues.has(30)).toBe(true);
    expect(pointValues.has(15)).toBe(true);

    // First-round losers should NOT receive points (requireWinForPoints)
    expect(result.eventAwards.every((a: any) => a.winCount > 0)).toBe(true);
  });

  it('awards no points when no matchUps have been completed', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
      // no completeAllMatchUps — draw is generated but no results
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions });
    expect(result.success).toBe(true);
    expect(result.eventAwards).toBeDefined();
    expect(Array.isArray(result.eventAwards)).toBe(true);

    // No matchUps played means no participant should receive points
    expect(result.eventAwards.length).toBe(0);
  });

  it('awards points only to participants who have played matchUps', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, drawType: SINGLE_ELIMINATION }],
    });
    tournamentEngine.setState(tournamentRecord);

    // Complete only the first matchUp in round 1
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const round1MatchUps = matchUps.filter((m: any) => m.roundNumber === 1);
    expect(round1MatchUps.length).toBe(4);

    const firstMatchUp = round1MatchUps[0];
    tournamentEngine.setMatchUpStatus({
      matchUpId: firstMatchUp.matchUpId,
      outcome: { winningSide: 1 },
      drawId,
    });

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions });
    expect(result.success).toBe(true);

    // With requireWinForPoints in the basic policy, only the winner gets an award
    expect(result.eventAwards.length).toBe(1);

    const winner = result.eventAwards[0];
    expect(winner.winCount).toBe(1);
    expect(winner.points).toBeGreaterThan(0);
  });

  it('works for doubles events with basic policy', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.getEventRankingPoints({ eventId, policyDefinitions });
    expect(result.success).toBe(true);
    expect(result.eventType).toEqual(DOUBLES);
    expect(result.isDoubles).toBe(true);

    // With doublesAttribution: 'fullToEach', individual players should get awards
    expect(result.eventAwards.length).toBeGreaterThan(0);
  });
});

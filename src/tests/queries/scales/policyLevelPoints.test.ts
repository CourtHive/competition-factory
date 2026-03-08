/**
 * Tests that parallel TMX user testing of ranking points policies with the
 * "Ranking Points Demo" tournament pattern (completed singles elimination draws).
 *
 * Validates that each policy (Basic, ATP, WTA, ITF WTT, USTA Junior) generates
 * points when a level is provided, and explains why ITF WTT produces no points
 * for main-draw-only tournaments.
 */
import { expect, it, describe, beforeEach } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and fixtures
import { POLICY_RANKING_POINTS_USTA_JUNIOR } from '@Fixtures/policies/POLICY_RANKING_POINTS_USTA_JUNIOR';
import { POLICY_RANKING_POINTS_ITF_WTT } from '@Fixtures/policies/POLICY_RANKING_POINTS_ITF_WTT';
import { POLICY_RANKING_POINTS_BASIC } from '@Fixtures/policies/POLICY_RANKING_POINTS_BASIC';
import { POLICY_RANKING_POINTS_ATP } from '@Fixtures/policies/POLICY_RANKING_POINTS_ATP';
import { POLICY_RANKING_POINTS_WTA } from '@Fixtures/policies/POLICY_RANKING_POINTS_WTA';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/eventConstants';

// Mirrors the TMX "Ranking Points Demo" tournament: 32-draw SE, completed
let eventId: string;

beforeEach(() => {
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: SINGLE_ELIMINATION, eventType: SINGLES }],
    completeAllMatchUps: true,
    randomWinningSide: true,
  });
  eventId = result.eventIds[0];
  tournamentEngine.setState(result.tournamentRecord);
});

describe('Basic Ranking Points — no level required', () => {
  it('generates points without a level parameter', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_BASIC,
      eventId,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toEqual(32);
    expect(result.eventAwards[0].positionPoints).toEqual(100);
  });
});

describe('ATP Ranking Points — requires level', () => {
  it('produces no awards without a level', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ATP,
      eventId,
    });
    // Without level, no ATP profile matches (all require levels)
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toEqual(0);
  });

  it('produces awards at level 1 (Grand Slam)', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ATP,
      eventId,
      level: 1,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toBeGreaterThan(0);
    // Grand Slam champion gets 2000 points
    expect(result.eventAwards[0].positionPoints).toEqual(2000);
  });

  it('produces awards at level 8 (ATP 250, 32-draw)', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ATP,
      eventId,
      level: 8,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toBeGreaterThan(0);
    // ATP 250 champion gets 250 points
    expect(result.eventAwards[0].positionPoints).toEqual(250);
  });

  it('produces different point values at different levels', () => {
    const level1 = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ATP,
      eventId,
      level: 1,
    });
    const level8 = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ATP,
      eventId,
      level: 8,
    });
    expect(level1.eventAwards[0].positionPoints).toBeGreaterThan(level8.eventAwards[0].positionPoints);
  });
});

describe('WTA Ranking Points — requires level', () => {
  it('produces no awards without a level', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_WTA,
      eventId,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toEqual(0);
  });

  it('produces awards at level 1 (Grand Slam)', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_WTA,
      eventId,
      level: 1,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toBeGreaterThan(0);
    // WTA Grand Slam champion gets 2000 points
    expect(result.eventAwards[0].positionPoints).toEqual(2000);
  });

  it('produces awards at level 5 (WTA 250)', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_WTA,
      eventId,
      level: 5,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toBeGreaterThan(0);
  });
});

describe('USTA Junior Ranking Points — requires level', () => {
  it('produces no awards without a level', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_USTA_JUNIOR,
      eventId,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toEqual(0);
  });

  it('produces awards at level 1 (National Championships)', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_USTA_JUNIOR,
      eventId,
      level: 1,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toBeGreaterThan(0);
  });

  it('produces awards at level 7 (Intermediate)', () => {
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_USTA_JUNIOR,
      eventId,
      level: 7,
    });
    expect(result.success).toBe(true);
    expect(result.eventAwards.length).toBeGreaterThan(0);
  });

  it('produces different point values at different levels', () => {
    const level1 = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_USTA_JUNIOR,
      eventId,
      level: 1,
    });
    const level7 = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_USTA_JUNIOR,
      eventId,
      level: 7,
    });
    expect(level1.eventAwards[0].points).toBeGreaterThan(level7.eventAwards[0].points);
  });
});

describe('ITF World Tennis Tour — qualifying-only policy', () => {
  it('produces NO awards for a main-draw-only tournament (the root cause)', () => {
    // ITF WTT policy ONLY awards points for QUALIFYING stages.
    // A standard SE tournament with no qualifying draw will never produce points.
    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ITF_WTT,
      eventId,
      level: 1,
    });
    expect(result.success).toBe(true);
    // This is the expected behavior — ITF WTT only covers qualifying rounds
    expect(result.eventAwards.length).toEqual(0);
  });

  it('produces awards when a qualifying structure exists', () => {
    // Create a tournament with a qualifying draw
    const generated = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          drawType: SINGLE_ELIMINATION,
          eventType: SINGLES,
          qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }],
        },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(generated.tournamentRecord);
    const qEventId = generated.eventIds[0];

    const result = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ITF_WTT,
      eventId: qEventId,
      level: 1,
    });
    expect(result.success).toBe(true);
    // Qualifiers (position 1 in qualifying) should get 4 points at level 1
    // and final-round losers (position 2) should get 1 point
    expect(result.eventAwards.length).toBeGreaterThan(0);

    const qualifierAwards = result.eventAwards.filter((a: any) => a.positionPoints === 4);
    const frlAwards = result.eventAwards.filter((a: any) => a.positionPoints === 1);
    expect(qualifierAwards.length).toBeGreaterThan(0);
    expect(frlAwards.length).toBeGreaterThan(0);
  });

  it('awards different qualifying points per level', () => {
    const generated = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawSize: 16,
          drawType: SINGLE_ELIMINATION,
          eventType: SINGLES,
          qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 4 }] }],
        },
      ],
      completeAllMatchUps: true,
      randomWinningSide: true,
    });
    tournamentEngine.setState(generated.tournamentRecord);
    const qEventId = generated.eventIds[0];

    // Level 1 ($25K +H): Qualifier = 4 pts
    const level1 = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ITF_WTT,
      eventId: qEventId,
      level: 1,
    });

    // Level 4 ($15K): Qualifier = 2 pts
    const level4 = tournamentEngine.getEventRankingPoints({
      policyDefinitions: POLICY_RANKING_POINTS_ITF_WTT,
      eventId: qEventId,
      level: 4,
    });

    expect(level1.success).toBe(true);
    expect(level4.success).toBe(true);

    const l1QualifierPts = level1.eventAwards.find((a: any) => a.positionPoints > 1)?.positionPoints;
    const l4QualifierPts = level4.eventAwards.find((a: any) => a.positionPoints > 1)?.positionPoints;

    // Level 1 qualifier gets 4, level 4 qualifier gets 2
    expect(l1QualifierPts).toEqual(4);
    expect(l4QualifierPts).toEqual(2);
  });
});

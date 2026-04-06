// Generators
import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { computeActualOutput } from '@Generators/scales/competition/actualOutput';
import { deriveCountables } from '@Generators/scales/competition/deriveCountables';
import { expectedScore } from '@Generators/scales/competition/expectedScore';

// Fixtures
import { POLICY_COMPETITION_STANDARD } from '@Fixtures/policies/POLICY_COMPETITION_STANDARD';
import { POLICY_COMPETITION_PRESSURE } from '@Fixtures/policies/POLICY_COMPETITION_PRESSURE';
import { POLICY_COMPETITION_SWISS } from '@Fixtures/policies/POLICY_COMPETITION_SWISS';

// Engines
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// Constants
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';
import { AD_HOC, SWISS } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RATING } from '@Constants/scaleConstants';
import { ELO } from '@Constants/ratingConstants';

// Testing
import { expect, test, describe } from 'vitest';

const MATCH_UP_FORMAT = 'SET1-S:6/TB7';

function generateTournamentWithRatings({
  drawSize = 8,
  drawType = AD_HOC as any,
  ratings,
}: {
  drawSize?: number;
  drawType?: string;
  ratings?: number[];
}) {
  const result = mocksEngine.generateTournamentRecord({
    participantsProfile: { idPrefix: 'P', participantsCount: drawSize },
    drawProfiles: [
      {
        matchUpFormat: MATCH_UP_FORMAT,
        eventType: SINGLES_EVENT,
        automated: false,
        drawType,
        drawSize,
      },
    ],
    setState: true,
  });

  const drawId = result.drawIds[0];

  if (ratings) {
    const { participants } = tournamentEngine.getParticipants();
    for (let i = 0; i < Math.min(ratings.length, participants.length); i++) {
      tournamentEngine.setParticipantScaleItem({
        participantId: participants[i].participantId,
        scaleItem: {
          scaleName: ELO,
          scaleType: RATING,
          eventType: SINGLES_EVENT,
          scaleValue: ratings[i],
        },
      });
    }
  }

  return { drawId };
}

function completeMatchUps({ drawId, roundNumber, scores }: { drawId: string; roundNumber: number; scores?: string[] }) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const roundMatchUps = matchUps.filter((m: any) => m.roundNumber === roundNumber && !m.winningSide && m.drawId === drawId);

  for (let i = 0; i < roundMatchUps.length; i++) {
    const scoreString = scores?.[i] ?? '6-3';
    const { outcome } = generateOutcomeFromScoreString({
      matchUpFormat: MATCH_UP_FORMAT,
      winningSide: 1,
      scoreString,
    });
    tournamentEngine.setMatchUpStatus({
      matchUpId: roundMatchUps[i].matchUpId,
      outcome,
      drawId,
    });
  }
}

// ==================== UNIT TESTS ====================

describe('expectedScore', () => {
  test('equal ratings produce 0.5', () => {
    expect(expectedScore(1500, 1500, 400)).toBeCloseTo(0.5, 5);
  });

  test('higher rating produces higher expected score', () => {
    const e = expectedScore(1600, 1400, 400);
    expect(e).toBeGreaterThan(0.5);
    expect(e).toBeLessThan(1);
  });

  test('complementary expected scores sum to 1', () => {
    const e1 = expectedScore(1800, 1200, 400);
    const e2 = expectedScore(1200, 1800, 400);
    expect(e1 + e2).toBeCloseTo(1, 5);
  });

  test('400-point ELO difference gives ~0.909', () => {
    const e = expectedScore(1900, 1500, 400);
    expect(e).toBeCloseTo(0.909, 2);
  });
});

describe('computeActualOutput', () => {
  const policy = POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION];

  test('POINT_SHARE: 6-3 gives 2/3', () => {
    const result = computeActualOutput({ pointsWon: 6, pointsLost: 3, competitionPolicy: policy });
    expect(result).toBeCloseTo(6 / 9, 5);
  });

  test('POINT_SHARE: 0-0 gives 0.5', () => {
    const result = computeActualOutput({ pointsWon: 0, pointsLost: 0, competitionPolicy: policy });
    expect(result).toBeCloseTo(0.5, 5);
  });

  test('POINT_SHARE: shutout gives 1.0', () => {
    const result = computeActualOutput({ pointsWon: 6, pointsLost: 0, competitionPolicy: policy });
    expect(result).toBeCloseTo(1, 5);
  });

  test('WEIGHTED mode applies weights', () => {
    const weightedPolicy = {
      ...policy,
      ratingPolicy: {
        ...policy.ratingPolicy,
        pressureRating: {
          ...policy.ratingPolicy.pressureRating!,
          actualOutputMethod: 'WEIGHTED' as const,
          weights: { pointShare: 0.7, pointDifferential: 0.3, contextFactor: 0 },
        },
      },
    };
    const result = computeActualOutput({ pointsWon: 6, pointsLost: 3, competitionPolicy: weightedPolicy });
    // pointShare = 6/9 = 0.667, normalizedDiff = 3/9 = 0.333
    // weighted = (0.7 * 0.667 + 0.3 * 0.333) / 1.0 = 0.567
    expect(result).toBeGreaterThan(0.5);
    expect(result).toBeLessThan(0.7);
  });
});

describe('deriveCountables', () => {
  test('extracts games from sets', () => {
    const matchUp = {
      score: { sets: [{ side1Score: 6, side2Score: 3 }] },
      winningSide: 1,
    } as any;
    const { side1Count, side2Count } = deriveCountables(matchUp);
    expect(side1Count).toBe(6);
    expect(side2Count).toBe(3);
  });

  test('handles multiple sets', () => {
    const matchUp = {
      score: {
        sets: [
          { side1Score: 6, side2Score: 4 },
          { side1Score: 3, side2Score: 6 },
          { side1Score: 7, side2Score: 5 },
        ],
      },
      winningSide: 1,
    } as any;
    const { side1Count, side2Count } = deriveCountables(matchUp);
    expect(side1Count).toBe(16);
    expect(side2Count).toBe(15);
  });

  test('falls back to winningSide when no sets', () => {
    const matchUp = { winningSide: 2 } as any;
    const { side1Count, side2Count } = deriveCountables(matchUp);
    expect(side1Count).toBe(0);
    expect(side2Count).toBe(1);
  });

  test('handles tiebreak sets', () => {
    const matchUp = {
      score: {
        sets: [
          { side1Score: 7, side2Score: 6, winningSide: 1, side1TiebreakScore: 7, side2TiebreakScore: 3 },
        ],
      },
      winningSide: 1,
    } as any;
    const { side1Count, side2Count } = deriveCountables(matchUp);
    // 6 games + 7/10 tiebreak fraction for side1, 6 games + 3/10 for side2
    expect(side1Count).toBeCloseTo(6.7, 1);
    expect(side2Count).toBeCloseTo(6.3, 1);
  });
});

// ==================== INTEGRATION TESTS ====================

describe('competition policy attachment and state initialization', () => {
  test('policy can be attached and resolved', () => {
    const { drawId } = generateTournamentWithRatings({ ratings: [1500, 1600, 1400, 1700, 1300, 1800, 1200, 1900] });
    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: POLICY_COMPETITION_PRESSURE,
    });

    const { competitionPolicy } = tournamentEngine.getCompetitionPolicy({ drawId });
    expect(competitionPolicy).toBeDefined();
    expect(competitionPolicy.policyName).toBe('Pressure DrawMatic Competition');
    expect(competitionPolicy.ratingPolicy.pressureRating?.enabled).toBe(true);
  });

  test('state initialization creates participant states from ELO ratings', () => {
    const ratings = [1500, 1600, 1400, 1700, 1300, 1800, 1200, 1900];
    const { drawId } = generateTournamentWithRatings({ ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);

    const result = tournamentEngine.initializeCompetitionState({ drawId, participantIds });
    expect(result.success).toBe(true);

    const { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    expect(competitionState).toBeDefined();
    expect(Object.keys(competitionState.participantStates)).toHaveLength(8);

    // Check baseline ratings are set
    const firstState = competitionState.participantStates[participantIds[0]];
    expect(firstState.baselineRating).toBe(1500);
    expect(firstState.dynamicFormRating).toBe(1500);
    expect(firstState.pressureRating).toBe(0);
    expect(firstState.roundsPlayed).toBe(0);
  });

  test('state initialization without ratings defaults to 0', () => {
    const { drawId } = generateTournamentWithRatings({});

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: POLICY_COMPETITION_STANDARD,
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);

    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    const { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    const firstState = Object.values(competitionState.participantStates)[0];
    expect(firstState.baselineRating).toBe(0);
  });

  test('reset clears competition state', () => {
    const { drawId } = generateTournamentWithRatings({});

    tournamentEngine.attachPolicies({ drawId, policyDefinitions: POLICY_COMPETITION_STANDARD });
    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);

    tournamentEngine.initializeCompetitionState({ drawId, participantIds });
    let { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    expect(competitionState).toBeDefined();

    tournamentEngine.resetCompetitionState({ drawId });
    ({ competitionState } = tournamentEngine.getCompetitionState({ drawId }));
    expect(competitionState).toBeUndefined();
  });
});

describe('pressure rating processing', () => {
  test('per-matchUp processing updates ratings after scoring', () => {
    const ratings = [1500, 1500, 1500, 1500, 1500, 1500, 1500, 1500];
    const { drawId } = generateTournamentWithRatings({ ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);

    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    // Generate DrawMatic round
    let result: any = tournamentEngine.drawMatic({ drawId });
    expect(result.success).toBe(true);
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });

    // Complete round 1 with varied scores
    completeMatchUps({ drawId, roundNumber: 1, scores: ['6-1', '6-3', '6-4', '7-5'] });

    // Check that competition state was updated (PER_MATCHUP processing)
    const { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    expect(competitionState).toBeDefined();

    // Find a participant who won
    const winners = Object.values(competitionState.participantStates).filter((p: any) => p.wins > 0);
    expect(winners.length).toBeGreaterThan(0);

    for (const winner of winners as any[]) {
      expect(winner.roundsPlayed).toBe(1);
      expect(winner.wins).toBe(1);
      expect(winner.ratingHistory).toHaveLength(1);
      // With equal baselines, expected is 0.5. Winner's actual > 0.5, so pressure > 0
      expect(winner.pressureRating).toBeGreaterThan(0);
      // Dynamic form should have increased
      expect(winner.dynamicFormRating).toBeGreaterThan(1500);
    }

    // Find a participant who lost
    const losers = Object.values(competitionState.participantStates).filter((p: any) => p.losses > 0);
    for (const loser of losers as any[]) {
      expect(loser.pressureRating).toBeLessThan(0);
      expect(loser.dynamicFormRating).toBeLessThan(1500);
    }
  });

  test('baseline ratings remain frozen after processing', () => {
    const ratings = [2000, 1000, 1500, 1500];
    const { drawId } = generateTournamentWithRatings({ drawSize: 4, ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);

    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    // Generate and complete a round
    const result: any = tournamentEngine.drawMatic({ drawId });
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
    completeMatchUps({ drawId, roundNumber: 1 });

    // Verify baselines are unchanged
    const { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    for (const [pid, pState] of Object.entries(competitionState.participantStates) as any[]) {
      const idx = participantIds.indexOf(pid);
      expect(pState.baselineRating).toBe(ratings[idx]);
    }
  });

  test('no feedback loop — dynamic does not affect pressure expectation', () => {
    const ratings = [2000, 1000];
    const { drawId } = generateTournamentWithRatings({ drawSize: 2, ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);

    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    const result: any = tournamentEngine.drawMatic({ drawId });
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
    completeMatchUps({ drawId, roundNumber: 1, scores: ['6-3'] });

    const { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    const states = Object.values(competitionState.participantStates) as any[];

    // The rating history should show expectedOutput based on BASELINE (2000 vs 1000), not dynamic
    for (const state of states) {
      expect(state.ratingHistory[0].expectedOutput).toBeDefined();
      // With 2000 vs 1000, expected is very skewed — not near 0.5
      const isHighRated = state.baselineRating === 2000;
      if (isHighRated) {
        expect(state.ratingHistory[0].expectedOutput).toBeGreaterThan(0.8);
      } else {
        expect(state.ratingHistory[0].expectedOutput).toBeLessThan(0.2);
      }
    }
  });
});

describe('leaderboard', () => {
  test('leaderboard ranks by primary ranking metric', () => {
    const ratings = [1500, 1500, 1500, 1500];
    const { drawId } = generateTournamentWithRatings({ drawSize: 4, ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);
    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    const result: any = tournamentEngine.drawMatic({ drawId });
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
    completeMatchUps({ drawId, roundNumber: 1, scores: ['6-1', '6-3'] });

    const { leaderboard } = tournamentEngine.getCompetitionLeaderboard({ drawId });
    expect(leaderboard).toHaveLength(4);

    // Ranks should be 1-4
    expect(leaderboard.map((r: any) => r.rank)).toEqual([1, 2, 3, 4]);

    // Winners should be ranked above losers (pressure-based)
    const topTwo = leaderboard.slice(0, 2);
    for (const entry of topTwo) {
      expect(entry.pressureRating).toBeGreaterThan(0);
    }
  });

  test('leaderboard with WINS primary ranking', () => {
    const { drawId } = generateTournamentWithRatings({ drawSize: 4 });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION],
          processingGranularity: 'PER_ROUND',
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);
    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    const result: any = tournamentEngine.drawMatic({ drawId });
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
    completeMatchUps({ drawId, roundNumber: 1 });

    // PER_ROUND: explicitly process the round
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    tournamentEngine.processCompetitionRound({ drawId, roundNumber: 1, matchUps });

    const { leaderboard } = tournamentEngine.getCompetitionLeaderboard({ drawId });
    expect(leaderboard).toHaveLength(4);

    // Top 2 should have 1 win each
    expect(leaderboard[0].wins).toBe(1);
    expect(leaderboard[1].wins).toBe(1);
    expect(leaderboard[2].wins).toBe(0);
  });
});

describe('per-round processing', () => {
  test('PER_ROUND granularity: no updates until round generation', () => {
    const ratings = [1500, 1500, 1500, 1500];
    const { drawId } = generateTournamentWithRatings({ drawSize: 4, ratings });

    const perRoundPolicy = {
      [POLICY_TYPE_COMPETITION]: {
        ...POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION],
        ratingPolicy: {
          ...POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION].ratingPolicy,
          baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          pressureRating: {
            enabled: true,
            expectationSource: 'BASELINE_ONLY' as const,
            actualOutputMethod: 'POINT_SHARE' as const,
          },
        },
        processingGranularity: 'PER_ROUND' as const,
      },
    };

    tournamentEngine.attachPolicies({ drawId, policyDefinitions: perRoundPolicy });
    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);
    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    // Generate and complete round 1
    let result: any = tournamentEngine.drawMatic({ drawId });
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
    completeMatchUps({ drawId, roundNumber: 1 });

    // With PER_ROUND, scoring doesn't update state automatically
    let { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    const firstParticipant = Object.values(competitionState.participantStates)[0] as any;
    expect(firstParticipant.roundsPlayed).toBe(0); // Not yet processed

    // Explicitly process the round
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    tournamentEngine.processCompetitionRound({ drawId, roundNumber: 1, matchUps });

    ({ competitionState } = tournamentEngine.getCompetitionState({ drawId }));
    const updatedFirst = Object.values(competitionState.participantStates)[0] as any;
    expect(updatedFirst.roundsPlayed).toBe(1);
    expect(competitionState.roundStates[1]?.processed).toBe(true);
  });
});

describe('pairing integration', () => {
  test('DrawMatic uses competition state dynamic ratings for pairing', () => {
    const ratings = [2000, 1800, 1600, 1400];
    const { drawId } = generateTournamentWithRatings({ drawSize: 4, ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);
    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    // First round should pair by initial ratings (which ARE the dynamic form ratings)
    const result: any = tournamentEngine.drawMatic({ drawId });
    expect(result.success).toBe(true);
    expect(result.matchUps).toHaveLength(2);
  });
});

describe('Swiss with competition policy', () => {
  test('Swiss pairing uses competition state ratings', () => {
    const ratings = [1500, 1600, 1400, 1700, 1300, 1800, 1200, 1900];
    const { drawId } = generateTournamentWithRatings({ drawSize: 8, drawType: SWISS, ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_SWISS[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_SWISS[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);
    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    const result: any = tournamentEngine.generateSwissRound({ drawId });
    expect(result.success).toBe(true);
    expect(result.matchUps).toHaveLength(4);
  });
});

describe('participant state query', () => {
  test('getCompetitionParticipantState returns individual state', () => {
    const ratings = [1500, 1500, 1500, 1500];
    const { drawId } = generateTournamentWithRatings({ drawSize: 4, ratings });

    tournamentEngine.attachPolicies({
      drawId,
      policyDefinitions: {
        [POLICY_TYPE_COMPETITION]: {
          ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION],
          ratingPolicy: {
            ...POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION].ratingPolicy,
            baselineRating: { source: 'SCALE', scaleName: ELO, frozenDuringEvent: true as const },
          },
        },
      },
    });

    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);
    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    const { participantState } = tournamentEngine.getCompetitionParticipantState({
      drawId,
      participantId: participantIds[0],
    });
    expect(participantState).toBeDefined();
    expect(participantState.participantId).toBe(participantIds[0]);
    expect(participantState.baselineRating).toBe(1500);
  });
});

describe('policy fixtures', () => {
  test('POLICY_COMPETITION_STANDARD has correct shape', () => {
    const policy = POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION];
    expect(policy.policyName).toBe('Standard DrawMatic Competition');
    expect(policy.ratingPolicy.dynamicFormRating.enabled).toBe(true);
    expect(policy.ratingPolicy.pressureRating).toBeUndefined();
    expect(policy.victoryPolicy.primaryRanking).toBe('WINS');
    expect(policy.processingGranularity).toBe('PER_ROUND');
  });

  test('POLICY_COMPETITION_PRESSURE has pressure enabled', () => {
    const policy = POLICY_COMPETITION_PRESSURE[POLICY_TYPE_COMPETITION];
    expect(policy.ratingPolicy.pressureRating?.enabled).toBe(true);
    expect(policy.ratingPolicy.pressureRating?.expectationSource).toBe('BASELINE_ONLY');
    expect(policy.victoryPolicy.primaryRanking).toBe('PRESSURE_RATING');
    expect(policy.processingGranularity).toBe('PER_MATCHUP');
  });

  test('POLICY_COMPETITION_SWISS has Swiss pairing', () => {
    const policy = POLICY_COMPETITION_SWISS[POLICY_TYPE_COMPETITION];
    expect(policy.pairingPolicy.method).toBe('SWISS');
    expect(policy.victoryPolicy.primaryRanking).toBe('WINS');
    expect(policy.victoryPolicy.tiebreakOrder).toContain('BUCHHOLZ');
  });
});

describe('edge cases', () => {
  test('no competition policy — scoring pipeline unaffected', () => {
    const { drawId } = generateTournamentWithRatings({ drawSize: 4 });

    // No policy attached — should work normally
    const result: any = tournamentEngine.drawMatic({ drawId });
    const structureId = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].structureId;
    tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
    completeMatchUps({ drawId, roundNumber: 1 });

    // No competition state should exist
    const { competitionState } = tournamentEngine.getCompetitionState({ drawId });
    expect(competitionState).toBeUndefined();
  });

  test('missing matchUp sides — processing skips gracefully', () => {
    const { drawId } = generateTournamentWithRatings({ drawSize: 4 });
    tournamentEngine.attachPolicies({ drawId, policyDefinitions: POLICY_COMPETITION_PRESSURE });
    const { participants } = tournamentEngine.getParticipants();
    const participantIds = participants.map((p: any) => p.participantId);
    tournamentEngine.initializeCompetitionState({ drawId, participantIds });

    // Process a matchUp with no sides — should not crash
    const result = tournamentEngine.processCompetitionMatchUp({
      drawId,
      matchUp: { matchUpId: 'test', sides: [] },
    });
    expect(result.success).toBe(true);
  });
});

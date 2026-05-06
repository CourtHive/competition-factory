/**
 * Coverage tests for competition state lifecycle: targets the branches that
 * the broader competitionPolicy.test.ts does not exercise.
 *
 * Files covered:
 *   - mutate/drawDefinitions/competition/initializeCompetitionState.ts
 *   - mutate/drawDefinitions/competition/resetCompetitionState.ts
 *   - query/drawDefinition/competition/getCompetitionLeaderboard.ts
 */

// Functions under test (direct imports — synthetic drawDefinitions exercise
// guard clauses and switch arms without needing a full mocksEngine flow)
import { initializeCompetitionState } from '@Mutate/drawDefinitions/competition/initializeCompetitionState';
import { getCompetitionLeaderboard } from '@Query/drawDefinition/competition/getCompetitionLeaderboard';
import { resetCompetitionState } from '@Mutate/drawDefinitions/competition/resetCompetitionState';

// Constants
import { MISSING_DRAW_DEFINITION, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { APPLIED_POLICIES, COMPETITION_STATE } from '@Constants/extensionConstants';
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';
import { DOUBLES } from '@Constants/eventConstants';

// Testing
import { expect, describe, test } from 'vitest';

// ---- helpers ---------------------------------------------------------------

function makeDrawDefinition(extensions: any[] = []): any {
  return {
    drawId: 'd-coverage',
    drawType: 'AD_HOC',
    structures: [],
    extensions,
  };
}

function makeAppliedPoliciesExt(competitionPolicy: any) {
  return { name: APPLIED_POLICIES, value: { [POLICY_TYPE_COMPETITION]: competitionPolicy } };
}

function makeCompetitionStateExt(participantStates: Record<string, any>) {
  return { name: COMPETITION_STATE, value: { participantStates, roundStates: {} } };
}

function makeParticipantState(overrides: any = {}) {
  return {
    participantId: overrides.participantId ?? 'p',
    baselineRating: 0,
    dynamicFormRating: 0,
    pressureRating: 0,
    roundsPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    totalPointsWon: 0,
    totalPointsLost: 0,
    ratingHistory: [],
    ...overrides,
  };
}

// ---- resetCompetitionState -------------------------------------------------

describe('resetCompetitionState coverage', () => {
  test('returns MISSING_DRAW_DEFINITION when drawDefinition is absent', () => {
    const result = resetCompetitionState({ drawDefinition: undefined as any });
    expect(result.error).toBe(MISSING_DRAW_DEFINITION);
  });
});

// ---- initializeCompetitionState -------------------------------------------

describe('initializeCompetitionState coverage', () => {
  test('returns MISSING_DRAW_DEFINITION when drawDefinition is absent', () => {
    const result = initializeCompetitionState({
      tournamentRecord: { tournamentId: 't', participants: [] } as any,
      drawDefinition: undefined as any,
      participantIds: ['p1'],
    });
    expect(result.error).toBe(MISSING_DRAW_DEFINITION);
  });

  test('returns MISSING_VALUE when participantIds is empty', () => {
    const result = initializeCompetitionState({
      tournamentRecord: { tournamentId: 't', participants: [] } as any,
      drawDefinition: makeDrawDefinition(),
      participantIds: [],
    });
    expect(result.error).toBe(MISSING_VALUE);
  });

  test('returns SUCCESS without state when no competition policy is attached', () => {
    const result = initializeCompetitionState({
      tournamentRecord: { tournamentId: 't', participants: [] } as any,
      drawDefinition: makeDrawDefinition(),
      participantIds: ['p1'],
    });
    expect(result.success).toBe(true);
    expect(result.competitionState).toBeUndefined();
  });

  test('initializes state with no scaleName branch (baselineRating defaults to 0)', () => {
    // Policy with baselineRating but no scaleName — exercises `scaleName ? ... : {}` falsy branch
    const policy = {
      ratingPolicy: { baselineRating: { source: 'EXPLICIT' } },
      victoryPolicy: { primaryRanking: 'WINS' },
    };
    const drawDefinition = makeDrawDefinition([makeAppliedPoliciesExt(policy)]);
    const result = initializeCompetitionState({
      tournamentRecord: { tournamentId: 't', participants: [] } as any,
      drawDefinition,
      participantIds: ['p1', 'p2'],
    });
    expect(result.success).toBe(true);
    const states = result.competitionState!.participantStates;
    expect(states.p1.baselineRating).toBe(0);
    expect(states.p2.baselineRating).toBe(0);
  });

  // DOUBLES branch: PAIR participant whose individuals have no ratings —
  // exercises resolveBaselineRating's DOUBLES + aggregateRatings paths.
  // Aggregation methods cycle through MIN / MAX / SUM / AVERAGE. With all-zero
  // input, the output is 0 in every case; the goal here is statement+branch
  // coverage of the switch, not value verification (that's tested elsewhere).
  for (const aggregation of ['MIN', 'MAX', 'SUM', 'AVERAGE'] as const) {
    test(`DOUBLES + ratingAggregation=${aggregation} runs aggregation branch`, () => {
      const policy = {
        ratingPolicy: {
          baselineRating: { source: 'SCALE', scaleName: 'ELO' },
          ratingAggregation: aggregation,
        },
        victoryPolicy: { primaryRanking: 'WINS' },
      };
      const drawDefinition = makeDrawDefinition([makeAppliedPoliciesExt(policy)]);
      const event: any = { eventId: 'e1', eventType: DOUBLES };
      const tournamentRecord: any = {
        tournamentId: 't',
        participants: [
          { participantId: 'pair1', participantType: 'PAIR', individualParticipantIds: ['i1', 'i2'] },
          { participantId: 'i1' },
          { participantId: 'i2' },
        ],
      };
      const result = initializeCompetitionState({
        tournamentRecord,
        drawDefinition,
        participantIds: ['pair1'],
        event,
      });
      expect(result.success).toBe(true);
      expect(result.competitionState!.participantStates.pair1.baselineRating).toBe(0);
    });
  }
});

// ---- getCompetitionLeaderboard --------------------------------------------

describe('getCompetitionLeaderboard coverage', () => {
  test('returns empty leaderboard when state is missing', () => {
    const drawDefinition = makeDrawDefinition([
      makeAppliedPoliciesExt({ victoryPolicy: { primaryRanking: 'WINS' } }),
      // no COMPETITION_STATE extension
    ]);
    const { leaderboard } = getCompetitionLeaderboard({ drawDefinition });
    expect(leaderboard).toEqual([]);
  });

  test('returns empty leaderboard when policy is missing', () => {
    const drawDefinition = makeDrawDefinition([
      makeCompetitionStateExt({ p1: makeParticipantState({ participantId: 'p1' }) }),
      // no APPLIED_POLICIES extension
    ]);
    const { leaderboard } = getCompetitionLeaderboard({ drawDefinition });
    expect(leaderboard).toEqual([]);
  });

  // Helper: build a leaderboard against a synthetic two-participant state
  function buildLeaderboard({
    primaryRanking,
    tiebreakOrder,
    participantStates,
  }: {
    primaryRanking: string;
    tiebreakOrder?: string[];
    participantStates: Record<string, any>;
  }) {
    const policy = { victoryPolicy: { primaryRanking, tiebreakOrder } };
    const drawDefinition = makeDrawDefinition([
      makeAppliedPoliciesExt(policy),
      makeCompetitionStateExt(participantStates),
    ]);
    return getCompetitionLeaderboard({ drawDefinition });
  }

  test('PRESSURE_RATING primary ranking', () => {
    const { leaderboard } = buildLeaderboard({
      primaryRanking: 'PRESSURE_RATING',
      participantStates: {
        a: makeParticipantState({ participantId: 'a', pressureRating: 1 }),
        b: makeParticipantState({ participantId: 'b', pressureRating: 5 }),
      },
    });
    expect(leaderboard![0].participantId).toBe('b');
    expect(leaderboard![1].participantId).toBe('a');
  });

  test('DYNAMIC_FORM_RATING primary ranking', () => {
    const { leaderboard } = buildLeaderboard({
      primaryRanking: 'DYNAMIC_FORM_RATING',
      participantStates: {
        a: makeParticipantState({ participantId: 'a', dynamicFormRating: 1500 }),
        b: makeParticipantState({ participantId: 'b', dynamicFormRating: 1700 }),
      },
    });
    expect(leaderboard![0].participantId).toBe('b');
  });

  test('WINS primary ranking', () => {
    const { leaderboard } = buildLeaderboard({
      primaryRanking: 'WINS',
      participantStates: {
        a: makeParticipantState({ participantId: 'a', wins: 2 }),
        b: makeParticipantState({ participantId: 'b', wins: 5 }),
      },
    });
    expect(leaderboard![0].participantId).toBe('b');
  });

  test('POINTS primary ranking', () => {
    const { leaderboard } = buildLeaderboard({
      primaryRanking: 'POINTS',
      participantStates: {
        a: makeParticipantState({ participantId: 'a', totalPointsWon: 30 }),
        b: makeParticipantState({ participantId: 'b', totalPointsWon: 10 }),
      },
    });
    expect(leaderboard![0].participantId).toBe('a');
  });

  test('unknown primary ranking falls through to default (wins)', () => {
    const { leaderboard } = buildLeaderboard({
      primaryRanking: 'UNKNOWN_METRIC',
      participantStates: {
        a: makeParticipantState({ participantId: 'a', wins: 9 }),
        b: makeParticipantState({ participantId: 'b', wins: 1 }),
      },
    });
    expect(leaderboard![0].participantId).toBe('a');
  });

  // Tiebreak resolution: equal primary ranking, distinguished by the tiebreak.
  describe('applyTiebreak', () => {
    test('POINT_DIFFERENTIAL', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['POINT_DIFFERENTIAL'],
        participantStates: {
          a: makeParticipantState({ participantId: 'a', wins: 1, totalPointsWon: 50, totalPointsLost: 30 }), // diff +20
          b: makeParticipantState({ participantId: 'b', wins: 1, totalPointsWon: 30, totalPointsLost: 30 }), // diff 0
        },
      });
      expect(leaderboard![0].participantId).toBe('a');
    });

    test('DYNAMIC_FORM_RATING tiebreak', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['DYNAMIC_FORM_RATING'],
        participantStates: {
          a: makeParticipantState({ participantId: 'a', wins: 1, dynamicFormRating: 1600 }),
          b: makeParticipantState({ participantId: 'b', wins: 1, dynamicFormRating: 1500 }),
        },
      });
      expect(leaderboard![0].participantId).toBe('a');
    });

    test('PRESSURE_RATING tiebreak', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['PRESSURE_RATING'],
        participantStates: {
          a: makeParticipantState({ participantId: 'a', wins: 1, pressureRating: 8 }),
          b: makeParticipantState({ participantId: 'b', wins: 1, pressureRating: 2 }),
        },
      });
      expect(leaderboard![0].participantId).toBe('a');
    });

    test('HEAD_TO_HEAD tiebreak', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['HEAD_TO_HEAD'],
        participantStates: {
          // a beat b 2-0 in head-to-head; same total wins overall
          a: makeParticipantState({
            participantId: 'a',
            wins: 2,
            ratingHistory: [
              { opponentParticipantId: 'b', actualOutput: 1, expectedOutput: 0.5, pressureDelta: 0 },
              { opponentParticipantId: 'b', actualOutput: 1, expectedOutput: 0.5, pressureDelta: 0 },
            ],
          }),
          b: makeParticipantState({
            participantId: 'b',
            wins: 2,
            ratingHistory: [
              { opponentParticipantId: 'a', actualOutput: 0, expectedOutput: 0.5, pressureDelta: 0 },
              { opponentParticipantId: 'a', actualOutput: 0, expectedOutput: 0.5, pressureDelta: 0 },
            ],
          }),
        },
      });
      expect(leaderboard![0].participantId).toBe('a');
    });

    test('HEAD_TO_HEAD_PRESSURE tiebreak', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['HEAD_TO_HEAD_PRESSURE'],
        participantStates: {
          a: makeParticipantState({
            participantId: 'a',
            wins: 1,
            ratingHistory: [{ opponentParticipantId: 'b', actualOutput: 1, expectedOutput: 0.5, pressureDelta: 5 }],
          }),
          b: makeParticipantState({
            participantId: 'b',
            wins: 1,
            ratingHistory: [{ opponentParticipantId: 'a', actualOutput: 0, expectedOutput: 0.5, pressureDelta: -5 }],
          }),
        },
      });
      expect(leaderboard![0].participantId).toBe('a');
    });

    test('STRENGTH_OF_OPPOSITION tiebreak', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['STRENGTH_OF_OPPOSITION'],
        participantStates: {
          a: makeParticipantState({
            participantId: 'a',
            wins: 1,
            ratingHistory: [{ opponentParticipantId: 'c', actualOutput: 1, expectedOutput: 0.5, pressureDelta: 0 }],
          }),
          b: makeParticipantState({
            participantId: 'b',
            wins: 1,
            ratingHistory: [{ opponentParticipantId: 'd', actualOutput: 1, expectedOutput: 0.5, pressureDelta: 0 }],
          }),
          c: makeParticipantState({ participantId: 'c', baselineRating: 1800 }),
          d: makeParticipantState({ participantId: 'd', baselineRating: 1200 }),
        },
      });
      // a's opponent baseline 1800 > b's opponent baseline 1200 → a ranks higher
      expect(leaderboard![0].participantId).toBe('a');
    });

    test('STRENGTH_OF_OPPOSITION with empty ratingHistory falls back to 0', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['STRENGTH_OF_OPPOSITION', 'POINT_DIFFERENTIAL'],
        participantStates: {
          a: makeParticipantState({ participantId: 'a', wins: 1, totalPointsWon: 20, totalPointsLost: 0 }),
          b: makeParticipantState({ participantId: 'b', wins: 1, totalPointsWon: 5, totalPointsLost: 0 }),
        },
      });
      // Both have empty ratingHistory → SoO is 0 vs 0; falls through to POINT_DIFFERENTIAL
      expect(leaderboard![0].participantId).toBe('a');
    });

    test('unknown tiebreak name falls through to default (no-op) and next tiebreak resolves', () => {
      const { leaderboard } = buildLeaderboard({
        primaryRanking: 'WINS',
        tiebreakOrder: ['UNKNOWN_TIEBREAK', 'POINT_DIFFERENTIAL'],
        participantStates: {
          a: makeParticipantState({ participantId: 'a', wins: 1, totalPointsWon: 50, totalPointsLost: 0 }),
          b: makeParticipantState({ participantId: 'b', wins: 1, totalPointsWon: 10, totalPointsLost: 0 }),
        },
      });
      expect(leaderboard![0].participantId).toBe('a');
    });
  });
});

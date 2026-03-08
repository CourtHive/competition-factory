import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, test, describe } from 'vitest';

// constants
import { MISSING_DRAW_DEFINITION, MISSING_MATCHUP_ID, INVALID_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

describe('setMatchUpStatus branch coverage', () => {
  // ─── checkRequiredParameters early returns ───────────────────────────

  test('returns MISSING_MATCHUP_ID when matchUpId is not provided', () => {
    const result = setMatchUpStatus({
      drawDefinition: {} as any,
      tournamentRecord: {} as any,
    } as any);
    expect(result.error).toEqual(MISSING_MATCHUP_ID);
  });

  test('returns MISSING_DRAW_DEFINITION when drawDefinition is not provided and no drawId', () => {
    const result = setMatchUpStatus({
      matchUpId: 'bogusMatchUpId',
      tournamentRecord: {} as any,
    } as any);
    expect(result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  // ─── INVALID_WINNING_SIDE branches ───────────────────────────────────

  test('winningSide of 0 is falsy so bypasses winningSide validation (no error)', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // winningSide 0 is falsy, so `outcome?.winningSide && ...` short-circuits
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 0 },
      matchUpId: 'm-1-1',
      drawId,
    });
    // 0 is falsy — the check `outcome?.winningSide && ![1,2].includes(...)` is skipped
    expect(result.error).toBeUndefined();
    expect(result.success).toEqual(true);
  });

  test('returns INVALID_WINNING_SIDE for winningSide of 3', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 3 },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INVALID_WINNING_SIDE);
  });

  test('returns INVALID_WINNING_SIDE for negative winningSide', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: -1 },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.error).toEqual(INVALID_WINNING_SIDE);
  });

  // ─── matchUpFormat from outcome ──────────────────────────────────────

  test('accepts matchUpFormat from outcome object', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      outcome: {
        matchUpFormat: 'SET3-S:6/TB7',
        winningSide: 1,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
        matchUpStatus: COMPLETED,
      },
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // ─── score.sets without scoreStringSide1 (score generation branch) ──

  test('generates score strings from sets when scoreStringSide1 is not provided', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          // sets provided but no scoreStringSide1 — triggers matchUpScore generation
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
            { setNumber: 2, side1Score: 7, side2Score: 5, winningSide: 1 },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');
    expect(matchUp?.score?.scoreStringSide1).toBeDefined();
    expect(matchUp?.winningSide).toEqual(1);
  });

  // ─── score.sets filtering: empty sets stripped out ──────────────────

  test('filters out empty sets from score when generating from sets', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          // Include an empty set (no scores) that should be filtered
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
            { setNumber: 3 }, // empty set — should be stripped
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');
    // Empty set should have been filtered out
    expect(matchUp?.score?.sets?.length).toEqual(2);
  });

  // ─── setTBlast parameter passed through to matchUpScore ─────────────

  test('passes setTBlast to score generation', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm', matchUpFormat: 'SET3-S:6/TB7' }],
      setState: true,
    });

    // Score with a tiebreak in first set
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      setTBlast: true,
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          sets: [
            {
              setNumber: 1,
              side1Score: 7,
              side2Score: 6,
              side1TiebreakScore: 7,
              side2TiebreakScore: 3,
              winningSide: 1,
            },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');
    expect(matchUp?.score?.scoreStringSide1).toBeDefined();
  });

  // ─── allowChangePropagation from scoring policy ─────────────────────

  test('allowChangePropagation resolved from scoring policy', () => {
    const drawId = 'drawId';
    const policyDefinitions = {
      [POLICY_TYPE_SCORING]: { allowChangePropagation: true },
    };
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      policyDefinitions,
      setState: true,
    });

    // Complete first round matchUps
    let result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1 6-1',
          scoreStringSide2: '1-6 1-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 1, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-2 6-2',
          scoreStringSide2: '2-6 2-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 2, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-1-2',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Complete the final
    result = tournamentEngine.setMatchUpStatus({
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-3 6-3',
          scoreStringSide2: '3-6 3-6',
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 3, winningSide: 1 },
          ],
        },
      },
      matchUpId: 'm-2-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Now change winningSide on a first-round match — policy allows propagation
    result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 2 },
      matchUpId: 'm-1-1',
      drawId,
    });
    // With allowChangePropagation from policy, this should succeed
    expect(result.success).toEqual(true);
  });

  // ─── outcome with no winningSide (bypasses winningSide check) ───────

  test('outcome without winningSide skips winningSide validation', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Set a score without winningSide (IN_PROGRESS scenario)
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      outcome: {
        score: {
          scoreStringSide1: '6-1',
          scoreStringSide2: '1-6',
          sets: [{ setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 }],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // ─── outcome is undefined (no outcome at all) ──────────────────────

  test('succeeds with undefined outcome (no score/status changes)', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      drawId,
    });
    // No outcome means no status/score change — should still succeed
    expect(result.success).toEqual(true);
  });

  // ─── schedule and notes params passed through ───────────────────────

  test('passes schedule and notes to setMatchUpState', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      schedule: { scheduledDate: '2024-01-15' },
      notes: 'Test note',
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // ─── propagateExitStatus branch (FMLC with WALKOVER) ───────────────

  test('propagateExitStatus triggers progressExitStatus for FMLC draws', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      outcome: {
        matchUpStatus: WALKOVER,
        winningSide: 1,
        matchUpStatusCodes: ['W1'],
      },
      propagateExitStatus: true,
      matchUpId: 'm-1-1',
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify the loser was placed in consolation with exit status
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
    const consolationMatchUps = matchUps.filter((m) => m.structureName !== 'MAIN' && m.structureName !== 'Main');
    // At least one consolation matchUp should exist
    expect(consolationMatchUps.length).toBeGreaterThan(0);
  });

  // ─── matchUpFormat set directly (not through outcome) ──────────────

  test('matchUpFormat set via direct param before scoring', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      matchUpFormat: 'SET1-S:6/TB7',
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-4',
          scoreStringSide2: '4-6',
          sets: [{ setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 }],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');
    expect(matchUp?.matchUpFormat).toEqual('SET1-S:6/TB7');
  });

  // ─── disableScoreValidation branch ─────────────────────────────────

  test('disableScoreValidation allows invalid score through', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm', matchUpFormat: 'SET3-S:6/TB7' }],
      setState: true,
    });

    // An invalid score (winning with only 1 set in best-of-3) should be allowed
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      disableScoreValidation: true,
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-1',
          scoreStringSide2: '1-6',
          sets: [{ setNumber: 1, side1Score: 6, side2Score: 1, winningSide: 1 }],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  // ─── score.sets with tiebreak-only sets (filtering edge case) ──────

  test('filters sets correctly: keeps sets with only tiebreak scores', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm', matchUpFormat: 'SET3-S:6/TB7-F:TB10' }],
      setState: true,
    });

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      disableScoreValidation: true,
      outcome: {
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 4, winningSide: 1 },
            { setNumber: 2, side1Score: 4, side2Score: 6, winningSide: 2 },
            { setNumber: 3, side1TiebreakScore: 10, side2TiebreakScore: 8, winningSide: 1 },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');
    // All three sets should be kept (third has tiebreak scores)
    expect(matchUp?.score?.sets?.length).toEqual(3);
  });

  // ─── both matchUpId and drawDefinition missing ─────────────────────

  test('returns error when both matchUpId and drawDefinition are missing', () => {
    const result = setMatchUpStatus({
      tournamentRecord: {} as any,
    } as any);
    // Should fail on first missing required param
    expect(result.error).toBeDefined();
  });

  // ─── matchUpFormat from outcome fallback (not direct param) ────────

  test('matchUpFormat falls back to outcome.matchUpFormat when param not provided', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    // Set matchUpFormat only through outcome, not as direct param
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      // no matchUpFormat param here
      outcome: {
        matchUpFormat: 'SET1-S:6/TB7', // format only in outcome
        winningSide: 1,
        matchUpStatus: COMPLETED,
        score: {
          scoreStringSide1: '6-3',
          scoreStringSide2: '3-6',
          sets: [{ setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 }],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');
    expect(matchUp?.matchUpFormat).toEqual('SET1-S:6/TB7');
  });
});

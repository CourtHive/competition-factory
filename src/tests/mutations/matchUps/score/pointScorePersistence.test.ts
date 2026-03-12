import { reverseScore } from '@Assemblies/generators/score/reverseScore';
import { validateScore } from '@Validators/validateScore';
import { tournamentEngine } from '@Engines/syncEngine';
import { mocksEngine } from '@Assemblies/engines/mock';
import { expect, describe, test } from 'vitest';

// constants and types
import { COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { Score } from '@Types/tournamentTypes';

// ──────────────────────────────────────────────────────────────────────────────
// reverseScore — point score preservation
// ──────────────────────────────────────────────────────────────────────────────

describe('reverseScore preserves point scores', () => {
  test('swaps numeric side1PointScore and side2PointScore', () => {
    const score = {
      sets: [
        {
          side1Score: 6,
          side2Score: 4,
          winningSide: 1,
          setNumber: 1,
        },
        {
          side1Score: 3,
          side2Score: 2,
          side1PointScore: 30,
          side2PointScore: 15,
          setNumber: 2,
        },
      ],
    };

    const { reversedScore } = reverseScore({ score });

    // First set: no point scores, just game scores swapped
    expect(reversedScore.sets[0].side1Score).toBe(4);
    expect(reversedScore.sets[0].side2Score).toBe(6);
    expect(reversedScore.sets[0].winningSide).toBe(2);

    // Second set: point scores should be swapped (like tiebreak scores)
    expect(reversedScore.sets[1].side1Score).toBe(2);
    expect(reversedScore.sets[1].side2Score).toBe(3);
    expect(reversedScore.sets[1].side1PointScore).toBe(15);
    expect(reversedScore.sets[1].side2PointScore).toBe(30);
  });

  test('swaps string point scores (tennis game scores: "AD", "40", etc.)', () => {
    const score = {
      sets: [
        {
          side1Score: 5,
          side2Score: 5,
          side1PointScore: 'AD',
          side2PointScore: '40',
          setNumber: 1,
        },
      ],
    };

    const { reversedScore } = reverseScore({ score });

    expect(reversedScore.sets[0].side1Score).toBe(5);
    expect(reversedScore.sets[0].side2Score).toBe(5);
    expect(reversedScore.sets[0].side1PointScore).toBe('40');
    expect(reversedScore.sets[0].side2PointScore).toBe('AD');
  });

  test('swaps point scores alongside tiebreak scores', () => {
    const score = {
      sets: [
        {
          side1Score: 6,
          side2Score: 6,
          side1TiebreakScore: 5,
          side2TiebreakScore: 3,
          side1PointScore: '15',
          side2PointScore: '30',
          setNumber: 1,
        },
      ],
    };

    const { reversedScore } = reverseScore({ score });

    expect(reversedScore.sets[0].side1TiebreakScore).toBe(3);
    expect(reversedScore.sets[0].side2TiebreakScore).toBe(5);
    expect(reversedScore.sets[0].side1PointScore).toBe('30');
    expect(reversedScore.sets[0].side2PointScore).toBe('15');
  });

  test('does not add point score keys when not present on original set', () => {
    const score = {
      sets: [
        {
          side1Score: 6,
          side2Score: 4,
          winningSide: 1,
          setNumber: 1,
        },
      ],
    };

    const { reversedScore } = reverseScore({ score });

    // definedAttributes strips undefined values, so keys should not exist
    expect(reversedScore.sets[0]).not.toHaveProperty('side1PointScore');
    expect(reversedScore.sets[0]).not.toHaveProperty('side2PointScore');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// setMatchUpStatus — point score preservation through scoring pipeline
// ──────────────────────────────────────────────────────────────────────────────

describe('setMatchUpStatus preserves point scores', () => {
  test('retains point scores on sets after setMatchUpStatus', () => {
    const drawId = 'drawId';
    const {
      tournamentRecord,
      drawIds: [generatedDrawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
    });

    tournamentEngine.setState(tournamentRecord);

    const outcome = {
      winningSide: 1,
      score: {
        sets: [
          {
            side1Score: 6,
            side2Score: 4,
            side1PointScore: 30,
            side2PointScore: 15,
            winningSide: 1,
            setNumber: 1,
          },
          {
            side1Score: 6,
            side2Score: 3,
            winningSide: 1,
            setNumber: 2,
          },
        ],
      },
      matchUpStatus: COMPLETED,
    };

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      drawId,
      outcome,
      disableScoreValidation: true,
    });
    expect(result.success).toBe(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');
    expect(matchUp).toBeDefined();

    const set1 = matchUp.score.sets.find((s) => s.setNumber === 1);
    expect(set1.side1PointScore).toBe(30);
    expect(set1.side2PointScore).toBe(15);
  });

  test('does not filter out sets with only point scores (no game/tiebreak scores)', () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId, drawSize: 4, idPrefix: 'm' }],
      setState: true,
    });

    const outcome = {
      winningSide: 1,
      score: {
        sets: [
          {
            side1Score: 6,
            side2Score: 4,
            winningSide: 1,
            setNumber: 1,
          },
          {
            // Set with only point scores — should not be filtered out
            side1PointScore: 40,
            side2PointScore: 30,
            setNumber: 2,
          },
        ],
      },
      matchUpStatus: RETIRED,
    };

    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: 'm-1-1',
      drawId,
      outcome,
      disableScoreValidation: true,
    });
    expect(result.success).toBe(true);

    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m) => m.matchUpId === 'm-1-1');

    // Both sets should be preserved — the second set has point scores only
    expect(matchUp.score.sets.length).toBe(2);

    const set2 = matchUp.score.sets.find((s) => s.setNumber === 2);
    expect(set2).toBeDefined();
    expect(set2.side1PointScore).toBe(40);
    expect(set2.side2PointScore).toBe(30);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// validateScore — string point score handling
// ──────────────────────────────────────────────────────────────────────────────

describe('validateScore with point scores', () => {
  test('accepts string point scores without rejecting as non-numeric', () => {
    const score: Score = {
      scoreStringSide1: '5-4',
      scoreStringSide2: '4-5',
      sets: [
        {
          side1Score: 5,
          side2Score: 4,
          side1PointScore: 'AD',
          side2PointScore: '40',
          setNumber: 1,
        },
      ],
    };

    const result = validateScore({ score });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('accepts numeric point scores', () => {
    const score: Score = {
      scoreStringSide1: '3-2',
      scoreStringSide2: '2-3',
      sets: [
        {
          side1Score: 3,
          side2Score: 2,
          side1PointScore: 30,
          side2PointScore: 15,
          setNumber: 1,
        },
      ],
    };

    const result = validateScore({ score });
    expect(result.valid).toBe(true);
  });

  test('rejects when only one side has a point score', () => {
    const score: Score = {
      scoreStringSide1: '5-4',
      scoreStringSide2: '4-5',
      sets: [
        {
          side1Score: 5,
          side2Score: 4,
          side1PointScore: '30',
          setNumber: 1,
        },
      ],
    };

    const result = validateScore({ score });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  test('rejects when side2 has point score but side1 does not', () => {
    const score: Score = {
      scoreStringSide1: '5-4',
      scoreStringSide2: '4-5',
      sets: [
        {
          side1Score: 5,
          side2Score: 4,
          side2PointScore: 'AD',
          setNumber: 1,
        },
      ],
    };

    const result = validateScore({ score });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  test('allows sets with no point scores at all (no validation error)', () => {
    const score: Score = {
      scoreStringSide1: '6-4',
      scoreStringSide2: '4-6',
      sets: [
        {
          side1Score: 6,
          side2Score: 4,
          winningSide: 1,
          setNumber: 1,
        },
      ],
    };

    const result = validateScore({ score, winningSide: 1 });
    expect(result.valid).toBe(true);
  });
});

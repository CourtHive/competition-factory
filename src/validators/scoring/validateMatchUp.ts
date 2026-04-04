/**
 * validateMatchUp - Validate points produce expected score
 *
 * This implements pbp-validator functionality at the matchUp level:
 * 1. Take a matchUp with points and expected score
 * 2. Replay the points
 * 3. Compare actual vs expected scores
 * 4. Return validation results
 */

import type { MatchUp, SetScore, Participant } from '@Types/scoring/types';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint } from '@Mutate/scoring/addPoint';
import { getScore } from '@Query/scoring/getScore';

export interface ValidateMatchUpOptions {
  matchUp: MatchUp;
  expectedScore?: {
    sets?: Array<{
      side1Score?: number;
      side2Score?: number;
      side1TiebreakScore?: number;
      side2TiebreakScore?: number;
    }>;
    scoreString?: string;
  };
}

export interface ValidationDetails {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  actual: {
    sets: SetScore[];
    scoreString: string;
  };
  expected: {
    sets?: any[];
    scoreString?: string;
  };
  pointsProcessed: number;
  pointsRejected: number;
}

/**
 * Validate that points produce expected score
 *
 * Core pbp-validator functionality:
 * - Replay points from matchUp.history or matchUp.score.points
 * - Compare actual score to expected score
 * - Return detailed validation results
 */
export function validateMatchUp(options: ValidateMatchUpOptions): ValidationDetails {
  const { matchUp, expectedScore } = options;
  if (!matchUp) {
    return {
      isValid: false,
      errors: ['No matchUp provided'],
      warnings: [],
      actual: {
        sets: [],
        scoreString: '',
      },
      expected: {
        sets: expectedScore?.sets,
        scoreString: expectedScore?.scoreString,
      },
      pointsProcessed: 0,
      pointsRejected: 0,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Create fresh matchUp with same format
  let replayMatchUp = createMatchUp({
    matchUpFormat: matchUp?.matchUpFormat,
    matchUpId: matchUp?.matchUpId,
    participants: matchUp?.sides?.map((s) => s.participant).filter((p): p is Participant => p !== undefined),
  });

  // Get points to replay
  const points = matchUp?.history?.points ?? [];

  if (points.length === 0) {
    warnings.push('No points found to validate');
  }

  // Replay all points
  let pointsProcessed = 0;
  let pointsRejected = 0;

  for (const point of points) {
    try {
      replayMatchUp = addPoint(replayMatchUp, {
        winner: point.winner,
        server: point.server,
      });
      pointsProcessed++;
    } catch (error) {
      pointsRejected++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Point ${point.pointNumber || pointsProcessed + 1}: ${errorMessage}`);
    }
  }

  // Get actual score after replay
  const actualScore = getScore(replayMatchUp);

  // Compare with expected if provided
  if (expectedScore) {
    // Validate sets
    if (expectedScore.sets) {
      if (actualScore.sets.length !== expectedScore.sets.length) {
        errors.push(`Set count mismatch: expected ${expectedScore.sets.length}, got ${actualScore.sets.length}`);
      }

      expectedScore.sets.forEach((expectedSet, index) => {
        const actualSet = actualScore.sets[index];

        if (!actualSet) {
          errors.push(`Missing set ${index + 1}`);
          return;
        }

        // Compare game scores
        if (expectedSet.side1Score !== undefined && actualSet.side1Score !== expectedSet.side1Score) {
          errors.push(`Set ${index + 1} side1Score: expected ${expectedSet.side1Score}, got ${actualSet.side1Score}`);
        }

        if (expectedSet.side2Score !== undefined && actualSet.side2Score !== expectedSet.side2Score) {
          errors.push(`Set ${index + 1} side2Score: expected ${expectedSet.side2Score}, got ${actualSet.side2Score}`);
        }

        // Compare tiebreak scores if present
        if (
          expectedSet.side1TiebreakScore !== undefined &&
          actualSet.side1TiebreakScore !== expectedSet.side1TiebreakScore
        ) {
          errors.push(
            `Set ${index + 1} side1TiebreakScore: expected ${expectedSet.side1TiebreakScore}, got ${actualSet.side1TiebreakScore}`,
          );
        }

        if (
          expectedSet.side2TiebreakScore !== undefined &&
          actualSet.side2TiebreakScore !== expectedSet.side2TiebreakScore
        ) {
          errors.push(
            `Set ${index + 1} side2TiebreakScore: expected ${expectedSet.side2TiebreakScore}, got ${actualSet.side2TiebreakScore}`,
          );
        }
      });
    }

    // Validate score string
    if (expectedScore.scoreString && actualScore.scoreString !== expectedScore.scoreString) {
      errors.push(`Score string mismatch: expected "${expectedScore.scoreString}", got "${actualScore.scoreString}"`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    actual: {
      sets: actualScore.sets,
      scoreString: actualScore.scoreString,
    },
    expected: {
      sets: expectedScore?.sets,
      scoreString: expectedScore?.scoreString,
    },
    pointsProcessed,
    pointsRejected,
  };
}

/**
 * Get score string for a specific set
 *
 * Useful for testing individual sets
 */
export function getSetScoreString(set: SetScore): string {
  const s1 = set?.side1Score || 0;
  const s2 = set?.side2Score || 0;

  // Check if tiebreak was played
  if (set?.side1TiebreakScore !== undefined || set?.side2TiebreakScore !== undefined) {
    const tb1 = set?.side1TiebreakScore || 0;
    const tb2 = set?.side2TiebreakScore || 0;

    // Show tiebreak score in parentheses for loser
    if (s1 > s2) {
      return `${s1}-${s2}(${tb2})`;
    } else {
      return `${s1}(${tb1})-${s2}`;
    }
  }

  return `${s1}-${s2}`;
}

/**
 * Validate a single set's points produce expected score
 */
export function validateSet(options: {
  points: Array<{ winner: number; server?: number }>;
  matchUpFormat: string;
  expectedGames: [number, number];
  expectedTiebreak?: [number, number];
}): ValidationDetails {
  const { points, matchUpFormat, expectedGames, expectedTiebreak } = options;

  // Create a matchUp with just these points
  const matchUp: MatchUp = {
    matchUpId: 'validation',
    matchUpFormat,
    matchUpStatus: 'TO_BE_PLAYED',
    matchUpType: 'SINGLES',
    sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
    score: {
      sets: [],
    },
    history: {
      points: points?.map((p, i) => ({
        ...p,
        pointNumber: i + 1,
        timestamp: '',
        winner: p.winner as 0 | 1,
        server: p.server as 0 | 1 | undefined,
      })),
    },
  };

  return validateMatchUp({
    matchUp,
    expectedScore: {
      sets: [
        {
          side1Score: expectedGames?.[0],
          side2Score: expectedGames?.[1],
          side1TiebreakScore: expectedTiebreak?.[0],
          side2TiebreakScore: expectedTiebreak?.[1],
        },
      ],
    },
  });
}

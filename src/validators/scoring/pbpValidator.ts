/**
 * pbpValidator - Validate point strings produce expected scores
 *
 * Core API for play-by-play validation:
 * 1. Takes string of points (e.g., "0011001100110011")
 * 2. Takes expected score (e.g., "6-4")
 * 3. Optionally takes matchUpFormat or deduces it
 * 4. Returns validation results
 */

import { deduceMatchUpFormat } from '@Query/scoring/deduceMatchUpFormat';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint } from '@Mutate/scoring/addPoint';
import { getScore } from '@Query/scoring/getScore';

export interface PBPValidationOptions {
  // Point string: "0011001100..." where 0/1 are player indices
  points: string;

  // Expected score string: "6-4" or "6-4, 4-6, 7-6(5)"
  expectedScore?: string;

  // Match format (if known), otherwise will be deduced
  matchUpFormat?: string;

  // Allow extra points after match complete
  allowExtraPoints?: boolean;

  // Debug mode - show detailed steps
  debug?: boolean;
}

export interface PBPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];

  // Validation details
  pointsProcessed: number;
  pointsRejected: string[];
  expectedScore?: string;
  actualScore: string;

  // Format info
  matchUpFormat: string;
  formatDeduced: boolean;

  // Breakdown by set
  sets: Array<{
    games: [number, number];
    tiebreak?: [number, number];
    scoreString: string;
  }>;
}

/**
 * Validate point string produces expected score
 *
 * Main pbp-validator API
 */
export function pbpValidator(options: PBPValidationOptions): PBPValidationResult {
  const { points, expectedScore, matchUpFormat: providedFormat, allowExtraPoints = false, debug = false } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const rejected: string[] = [];

  // Determine format
  let matchUpFormat: string;
  let formatDeduced = false;

  if (providedFormat) {
    matchUpFormat = providedFormat;
  } else if (expectedScore) {
    // Try to deduce format from expected score
    matchUpFormat = deduceMatchUpFormat(expectedScore);
    formatDeduced = true;
    if (debug) {
      console.log(`Deduced format: ${matchUpFormat} from score: ${expectedScore}`);
    }
  } else {
    // Default format
    matchUpFormat = 'SET3-S:6/TB7';
    formatDeduced = true;
    warnings.push('No format provided, using default SET3-S:6/TB7');
  }

  // Create matchUp
  let matchUp = createMatchUp({ matchUpFormat });

  // Parse point string
  const pointArray = points
    ?.split('')
    .map((p) => {
      const winner = Number.parseInt(p, 10);
      if (Number.isNaN(winner) || (winner !== 0 && winner !== 1)) {
        return null;
      }
      return winner;
    })
    .filter((p) => p !== null) as number[];

  if (pointArray?.length === 0) {
    errors.push('No valid points found in point string');
    return {
      valid: false,
      errors,
      warnings,
      pointsProcessed: 0,
      pointsRejected: [],
      actualScore: '0-0',
      matchUpFormat,
      formatDeduced,
      sets: [],
    };
  }

  // Replay points
  let pointsProcessed = 0;

  for (let i = 0; i < pointArray?.length; i++) {
    const winner = pointArray[i];

    // Check if match already complete
    if (matchUp.matchUpStatus === 'COMPLETED' && !allowExtraPoints) {
      rejected.push(winner as unknown as string);
      if (debug) {
        console.log(`Point ${i + 1}: Rejected (match complete)`);
      }
      continue;
    }

    try {
      matchUp = addPoint(matchUp, { winner: winner as 0 | 1 });
      pointsProcessed++;

      if (debug) {
        const score = getScore(matchUp);
        console.log(`Point ${i + 1}: ${winner} → ${score.scoreString}`);
      }
    } catch (error) {
      rejected.push(winner as unknown as string);
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Point ${i + 1}: ${errorMessage}`);
      if (debug) {
        console.log(`Point ${i + 1}: Error - ${errorMessage}`);
      }
    }
  }

  // Get final score
  const finalScore = getScore(matchUp);
  const actualScore = finalScore.scoreString;

  // Extract set details
  const sets = finalScore.sets.map((set) => {
    const games: [number, number] = [set.side1Score || 0, set.side2Score || 0];
    const tiebreak: [number, number] | undefined =
      set.side1TiebreakScore === undefined ? undefined : [set.side1TiebreakScore, set.side2TiebreakScore || 0];

    let scoreString = `${games[0]}-${games[1]}`;
    if (tiebreak) {
      scoreString =
        games[0] > games[1] ? `${games[0]}-${games[1]}(${tiebreak[1]})` : `${games[0]}(${tiebreak[0]})-${games[1]}`;
    }

    return { games, tiebreak, scoreString };
  });

  // Compare with expected score
  let valid = true;

  if (expectedScore) {
    const normalizedExpected = normalizeScoreString(expectedScore);
    const normalizedActual = normalizeScoreString(actualScore);

    if (normalizedExpected !== normalizedActual) {
      valid = false;
      errors.push(`Score mismatch: expected "${expectedScore}", got "${actualScore}"`);
    }
  }

  // Check for excess points
  if (rejected.length > 0) {
    warnings.push(`${rejected.length} excess points after match complete`);
  }

  // Final validation
  if (errors.length > 0) {
    valid = false;
  }

  return {
    valid,
    errors,
    warnings,
    pointsProcessed,
    pointsRejected: rejected,
    expectedScore,
    actualScore,
    matchUpFormat,
    formatDeduced,
    sets,
  };
}

/**
 * Normalize score string for comparison
 *
 * Handles variations:
 * - "6-4, 4-6" vs "6-4,4-6" (spacing)
 * - "7-6(5)" vs "7-6 (5)" (spacing)
 */
function normalizeScoreString(score: string): string {
  return score
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/,/g, ', ') // Standardize comma spacing
    .toLowerCase();
}

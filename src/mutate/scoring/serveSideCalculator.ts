/**
 * serveSideCalculator - Infer which court side the serve should come from
 *
 * Rules by format:
 * - Standard tennis: even total points in game = deuce, odd = ad
 *   (0-0=deuce, 15-0=ad, 15-15=deuce, 30-15=ad, etc.)
 * - INTENNSE / aggregate: even aggregate score = deuce, odd = ad
 * - Tiebreaks: even total tiebreak points = deuce, odd = ad
 * - Tiebreak-only sets: even total points = deuce, odd = ad
 * - Timed sets: undefined (no court side inference)
 * - Rally scoring: same as tiebreak-only
 */

import type { MatchUp, FormatStructure, SetScore } from '@Types/scoring/types';
import { isAggregateFormat } from '@Tools/scoring/scoringUtilities';
import type { SetType } from '@Tools/scoring/scoringUtilities';

/**
 * Infer which court side the serve should come from
 *
 * @param matchUp - Current matchUp state (BEFORE point is added)
 * @param formatStructure - Parsed format structure
 * @param setType - Current set type
 * @returns 'deuce' | 'ad' | undefined (undefined if not inferrable)
 */
export function inferServeSide(
  matchUp: MatchUp,
  formatStructure: FormatStructure,
  setType: SetType,
): 'deuce' | 'ad' | undefined {
  // Timed sets without countable points: can't determine
  if (setType === 'timed') return undefined;

  const currentSet = getActiveSet(matchUp);

  // Aggregate scoring (INTENNSE, soccer, etc.)
  // Rule: deuce when aggregate total is even, ad when odd
  if (isAggregateFormat(formatStructure)) {
    return inferAggregateSide(matchUp, currentSet);
  }

  // Tiebreak-only sets and match tiebreaks
  if (setType === 'tiebreakOnly' || setType === 'matchTiebreak') {
    return inferTiebreakSide(currentSet);
  }

  // Standard set: check if in tiebreak or regular game
  return inferStandardSide(matchUp, formatStructure, currentSet);
}

// ============================================================================
// Internal helpers
// ============================================================================

function getActiveSet(matchUp: MatchUp): SetScore | undefined {
  const sets = matchUp.score.sets;
  if (sets.length === 0) return undefined;
  const last = sets[sets.length - 1];
  return last.winningSide === undefined ? last : undefined;
}

/**
 * Aggregate scoring: serve side based on total aggregate score parity
 *
 * INTENNSE rule: "serve is always from the deuce side when the aggregate score
 * is even, and always from the ad side when the aggregate score is odd"
 */
function inferAggregateSide(
  matchUp: MatchUp,
  currentSet: SetScore | undefined,
): 'deuce' | 'ad' {
  // Sum all scores across all completed sets
  let aggregateTotal = 0;
  for (const set of matchUp.score.sets) {
    if (set.winningSide !== undefined) {
      // Completed set: use tiebreak scores if available, else game scores
      if (set.side1TiebreakScore !== undefined) {
        aggregateTotal += (set.side1TiebreakScore ?? 0) + (set.side2TiebreakScore ?? 0);
      } else {
        aggregateTotal += (set.side1Score ?? 0) + (set.side2Score ?? 0);
      }
    }
  }

  // Add current in-progress set points
  if (currentSet && currentSet.winningSide === undefined) {
    const gs1 = currentSet.side1GameScores ?? [];
    const gs2 = currentSet.side2GameScores ?? [];
    if (gs1.length > 0 || gs2.length > 0) {
      const gameIdx = Math.max(gs1.length, gs2.length) - 1;
      aggregateTotal += (gs1[gameIdx] ?? 0) + (gs2[gameIdx] ?? 0);
    } else {
      // For timed sets in aggregate format, use set scores
      aggregateTotal += (currentSet.side1Score ?? 0) + (currentSet.side2Score ?? 0);
    }
  }

  return aggregateTotal % 2 === 0 ? 'deuce' : 'ad';
}

/**
 * Tiebreak-only sets and match tiebreaks:
 * Serve side based on total points in the tiebreak (same rule as standard tiebreak)
 */
function inferTiebreakSide(currentSet: SetScore | undefined): 'deuce' | 'ad' {
  if (!currentSet) return 'deuce'; // Start of tiebreak

  const gs1 = currentSet.side1GameScores ?? [];
  const gs2 = currentSet.side2GameScores ?? [];

  if (gs1.length === 0 && gs2.length === 0) return 'deuce';

  const totalPoints = (gs1[0] ?? 0) + (gs2[0] ?? 0);
  return totalPoints % 2 === 0 ? 'deuce' : 'ad';
}

/**
 * Standard set:
 * - Regular game: even total points in game = deuce, odd = ad
 * - In tiebreak: even total tiebreak points = deuce, odd = ad
 */
function inferStandardSide(
  _matchUp: MatchUp,
  _formatStructure: FormatStructure,
  currentSet: SetScore | undefined,
): 'deuce' | 'ad' {
  if (!currentSet) return 'deuce'; // Start of set

  const gs1 = currentSet.side1GameScores ?? [];
  const gs2 = currentSet.side2GameScores ?? [];

  if (gs1.length === 0 && gs2.length === 0) return 'deuce';

  const gameIdx = Math.max(gs1.length, gs2.length) - 1;
  const totalPointsInGame = (gs1[gameIdx] ?? 0) + (gs2[gameIdx] ?? 0);

  return totalPointsInGame % 2 === 0 ? 'deuce' : 'ad';
}

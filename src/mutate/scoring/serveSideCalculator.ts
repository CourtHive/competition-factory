/**
 * serveSideCalculator - Infer which court side the serve should come from
 *
 * Rules by format:
 * - Standard tennis: even total points in game = deuce, odd = ad
 *   (0-0=deuce, 15-0=ad, 15-15=deuce, 30-15=ad, etc.)
 * - INTENNSE / aggregate: even aggregate score = deuce, odd = ad
 * - Tiebreaks: even total tiebreak points = deuce, odd = ad
 * - Tiebreak-only sets: even total points = deuce, odd = ad
 * - Timed sets: undefined (no court side inference), except in an aggregate format
 * - Rally scoring: same as tiebreak-only
 */

import type { MatchUp, FormatStructure, SetScore } from '@Types/scoring/types';
import { isAggregateFormat } from '@Tools/scoring/scoringUtilities';
import type { SetType } from '@Tools/scoring/scoringUtilities';
import { aggregateTotals } from './matchCompletion';

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
  const currentSet = getActiveSet(matchUp);

  // Aggregate scoring (INTENNSE, soccer, etc.), timed segments included (§ 10.5, CA 2026-10-18)
  // Rule: deuce when aggregate total is even, ad when odd
  if (isAggregateFormat(formatStructure)) {
    return inferAggregateSide(matchUp, currentSet);
  }

  // A timed segment that is not aggregate: no court half
  if (setType === 'timed') return undefined;

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
  return isClosed(last) ? undefined : last;
}

/** A set that is over: won, or a timed segment closed with or without a winner. */
function isClosed(set: SetScore): boolean {
  return set.winningSide !== undefined || !!(set as SetScore & { segmentComplete?: boolean }).segmentComplete;
}

/**
 * Aggregate scoring: serve side based on total aggregate score parity
 *
 * INTENNSE rule: "serve is always from the deuce side when the aggregate score
 * is even, and always from the ad side when the aggregate score is odd". Every closed segment counts,
 * a timed one closed level included, by the units the aggregate counts (§ 9.3 rule 3).
 */
function inferAggregateSide(matchUp: MatchUp, currentSet: SetScore | undefined): 'deuce' | 'ad' {
  const closed = matchUp.score.sets.filter(isClosed);
  const [side1Total, side2Total] = aggregateTotals(closed);
  let aggregateTotal = side1Total + side2Total;

  // Add current in-progress set points
  if (currentSet) {
    const gs1 = currentSet.side1GameScores ?? [];
    const gs2 = currentSet.side2GameScores ?? [];
    if (gs1.length > 0 || gs2.length > 0) {
      const gameIdx = Math.max(gs1.length, gs2.length) - 1;
      aggregateTotal += (gs1[gameIdx] ?? 0) + (gs2[gameIdx] ?? 0);
    } else {
      // For timed sets in aggregate format, use set scores, and the points of a tiebreak at time in play
      aggregateTotal += (currentSet.side1Score ?? 0) + (currentSet.side2Score ?? 0);
      aggregateTotal += (currentSet.side1TiebreakScore ?? 0) + (currentSet.side2TiebreakScore ?? 0);
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

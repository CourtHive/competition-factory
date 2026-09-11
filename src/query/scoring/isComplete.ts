/**
 * isComplete - Check if matchUp is complete
 *
 * Pure function that checks completion status
 */

import type { MatchUp } from '@Types/scoring/types';

/**
 * Check if the matchUp is complete
 *
 * @param matchUp - Current matchUp state
 * @returns True if match is complete
 */
export function isComplete(matchUp: MatchUp): boolean {
  return matchUp.matchUpStatus === 'COMPLETED';
}

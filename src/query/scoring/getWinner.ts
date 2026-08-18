/**
 * getWinner - Determine the winner of a matchUp
 *
 * Pure function that returns the winning side number (1 or 2)
 */

import { MatchUp } from '@Types/scoring/types';

/**
 * Get the winner of the matchUp
 *
 * @param matchUp - Current matchUp state
 * @returns Winning side number (1-based) or undefined if not complete
 */
export function getWinner(matchUp: MatchUp): number | undefined {
  if (matchUp.matchUpStatus !== 'COMPLETED') {
    return undefined;
  }

  return matchUp.winningSide;
}

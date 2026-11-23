import type { MatchUp } from '@Types/tournamentTypes';

/** A collection line can carry its parent's round coordinates. Only the bracket result owns its onward seats. */
export function isBracketWinnerSwap(
  matchUp: Pick<MatchUp, 'roundPosition' | 'winningSide'>,
  winningSide?: number,
  matchUpTieId?: string,
): boolean {
  return (
    !!matchUp.roundPosition &&
    !matchUpTieId &&
    !!matchUp.winningSide &&
    !!winningSide &&
    matchUp.winningSide !== winningSide
  );
}

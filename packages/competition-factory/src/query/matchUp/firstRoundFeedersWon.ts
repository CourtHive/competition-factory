import { isUnscoredOutcome } from '@Query/matchUp/getDrawPositionWinCount';
import { overlap } from '@Tools/arrays';

// constants and types
import type { MatchUp } from '@Types/tournamentTypes';

/** The canonical FIRST_MATCHUP reservation predicate, read from an already selected structure's matchUps. */
export function firstRoundFeedersWon({
  matchUps,
  drawPositions,
}: {
  matchUps: MatchUp[];
  drawPositions?: number[];
}): boolean {
  return matchUps
    .filter(({ drawPositions: fed, roundNumber }) => roundNumber === 1 && overlap(fed, drawPositions))
    .every(({ matchUpStatus, winningSide, score }) => !!winningSide && !isUnscoredOutcome({ matchUpStatus, score }));
}

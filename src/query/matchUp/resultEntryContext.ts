import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';

// constants and types
import { completedMatchUpStatuses, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUp } from '@Types/tournamentTypes';

/**
 * Factory-owned classification of the state a result editor would replace.
 * Keep the existing CLEAR_SCORE predicate unchanged. A stored partial score also requires review,
 * even if an imported record still says TO_BE_PLAYED. This is not mutation permission.
 * A scoreless live status can receive its first result; a terminal outcome or stored score is reviewed.
 */
export function resultEntryContext(matchUp: Pick<MatchUp, 'matchUpStatus' | 'winningSide' | 'score'>) {
  const hasOutcomeToRemove =
    !!matchUp.winningSide || (!!matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED);
  return {
    hasOutcomeToRemove,
    requiresReview:
      !!matchUp.winningSide ||
      (!!matchUp.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus)) ||
      checkScoreHasValue({ matchUp }),
  };
}

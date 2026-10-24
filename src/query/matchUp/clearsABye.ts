import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';

// constants and types
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { Score } from '@Types/tournamentTypes';

/**
 * A CLEAR OF A BYE: a request with no winner, no score with value and no status but `TO_BE_PLAYED`, made of a matchUp
 * stored as a `BYE`. A BYE has no result to clear, so the call leaves it the BYE it is: a `TO_BE_PLAYED` matchUp with
 * a BYE side never occurs (CA, 2026-10-24; punch-list P26). Until then the clear was accepted and wrote `TO_BE_PLAYED`
 * against nobody (census sched-w1 9000080, 9000502, 9000576, 9000593). v1 (`setMatchUpState`) and v2 (`chooseRoute`,
 * the `noop` route) both ask this, so the two cannot drift.
 */
export function clearsABye({
  storedMatchUpStatus,
  matchUpStatus,
  winningSide,
  score,
}: {
  storedMatchUpStatus?: string;
  matchUpStatus?: string;
  winningSide?: number;
  score?: Score;
}): boolean {
  return (
    storedMatchUpStatus === BYE &&
    !winningSide &&
    !checkScoreHasValue({ score }) &&
    (!matchUpStatus || matchUpStatus === TO_BE_PLAYED)
  );
}

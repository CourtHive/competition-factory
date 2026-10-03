import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';

/**
 * Whether a matchUp carries a result: a winningSide, a score with value, or a completed status. The one
 * definition `schedule.scoredTime` is stamped and cleared against — `applyScoredTime` for the matchUp a
 * call targets, `reconcileScoredTimes` for every other matchUp the call touched.
 */
export function matchUpIsScored(matchUp?: MatchUp): boolean {
  return (
    !!matchUp?.winningSide ||
    checkScoreHasValue({ score: matchUp?.score }) ||
    (!!matchUp?.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus))
  );
}

/**
 * Remove `schedule.scoredTime` from every matchUp that no longer carries a result.
 *
 * `applyScoredTime` stamps and clears it on the matchUp a call TARGETS. The cascade also writes results
 * onto OTHER matchUps — a carried or produced exit re-enters `setMatchUpState` and is stamped there — and
 * unwinds them through a dozen writers (`withdrawFromMatchUp`, `removeDirectedLoser`, `positionClear`,
 * `removeSubsequentRoundsParticipant`, …) that never pass through `applyScoredTime`. Each left the stamp
 * behind: a matchUp reverted to `TO_BE_PLAYED` still claiming it had been scored, which
 * `getParticipantRest` and the scheduling readers take as a finish time. Measured 2026-10-03 on
 * FEED_IN_CHAMPIONSHIP 16: a WALKOVER (or a carried RETIRED) cleared at its origin left its
 * consolation matchUp undecided with the `scoredTime` the carried exit had stamped.
 *
 * Run once, after the cascade has settled, as `reconcileStaleExitOrigins` is: a property of the stored
 * draw rather than a record of what each writer did, so a writer added later is covered too.
 */
export function reconcileScoredTimes({
  tournamentRecord,
  drawDefinition,
  matchUps,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUps?: MatchUp[];
  event?: Event;
}): void {
  for (const matchUp of matchUps ?? []) {
    if (!matchUp?.schedule?.scoredTime || matchUpIsScored(matchUp)) continue;
    delete matchUp.schedule.scoredTime;
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'reconcileScoredTimes',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
    });
  }
}

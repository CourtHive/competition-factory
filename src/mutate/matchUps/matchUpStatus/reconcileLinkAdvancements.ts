import { releaseLinkedWinnerAdvancement } from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';
import { getUnearnedLinkAdvancements } from '@Query/drawDefinition/getUnearnedLinkAdvancements';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

/**
 * Release every participant standing across a round link out of a matchUp that, once the mutation has settled, has
 * no result.
 *
 * A link moves a participant who decided the source round. When that result goes away the participant has to come
 * back out of the target structure, and each path that can take a result away has had to remember the link:
 * `removeSubsequentRoundsParticipant`, `positionClear`, `applyWithdrawnExits` (design modes A to D, #5193). Two more
 * were found by ADVANCED_ACROSS_LINK_FROM_UNDECIDED on its first run, both at a structure's FINAL, which has no next
 * round of its own:
 *
 *  - a removal leaving the Backdraw final undecided released from the round after it (`releaseUndecidedAdvancements`
 *    asks for `roundNumber + 1`), never across the final's own link, so its finalist stayed in the grand final
 *    (de 9303011, mode A's draw);
 *  - the grand final's walkover withdrawn by `reconcileStaleExitOrigins` released its winner, but the Decider is
 *    also fed by a LOSER link out of that round, and the loser stayed seated in it (de 9301605, found by factory-d3).
 *
 * So the question is asked once more, here, against settled state, exactly as `reconcileStaleExitOrigins` asks
 * its own. It reads only the draw, so it is idempotent; the predicate is the one the inconsistency reports.
 */
export function reconcileLinkAdvancements({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
}): void {
  if (!drawDefinition?.links?.length) return;
  // Built from the draw, never taken from the caller's context: `setMatchUpStatus`'s result context can carry a map
  // whose matchUps are detached copies, and reading one decided a held walkover's grand final as undecided and
  // released the Decider seat it had just earned (de 9301605). So it takes no map.
  const resolvedMap = getMatchUpsMap({ drawDefinition });

  // each pass releases at least one placement, and a draw holds finitely many
  for (let guard = (resolvedMap?.drawMatchUps?.length ?? 0) + 1; guard > 0; guard -= 1) {
    const inContextDrawMatchUps =
      getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap: resolvedMap }).matchUps ?? [];
    const unearned = getUnearnedLinkAdvancements({ inContextDrawMatchUps, drawDefinition });
    if (!unearned.length) return;

    const before = unearned.length;
    for (const { link, participantId } of unearned) {
      releaseLinkedWinnerAdvancement({
        roundNumber: link.source.roundNumber,
        structureId: link.source.structureId,
        matchUpsMap: resolvedMap,
        linkType: link.linkType,
        tournamentRecord,
        drawDefinition,
        participantId,
        event,
      });
    }
    const after = getUnearnedLinkAdvancements({
      inContextDrawMatchUps:
        getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap: resolvedMap }).matchUps ?? [],
      drawDefinition,
    }).length;
    // nothing this pass could release (a placement already played on): leave it for the inconsistency to report
    if (after >= before) return;
  }
}

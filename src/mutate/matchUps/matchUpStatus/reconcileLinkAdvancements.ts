import { releaseLinkedWinnerAdvancement } from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';
import { getUnearnedLinkAdvancements } from '@Query/drawDefinition/getUnearnedLinkAdvancements';
import { recordSettleEvent } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';

/** a release that declares an `error` is not assignable here; see "It cannot fail, by construction" */
type ReleaseCannotFail = void | { error?: never };

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
 *
 * ## It cannot fail, by construction
 *
 * It runs after the cascade has written, so a failure here could not be refused without leaving those writes behind,
 * and an error changes nothing (CA, 2026-10-18) with no caller rollback to lean on (CA, 2026-10-22). So the release it
 * makes has no error to return: `releaseLinkedWinnerAdvancement` returns nothing or `releaseAdvancedDrawPosition`'s
 * success, and its declared result carries no `error`. `ReleaseCannotFail` holds it there: a release that one day
 * declares an error stops this file compiling, rather than having it dropped here (outcome v2 executor plan, Phase C
 * prerequisite 2). Measured 2026-10-22: reached 4 times over the suite, never with an error.
 *
 * Its loop bound is the one way it reports anything: each pass releases at least one placement, so the bound is not
 * reached on a finite draw, and if it were the call is refused (F9 (i), CA 2026-10-24) rather than stopping silently.
 * Not reached on ~97,000 census schedules (settle telemetry, 2026-10-24).
 */
export function reconcileLinkAdvancements({
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
}): ResultType | undefined {
  if (!drawDefinition?.links?.length) return undefined;
  // Built from the draw, never taken from the caller's context: `setMatchUpStatus`'s result context can carry a map
  // whose matchUps are detached copies, and reading one decided a held walkover's grand final as undecided and
  // released the Decider seat it had just earned (de 9301605). So it takes no map.
  const resolvedMap = getMatchUpsMap({ drawDefinition });

  // each pass releases at least one placement, and a draw holds finitely many
  let remaining = 0;
  for (let guard = (resolvedMap?.drawMatchUps?.length ?? 0) + 1; guard > 0; guard -= 1) {
    const inContextDrawMatchUps =
      getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap: resolvedMap }).matchUps ?? [];
    const unearned = getUnearnedLinkAdvancements({ inContextDrawMatchUps, drawDefinition });
    if (!unearned.length) return undefined;

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
      }) satisfies ReleaseCannotFail;
    }
    const after = getUnearnedLinkAdvancements({
      inContextDrawMatchUps:
        getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap: resolvedMap }).matchUps ?? [],
      drawDefinition,
    }).length;
    // nothing this pass could release (a placement already played on): leave it for the inconsistency to report
    if (after >= before) return undefined;
    remaining = after;
  }
  // at the bound: refused only if a placement is still unearned (F9 (i), CA 2026-10-24), and recorded for the census
  if (!remaining) return undefined;
  recordSettleEvent({ kind: 'bound', site: 'reconcileLinkAdvancements' });
  return { error: SETTLE_BOUND_REACHED, info: 'reconcileLinkAdvancements' };
}

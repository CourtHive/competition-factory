import { releaseAdvancedDrawPosition } from '@Mutate/matchUps/drawPositions/releaseAdvancedDrawPosition';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';

// constants and types
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { WithdrawnExit } from './sideExitProvenance';
import { MatchUpsMap } from '@Types/factoryTypes';

/**
 * Apply the consequences of `withdrawProducedExits`: release what a withdrawn exit had advanced,
 * and announce every matchUp it changed.
 *
 * Extracted from `removeDirectedParticipants`, which had this inline. **This change is a pure
 * refactor and wires nothing new**: `removeDirectedParticipants` is still the only caller.
 *
 * It exists because there are TWO unwind paths and only one of them uses this mechanism. An ordinary
 * result unwinds through `removeDirectedParticipants` -> `withdrawProducedExits`, which is
 * identity-keyed and retains origins carried by a different source. A DOUBLE exit unwinds through
 * `noDownstreamDependencies`' `doubleExitCleanup` -> `removeDoubleExit`, which resets its targets by
 * hand and blanks `sideExitProvenance` wholesale — measured 2026-09-19 as ZERO calls to
 * `withdrawProducedExits` on a double-exit unwind. Sharing the application step is the precondition
 * for closing that gap; the closing itself is a separate, larger piece of work, because a PARTIAL
 * unwind has to RE-DERIVE its target rather than infer one.
 *
 * Behaviour is byte-identical to the block it replaces; the two comments below are the measurements
 * that fixed its shape and are kept verbatim because both were arrived at the hard way.
 */
export function applyWithdrawnExits({
  withdrawnExits,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  withdrawnExits: WithdrawnExit[];
  matchUpsMap?: MatchUpsMap;
  event?: Event;
}): void {
  for (const withdrawnExit of withdrawnExits) {
    // A RESOLVED produced exit had a winner, and that winner has already advanced. The exit is no
    // longer happening, so the advancement it granted must come back with it — otherwise the slot
    // stays occupied and the next arrival is refused with ERR_EXISTING_POSITION_ASSIGNMENT after
    // the mutation has already written. `releaseAdvancedDrawPosition` is the same narrow release
    // `removeDirectedLoser` uses, and its own two scopes keep it off positions that are
    // load-bearing. A PENDING produced exit — the common shape, with an empty winner slot — has no
    // winningSide here and so releases nothing.
    if (withdrawnExit.winnerDrawPosition !== undefined && withdrawnExit.roundNumber !== undefined) {
      releaseAdvancedDrawPosition({
        // `+ 1` — from the round AFTER the withdrawn matchUp, never from the matchUp itself. The
        // winner still belongs in it: they arrived there by winning an earlier round, and that has
        // not changed. Only what they won ON arrival has been taken back. Releasing from its own
        // round nulls a position the matchUp legitimately holds, which `transitionProperties`
        // catches as DO_UNDO_IDENTITY residue — `[1,4]` becoming `[1,null]` in a
        // MODIFIED_FEED_IN_CHAMPIONSHIP 8/7.
        fromRoundNumber: withdrawnExit.roundNumber + 1,
        drawPosition: withdrawnExit.winnerDrawPosition,
        structureId: withdrawnExit.structureId,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
    }

    const withdrawnMatchUp = matchUpsMap?.drawMatchUps?.find((m) => m.matchUpId === withdrawnExit.matchUpId);
    if (!withdrawnMatchUp) continue;
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'withdrawProducedExits',
      eventId: event?.eventId,
      matchUp: withdrawnMatchUp,
      drawDefinition,
      event,
    });
  }
}

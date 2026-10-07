import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import {
  releaseAdvancedDrawPositionAcrossLinks,
  releaseLinkedWinnerAdvancement,
} from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';

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
      releaseAdvancedDrawPositionAcrossLinks({
        // `+ 1` — from the round AFTER the withdrawn matchUp, never from the matchUp itself. The
        // winner still belongs in it: they arrived there by winning an earlier round, and that has
        // not changed. Only what they won ON arrival has been taken back. Releasing from its own
        // round nulls a position the matchUp legitimately holds, which `transitionProperties`
        // catches as DO_UNDO_IDENTITY residue — `[1,4]` becoming `[1,null]` in a
        // MODIFIED_FEED_IN_CHAMPIONSHIP 8/7.
        fromRoundNumber: withdrawnExit.roundNumber + 1,
        drawPosition: withdrawnExit.winnerDrawPosition,
        structureId: withdrawnExit.structureId,
        withdrawingExit: true,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
      // ...except across a link. The round after a structure's LAST round is in another structure: a Backdraw
      // final's winner went on to the grand final, and the release above, keyed on this structure's rounds,
      // never reaches it (mode C, census de 9304168 and 9304795). The link at the withdrawn round itself is asked.
      releaseLinkedWinnerAdvancement({
        drawPosition: withdrawnExit.winnerDrawPosition,
        roundNumber: withdrawnExit.roundNumber,
        structureId: withdrawnExit.structureId,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
    }

    const withdrawnMatchUp = matchUpsMap?.drawMatchUps?.find((m) => m.matchUpId === withdrawnExit.matchUpId);
    if (!withdrawnMatchUp) continue;

    /**
     * A PENDING produced exit has no winner, and its lone seat may still have been ADVANCED: an empty position
     * moves forward structurally, as a BYE placeholder does, and is what carries the exit on past a BYE (seed 397,
     * #5148). Since a produced exit awards no empty seat (Q3, CA 2026-10-03), the release above, keyed on a
     * winner, finds nothing to take back, and the empty position stayed one round on after its exit was gone
     * (census w1 9000562 on #5155: `Consolation|5|1`, later read as a BYE advanced out of an undecided matchUp).
     * Released here instead: every position of the withdrawn matchUp that holds nobody, from the round after it.
     * `releaseAdvancedDrawPosition`'s own scopes keep it off a BYE advancement and off any decided matchUp.
     */
    /**
     * A matchUp the withdrawal reverted to UNDECIDED advances nobody, whoever the release above named as its winner.
     * The name can be wrong: an arrival can land before the withdrawal and re-award a standing produced exit to
     * itself, so the "winner" read off `winningSide` is the newcomer, who advanced nowhere, while the participant the
     * exit had really awarded stays one round on, advanced out of an undecided matchUp (census w2 9100303, DE 16/11:
     * `Backdraw|4|1` kept the old award's winner). Every other occupied position is released too; the release's own
     * scopes keep a BYE advancement and any decided matchUp.
     */
    if (!withdrawnExit.rederived && withdrawnExit.roundNumber && !withdrawnMatchUp.winningSide) {
      for (const drawPosition of withdrawnMatchUp.drawPositions ?? []) {
        if (!drawPosition || drawPosition === withdrawnExit.winnerDrawPosition) continue;
        releaseAdvancedDrawPositionAcrossLinks({
          fromRoundNumber: withdrawnExit.roundNumber + 1,
          structureId: withdrawnExit.structureId,
          withdrawingExit: true,
          tournamentRecord,
          drawDefinition,
          drawPosition,
          matchUpsMap,
          event,
        });
      }
    }

    if (withdrawnExit.winnerDrawPosition === undefined && !withdrawnExit.rederived && withdrawnExit.roundNumber) {
      const { positionAssignments } = getPositionAssignments({
        drawDefinition,
        structureId: withdrawnExit.structureId,
      });
      const vacant = (withdrawnMatchUp.drawPositions ?? []).filter((drawPosition) => {
        const assignment = positionAssignments?.find((candidate) => candidate.drawPosition === drawPosition);
        return drawPosition && !assignment?.participantId && !assignment?.bye && !assignment?.qualifier;
      });
      for (const drawPosition of vacant) {
        releaseAdvancedDrawPositionAcrossLinks({
          fromRoundNumber: withdrawnExit.roundNumber + 1,
          structureId: withdrawnExit.structureId,
          withdrawingExit: true,
          tournamentRecord,
          drawDefinition,
          drawPosition,
          matchUpsMap,
          event,
        });
      }
    }
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

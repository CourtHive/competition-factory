import { getSideDrawPosition, getWinningSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import {
  releaseAdvancedDrawPositionAcrossLinks,
  releaseLinkedWinnerAdvancement,
} from '@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement';

// constants and types
import { WithdrawnExit, withdrawProducedExits, withdrawByeClaim } from './sideExitProvenance';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
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

    // A matchUp the withdrawal left undecided, with no exit of its own, produces no loser by exit any more, so the BYE
    // it claimed for its loser's seat goes with the exit, as it does where a double exit is unwound
    // (`withdrawExitFromByeChain`). Census run-17 baseline F3, COMPASS 16/14 20731395 and siblings, policy off:
    // `West|1|3`'s double walkover, re-derived to the default `East|1|6`'s correction left, withdrew the walkover it had
    // produced at `West|2|2`, and the BYE `West|2|2` had claimed in `Southwest|1|1` stood until `West|2|2` was played.
    if (matchUpsMap && !withdrawnMatchUp.winningSide && !isAnyExit(withdrawnMatchUp.matchUpStatus)) {
      withdrawByeSeats({
        claimantMatchUpId: withdrawnMatchUp.matchUpId,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
    }

    /**
     * A DOUBLE exit re-derived to a single one stops producing exits at once, and what it produced goes now.
     *
     * `reconcileStaleExitOrigins` withdraws them at the end of the mutation, by the same test. Between the two, the
     * forward direction of the same mutation still read them as live: census de 9305625 (DOUBLE_ELIMINATION 8/7), a
     * relabel of `Main|2|1` dissolved `Backdraw|2|1`'s convergence, `3|1` re-derived to the DEFAULTED its carrier still
     * holds, and the arriving winner took that, went on into `4|1`, won it by the walkover `3|1` had produced as a
     * double exit, and was sent into a Main final that was full (ERR_EXISTING_POSITION_ASSIGNMENT after mutating).
     * The one exception is the reconciliation's own: a re-derived exit whose winning seat is a BYE still relays.
     */
    if (withdrawnExit.rederived && !isDoubleExit(withdrawnMatchUp.matchUpStatus)) {
      // A single exit records no claim on a BYE others already hold (`propagateUnfillableLoserBye` claims only a seat it
      // fills), so the claim the convergence shared there goes and the BYE stays theirs (census A1 wave 4, COMPASS 32/31
      // 21055187: `aDissolvedConvergenceLeavesASharedByeClaim`)
      if (matchUpsMap)
        withdrawSharedByeClaims({
          claimantMatchUpId: withdrawnMatchUp.matchUpId,
          tournamentRecord,
          drawDefinition,
          matchUpsMap,
          event,
        });
      const winnerDrawPosition = getWinningSideDrawPosition({
        structureId: withdrawnExit.structureId,
        matchUp: withdrawnMatchUp,
        drawDefinition,
      });
      const { positionAssignments } = getPositionAssignments({
        drawDefinition,
        structureId: withdrawnExit.structureId,
      });
      const winnerSeatIsBye = !!positionAssignments?.find((a) => a.drawPosition === winnerDrawPosition)?.bye;
      if (!winnerSeatIsBye) {
        const produced = withdrawProducedExits({
          mappedMatchUps: matchUpsMap?.mappedMatchUps,
          sourceMatchUpId: withdrawnExit.matchUpId,
          drawDefinition,
        });
        applyWithdrawnExits({ withdrawnExits: produced, tournamentRecord, drawDefinition, matchUpsMap, event });
      }
    }

    /**
     * A DOUBLE exit re-derived to a single one keeps one winner, and only that winner's position belongs a round on.
     * A double exit advances its seats structurally — the empty position that carries its produced exit on, under
     * `doubleExitPropagateBye: false` — and the seat its exit's carrier held went with them. Re-derived, that carrier is
     * the LOSER, and their position stood in the next round after the exit it carried there had been withdrawn (census
     * S4 run 16, COMPASS 16/14 seed 20586104 policy off: `West|2|1` dissolved to the WALKOVER the arrival wins, and
     * `West|3|1` still held its carrier's dp 2, so the arrival was refused ERR_EXISTING_POSITION_ASSIGNMENT). Released
     * here, from the round after; `releaseAdvancedDrawPosition`'s own scopes keep a BYE advancement and any decided
     * matchUp.
     */
    if (withdrawnExit.rederived && withdrawnExit.roundNumber && !isDoubleExit(withdrawnMatchUp.matchUpStatus)) {
      const keptWinnerDrawPosition = getWinningSideDrawPosition({
        structureId: withdrawnExit.structureId,
        matchUp: withdrawnMatchUp,
        drawDefinition,
      });
      releaseFromNextRound({
        withdrawnExit,
        drawPositions: (withdrawnMatchUp.drawPositions ?? []).filter(
          (drawPosition) => drawPosition !== keptWinnerDrawPosition,
        ),
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
    }

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
      releaseFromNextRound({
        withdrawnExit,
        drawPositions: (withdrawnMatchUp.drawPositions ?? []).filter(
          (drawPosition) => drawPosition !== withdrawnExit.winnerDrawPosition,
        ),
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
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
      releaseFromNextRound({
        withdrawnExit,
        drawPositions: vacant,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
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

/** Release each position from the round after the withdrawn matchUp, across links; the release's own scopes apply. */
function releaseFromNextRound({
  tournamentRecord,
  drawDefinition,
  withdrawnExit,
  drawPositions,
  matchUpsMap,
  event,
}: {
  drawPositions: (number | undefined)[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  withdrawnExit: WithdrawnExit;
  matchUpsMap?: MatchUpsMap;
  event?: Event;
}): void {
  if (!withdrawnExit.roundNumber) return;
  for (const drawPosition of drawPositions) {
    if (!drawPosition) continue;
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
    // ...and across the link at the withdrawn round itself, as the winner's release above does: from a structure's last
    // round the next round is in another structure, which a release keyed on this structure's rounds never reaches
    // (census run-17 baseline, DOUBLE_ELIMINATION 8/5 seeds 20622028 and 20630577, policy off: `Backdraw|4|1`'s double
    // walkover had advanced its carrier's seat into `Main|4|1`, and re-derived it stood there).
    releaseLinkedWinnerAdvancement({
      roundNumber: withdrawnExit.roundNumber,
      structureId: withdrawnExit.structureId,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      event,
    });
  }
}

/**
 * Withdraw a matchUp's BYE claims, clearing each propagated BYE seat no other claim still holds. A claim in `keepAt`
 * (the claimant's own loser target, where its BYE is still owed) is left standing.
 */
export function withdrawByeSeats({
  claimantMatchUpId,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  keepAt,
  event,
}: {
  tournamentRecord?: Tournament;
  keepAt?: string;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  claimantMatchUpId: string;
  event?: Event;
}) {
  const claimant = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === claimantMatchUpId);
  const claimantIsBye = claimant?.matchUpStatus === BYE;
  for (const [structureId, mapped] of Object.entries(matchUpsMap.mappedMatchUps)) {
    const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === structureId);
    for (const matchUp of mapped.matchUps as MatchUp[]) {
      for (const sideNumber of [1, 2]) {
        const claims = matchUp.sideExitProvenance?.[sideNumber]?.byeClaims ?? [];
        if (!claims.includes(claimantMatchUpId) || matchUp.matchUpId === keepAt) continue;
        withdrawByeClaim({ matchUp, sideNumber, claimantMatchUpId });
        if (matchUp.sideExitProvenance?.[sideNumber]?.byeClaims?.length) continue;
        if (claimantIsBye) continue;
        const drawPosition = getSideDrawPosition({ drawDefinition, structureId, matchUp, sideNumber });
        const assignment = positionAssignmentsOf(structure)?.find((entry) => entry.drawPosition === drawPosition);
        if (!assignment?.bye || !assignment.byeFromPropagation) continue;
        clearDrawPosition({ tournamentRecord, drawDefinition, structureId, drawPosition, matchUpsMap, event });
      }
    }
  }
}

/** withdraw a claimant's BYE claims only where another claim still holds the BYE */
function withdrawSharedByeClaims({
  claimantMatchUpId,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  claimantMatchUpId: string;
  matchUpsMap: MatchUpsMap;
  event?: Event;
}) {
  for (const matchUp of matchUpsMap.drawMatchUps) {
    let withdrawn = false;
    for (const sideNumber of [1, 2]) {
      const claims = matchUp.sideExitProvenance?.[sideNumber]?.byeClaims ?? [];
      if (claims.includes(claimantMatchUpId) && claims.length > 1) {
        withdrawByeClaim({ matchUp, sideNumber, claimantMatchUpId });
        withdrawn = true;
      }
    }
    // the claim is the matchUp's own record, and nothing else rewrites it in this pass: announced here
    if (withdrawn)
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        context: 'withdrawSharedByeClaims',
        eventId: event?.eventId,
        drawDefinition,
        matchUp,
        event,
      });
  }
}

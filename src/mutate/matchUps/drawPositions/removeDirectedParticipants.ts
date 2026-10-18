import { releaseAcrossWinnerLinks, releaseAdvancedDrawPositionAcrossLinks } from './releaseLinkedWinnerAdvancement';
import { includesMatchUpStatuses } from '@Mutate/drawDefinitions/matchUpGovernor/includesMatchUpStatuses';
import { applyWithdrawnExits } from '@Mutate/matchUps/matchUpStatus/applyWithdrawnExits';
import { removeSubsequentRoundsParticipant } from './removeSubsequentRoundsParticipant';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { updateTieMatchUpScore } from '@Mutate/matchUps/score/updateTieMatchUpScore';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { modifyMatchUpScore } from '@Mutate/matchUps/score/modifyMatchUpScore';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { withdrawUndeliveredByeOrigins } from './withdrawUndeliveredByeOrigins';
import { withdrawAwardsToEmptiedSeats } from './withdrawAwardsToEmptiedSeats';
import { removeOnwardLoserPlacements } from './removeOnwardLoserPlacements';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { decorateResult } from '@Functions/global/decorateResult';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import type { MatchUp } from '@Types/tournamentTypes';
import { clearDrawPosition } from './positionClear';
import { isDoubleExit } from '@Validators/isExit';
import {
  clearResolvedSideExitProvenance,
  withdrawProducedExits,
  deriveStatusCodes,
  sideRecordOf,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { ErrorType, MISSING_DRAW_POSITIONS, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MatchUpStatusUnion, DrawDefinition, Tournament, DrawLink, Event } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

export function removeDirectedParticipants(params): {
  tieMatchUpResult?: any;
  error?: ErrorType;
  success?: boolean;
} {
  const {
    dualWinningSideChange,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpStatus,
    matchUpsMap,
    dualMatchUp,
    targetData,
    matchUpId,
    structure,
    event,
  } = params;

  const isCollectionMatchUp = Boolean(params.matchUp.collectionId);
  const isAdHocMatchUp = isAdHoc({ structure });

  // targetData will have team matchUp when params.matchUp is a collectionMatchUp
  const { drawPositions, winningSide } = targetData.matchUp ?? {};
  if (!isAdHocMatchUp && !drawPositions) {
    return { error: MISSING_DRAW_POSITIONS };
  }

  const {
    targetLinks: { loserTargetLink, winnerTargetLink, byeTargetLink },
    targetMatchUps: { loserMatchUp, winnerMatchUp, byeMatchUp },
  } = targetData;

  const result = modifyMatchUpScore({
    ...params,
    matchUpStatus: matchUpStatus || TO_BE_PLAYED,
    // named, so a failure here can be injected and traced; the spread carried whatever context the
    // caller had, which for a winner change was none
    context: 'removeDirectedParticipants',
    removeWinningSide: true,
  });
  if (result.error) return result;

  let tieMatchUpResult;
  if (isCollectionMatchUp) {
    const { matchUpTieId, matchUpsMap } = params;
    tieMatchUpResult = updateTieMatchUpScore({
      appliedPolicies: params.appliedPolicies,
      matchUpId: matchUpTieId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (!dualWinningSideChange && !tieMatchUpResult.removeWinningSide) return { ...SUCCESS };
  }

  if (isAdHocMatchUp) return { ...SUCCESS };

  const { matchUps: sourceMatchUps } = getAllStructureMatchUps({
    afterRecoveryTimes: false,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    structure,
  });

  const { positionAssignments } = structureAssignedDrawPositions({ structure });

  // Bound by side, never by index: with one position present the array is compacted (`getSideDrawPosition`).
  const sidePosition = (sideNumber: number) =>
    getSideDrawPosition({
      drawDefinition,
      structureId: structure?.structureId,
      matchUp: targetData.matchUp,
      sideNumber,
    });
  const winningDrawPosition = sidePosition(winningSide);
  const loserDrawPosition = sidePosition(3 - winningSide);

  // use reduce for single pass resolution of both
  const { winnerParticipantId, loserParticipantId } =
    positionAssignments?.reduce(
      (assignments: any, assignment) => {
        if (assignment.drawPosition === loserDrawPosition) assignments.loserParticipantId = assignment.participantId;
        if (assignment.drawPosition === winningDrawPosition) assignments.winnerParticipantId = assignment.participantId;
        return assignments;
      },
      { winnerParticipantId: undefined, loserParticipantId: undefined },
    ) ?? {};

  const drawPositionMatchUps = sourceMatchUps.filter((matchUp) => includesDrawPosition(matchUp, loserDrawPosition));

  // Take back the exits THIS matchUp produced — BEFORE the link-directed removals below.
  //
  // The removals below are link-directed: they walk loserTargetLink/winnerTargetLink and undo one
  // hop. A propagated exit is not confined to one hop — `progressExitStatus` re-propagates through
  // a BYE onto wherever the participant landed, and a produced exit can itself produce another
  // downstream — so the withdrawal is keyed on `sideExitProvenance.sourceMatchUpId` and iterates,
  // rather than re-walking the links. See withdrawProducedExits for why identity rather than status
  // is the discriminator.
  //
  // ORDER: this runs FIRST, and that was measured. `removeDirectedLoser` calls
  // `removeOnwardLoserPlacements`, which only releases a placement that is INERT for its
  // participant — and a placement sitting under a still-standing produced exit does not look inert.
  // Withdrawing afterwards left the onward placement behind: seed 9000418 (COMPASS 32/30), three
  // steps, a walkover re-scored to a DEFAULTED with the winning side flipped. The old loser stayed
  // in the South structure, so the NEW loser of the West matchUp had nowhere to be directed and the
  // draw reported DROPPED_PROGRESSION. Reverting the derived state first makes those placements
  // inert, which is what `removeOnwardLoserPlacements` is already looking for.
  const withdrawnExits = withdrawProducedExits({
    mappedMatchUps: matchUpsMap?.mappedMatchUps,
    sourceMatchUpId: matchUpId,
    drawDefinition,
  });
  applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap, event });

  if (winnerMatchUp) {
    removeDirectedWinner({
      sourceMatchUpStatus: matchUpStatus,
      sourceMatchUpId: matchUpId,
      inContextDrawMatchUps,
      winningDrawPosition,
      winnerParticipantId,
      tournamentRecord,
      winnerTargetLink,
      drawDefinition,
      winnerMatchUp,
      dualMatchUp,
      matchUpsMap,
    });
  }

  if (loserMatchUp) {
    const { winnerHadMatchUpStatus: winnerHadBye } = includesMatchUpStatuses({
      drawPositionMatchUps: teamLevelMatchUps(drawPositionMatchUps),
      sourceMatchUps: teamLevelMatchUps(sourceMatchUps),
      loserDrawPosition,
    });

    const loserLinkCondition = loserTargetLink.linkCondition;
    const firstMatchUpLoss = loserLinkCondition === FIRST_MATCHUP;

    if (winnerHadBye && firstMatchUpLoss) {
      // The fed drawPosition is always the lowest number
      const drawPosition = Math.min(...loserMatchUp.drawPositions);
      removeDirectedBye({
        targetLink: loserTargetLink,
        inContextDrawMatchUps,
        drawDefinition,
        drawPosition,
        matchUpsMap,
        event,
      });
    }

    const removeLoserResult = removeDirectedLoser({
      sourceMatchUpStatus: matchUpStatus,
      sourceMatchUpId: matchUpId,
      loserParticipantId,
      tournamentRecord,
      loserTargetLink,
      drawDefinition,
      loserMatchUp,
      dualMatchUp,
      matchUpsMap,
      event,
    });
    if (removeLoserResult.error) return removeLoserResult;
  }

  if (byeMatchUp) {
    // check whether byeMatchUp includes an active drawPosition
    const drawPosition = Math.min(...byeMatchUp.drawPositions);
    removeDirectedBye({
      sourceMatchUpId: matchUpId,
      targetLink: byeTargetLink,
      inContextDrawMatchUps,
      drawDefinition,
      drawPosition,
      matchUpsMap,
      event,
    });
  }

  const annotate = tieMatchUpResult && { tieMatchUpResult };
  return { ...SUCCESS, ...annotate };
}
type RemvoveDirectedWinnerArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  winnerMatchUp: HydratedMatchUp;
  dualMatchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  winnerParticipantId?: string;
  drawDefinition: DrawDefinition;
  sourceMatchUpStatus?: MatchUpStatusUnion;
  winningDrawPosition?: number;
  winnerTargetLink?: DrawLink;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  event?: Event;
};
export function removeDirectedWinner({
  inContextDrawMatchUps,
  winningDrawPosition,
  sourceMatchUpStatus,
  winnerParticipantId,
  tournamentRecord,
  winnerTargetLink,
  sourceMatchUpId,
  drawDefinition,
  winnerMatchUp,
  matchUpsMap,
  dualMatchUp,
  event,
}: RemvoveDirectedWinnerArgs) {
  const { structureId, roundNumber } = winnerMatchUp;
  const stack = 'removeDirectedWinner';

  /**
   * The drawPosition to take back out of the winnerMatchUp's structure, in THAT structure's numbering.
   *
   * `winningDrawPosition` is the winner's position in the SOURCE structure. Within a structure that is
   * the right number; across a link it names whoever holds that number in the target, which is
   * somebody else. It was used for both, so undoing a cross-structure winner removed a position that
   * was not theirs and left theirs behind — and the next winner was refused
   * `ERR_EXISTING_POSITION_ASSIGNMENT` after the source result had been written.
   *
   * DOUBLE_ELIMINATION is where it bites, because its Backdraw numbers from 1 like Main does: census
   * seed 9000402 flipped the Backdraw final from the finalist at Backdraw 3 to the one at Backdraw 1,
   * the removal looked for 3 in the Main final, and the old winner stayed there at Main 8. See
   * `crossStructureWinnerPositions.test.ts`.
   */
  let targetDrawPosition: number | undefined = winningDrawPosition;

  if (winnerTargetLink) {
    const structureId = winnerTargetLink.target.structureId;
    const { structure } = findStructure({ drawDefinition, structureId });
    if (!structure) return { error: STRUCTURE_NOT_FOUND };
    const { positionAssignments } = structureAssignedDrawPositions({
      structure,
    });

    // remove participant from seedAssignments
    structure.seedAssignments = (structure.seedAssignments ?? []).filter(
      (assignment) => assignment.participantId !== winnerParticipantId,
    );

    const relevantAssignment = positionAssignments?.find(
      (assignment) => assignment.participantId === winnerParticipantId,
    );
    const winnerDrawPosition = relevantAssignment?.drawPosition;
    targetDrawPosition = winnerDrawPosition;

    const { matchUps } = getAllStructureMatchUps({
      drawDefinition,
      structure,
      event,
    });
    // The assignment goes only where the link is what put the participant in this structure: their position first
    // appears in the link's target round (DOUBLE_ELIMINATION's Decider, qualifiers into Main). A participant fed BACK
    // into a structure they already stand in (the Backdraw champion re-entering the Main final on their own Main
    // drawPosition) keeps their seat.
    //
    // This counted the position's instances across the structure's matchUps and read "one instance" as link-only. By
    // the time this runs for a cross-link target, `releaseLinkedWinnerAdvancement` can already have taken the
    // position back out of the target round, and the one instance left was the participant's own first-round seat:
    // undoing a Backdraw double exit emptied Main drawPosition 5 under a COMPLETED Main|1|3 (census w2 9100389).
    const { initialRoundNumber } = getInitialRoundNumber({ drawPosition: winnerDrawPosition as number, matchUps });
    const placedByLink = winnerDrawPosition !== undefined && initialRoundNumber === winnerTargetLink.target.roundNumber;

    if (placedByLink) {
      positionAssignments?.forEach((assignment) => {
        if (assignment.participantId === winnerParticipantId) {
          delete assignment.participantId;
        }
      });
    } else {
      // a TEAM structure's lines carry no drawPositions
      const drawPositionMatchUps = matchUps.filter((matchUp) => includesDrawPosition(matchUp, winnerDrawPosition));
      pushGlobalLog({
        method: 'removeDirectedParticipants',
        retained: 'position assignment kept: the participant stands in this structure before the link target round',
        drawPositionMatchUps,
        winnerTargetLink,
      });
    }

    const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === winnerMatchUp.matchUpId);

    targetMatchUp &&
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        event,
        matchUp: targetMatchUp,
        context: stack,
        drawDefinition,
      });
  }

  // Remove participant's drawPosition from current and subsequent round matchUps
  roundNumber &&
    targetDrawPosition &&
    removeSubsequentRoundsParticipant({
      targetDrawPosition,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      tournamentRecord,
      sourceMatchUpId,
      drawDefinition,
      dualMatchUp,
      matchUpsMap,
      roundNumber,
      structureId,
    });

  return { ...SUCCESS };
}

function removeDirectedLoser({
  sourceMatchUpStatus,
  loserParticipantId,
  tournamentRecord,
  loserTargetLink,
  sourceMatchUpId,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  dualMatchUp,
  event,
}): { error?: ErrorType; success?: boolean } {
  const stack = 'removeDirectedLoser';
  const structureId = loserTargetLink.target.structureId;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  // A LOSER WHO IS NOBODY HOLDS NO SEAT. A matchUp an exit decided towards an empty seat has no participant on its losing
  // side, and an undefined id matched every assignment holding none — each BYE and open seat of the target structure —
  // so their advancements were released and an empty seed slot dropped (census run 17 F3, COMPASS 32/30 seed 20733408,
  // policy off: `West|1|2`'s produced walkover converged, and the BYE that two BYEs had sent on to `South|3|1` was taken
  // back while both still stood).
  const isLoser = (assignment: { participantId?: string }) =>
    !!loserParticipantId && assignment.participantId === loserParticipantId;
  const relevantDrawPosition = positionAssignments?.find(isLoser)?.drawPosition;
  const clearedDrawPositions: number[] = [];
  positionAssignments?.forEach((assignment) => {
    if (isLoser(assignment)) {
      delete assignment.participantId;
      clearedDrawPositions.push(assignment.drawPosition);
    }
  });

  // Emptying the assignment above leaves the drawPosition behind in every target-structure matchUp
  // the participant had ADVANCED into, which blocks that slot against the next arrival. Its twin
  // `removeDirectedWinner` has always stripped — through `removeSubsequentRoundsParticipant`, which
  // also collapses status and codes — and only the loser direction did not. That asymmetry was the
  // largest single producer of the refusal cluster (72 of 87 stale slots measured over the 600-seed
  // sweep window).
  //
  // The loser direction takes the NARROW form deliberately: reusing
  // `removeSubsequentRoundsParticipant` here also rewrote matchUpStatus, winningSide and
  // matchUpStatusCodes on the released matchUps, and that was measurably wider than the defect —
  // it flipped a recorded winningSide on a re-score and broke a BYE unwind. Releasing the slot is
  // the whole fix; see releaseAdvancedDrawPosition for the two scopes that keep it safe.
  //
  // Every position the loop above emptied is released, not just the first: the deletion is keyed on
  // participantId, and a participant fed back into a draw holds more than one.
  //
  // The participant is LEAVING, so an exit awarded to their seat is held open for whoever arrives next rather than kept
  // as a decided matchUp the release must not touch. Census w2 9100572 (MODIFIED_FEED_IN_CHAMPIONSHIP 16/16): the
  // loser had taken the walkover a carrier brought to `Consolation|3|2`; removed, the award stayed decided, their seat
  // was kept there, and the BYE for their vacated position was placed at that furthest advancement, in front of the
  // participant who should have arrived to take the walkover (BYE_ADVANCEMENT_MISSING).
  if (loserMatchUp?.roundNumber) {
    for (const drawPosition of clearedDrawPositions) {
      releaseAdvancedDrawPositionAcrossLinks({
        fromRoundNumber: loserMatchUp.roundNumber,
        participantId: loserParticipantId,
        occupantLeaving: true,
        tournamentRecord,
        drawDefinition,
        drawPosition,
        matchUpsMap,
        structureId,
        event,
      });
    }
  }

  // A CLEARED LOSER SEAT LEAVES NO AWARD BEHIND. The release above never reads the seat's own matchUp (scope 1: the
  // round where the position first appears) nor one it reached past a BYE (scope 3), so a PRODUCED exit awarded to
  // this loser on arrival stayed won by the seat they have just left (census A1 cases 18, 20, 21, 27: CURTIS 32,
  // DOUBLE_ELIMINATION 8 and 16, FIRST_MATCH_LOSER_CONSOLATION 16; e.g. `Consolation 1|2|4` kept ws 1 over an empty dp 4
  // after `Main|2|5` was scored and cleared). "A produced exit awards no empty seat, on any path … it also holds when a
  // position is cleared out of a matchUp" (exit-propagation.md); the test is `positionClear`'s `awardStands`, so a
  // carried exit, and a produced one that came straight down its loser link, keep their award as direct entry writes it.
  // Asked after the release, so the reservation the pending exit holds for the next arrival stays where it was. Not
  // when the source becomes a double exit: its own cascade re-settles the seat (a BYE nobody can fill, or a produced
  // exit), and the BYE placement reads the award to take back what it advanced (MODIFIED_FEED_IN_CHAMPIONSHIP 32/29
  // 20655968, `aSeatThatBecomesAByeKeepsNothingItWasAwarded`: taken back here first, the BYE's opponent dp 23 was never
  // advanced past it).
  if (clearedDrawPositions.length && !isDoubleExit(sourceMatchUpStatus)) {
    withdrawAwardsToEmptiedSeats({
      positionAssignments: positionAssignments ?? [],
      clearedDrawPositions,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structureId,
      event,
    });
  }

  // A BYE matchUp whose participant seat was just emptied has delivered nothing, so the BYE origin it gave the side it
  // feeds goes too (census A1 G1b, `aByeOriginGoesWhenItsFeederSeatEmpties`)
  withdrawUndeliveredByeOrigins({
    positionAssignments: positionAssignments ?? [],
    clearedDrawPositions,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    structureId,
    event,
  });

  // A seat that keeps its BYE advancement releases no round above, so nothing asked the links out of this
  // structure: a loser removed from a Backdraw they had BYE-advanced through stayed in the grand final (mode D).
  const [clearedDrawPosition] = clearedDrawPositions;
  if (clearedDrawPosition && loserParticipantId) {
    releaseAcrossWinnerLinks({
      drawPosition: clearedDrawPosition,
      participantId: loserParticipantId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structureId,
      event,
    });
  }

  // The removal above is ONE link deep. Where the target structure itself feeds a further structure
  // — COMPASS and OLYMPIC, and no other sweep draw type — the participant has already been directed
  // onward from it, and that placement is orphaned the moment they leave. Scoped to placements that
  // are INERT for them; see removeOnwardLoserPlacements for why a blanket cascade is not safe.
  if (clearedDrawPositions.length) {
    removeOnwardLoserPlacements({
      participantId: loserParticipantId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structureId,
    });
  }

  if (sourceMatchUpId && sourceMatchUpStatus) {
    //It could be that the loser match up was already a double walkover with one propagated
    //exit with a player and the other participant as a produced exit from a parent double WO.
    //We then want to remove the specific WO reason for the participant as the participant
    //has been removed from the draw positions and this is now a straight double WO.
    //In case the loser matchup was not a double WO we jsut remove the status codes.
    const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);
    const record = sideRecordOf(targetMatchUp);
    // Provenance stamped for the exit being removed is stale — but only once the status itself has
    // resolved. While the matchUp is still an exit the provenance still describes it, and clearing it
    // would leave an exit with no marker at all.
    clearResolvedSideExitProvenance(targetMatchUp);
    /**
     * THE CODES ARE DERIVED FROM WHAT PROVENANCE STILL SAYS — after the clear, so they describe the
     * exits that REMAIN.
     *
     * **P37.** This line was `sourceMatchUpStatus === DOUBLE_WALKOVER ? ['WO', 'WO'] : []`, and CA
     * named it on 2026-09-11: *"a hardcoded legacy string pair, written positionally, and asymmetric
     * … this is propagation logic expressed in the legacy array."* It was wrong three ways at once:
     *
     *  - a `DOUBLE_DEFAULT` source fell through to `[]`, so the surviving exit lost its code entirely;
     *  - `['WO', 'WO']` claims BOTH sides exited whatever provenance says, so a matchUp with one
     *    exiting side got a walkover code on the WINNER's side;
     *  - the codes were written BEFORE the clear, so they could not reflect it.
     *
     * The second one is measured, not hypothetical: it is what `EXIT_CODE_ON_WINNER_SIDE` reports at
     * severity `error` once the projection stops overwriting this array and masking it — 4 tests
     * across 4 files, including the census replay of sweep seed 6141627. Traced 2026-09-27:
     * `codes=['WO','WO']`, `winningSide=1`, and provenance holding side 2 alone.
     */
    targetMatchUp.matchUpStatusCodes = deriveStatusCodes(targetMatchUp);
    // the loser target's side record is rewritten here and by nothing else in this removal: announced when it changed
    if (record !== sideRecordOf(targetMatchUp))
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        context: 'removeDirectedLoser',
        matchUp: targetMatchUp,
        eventId: event?.eventId,
        drawDefinition,
        event,
      });
  }

  // remove participant from seedAssignments
  structure.seedAssignments = (structure.seedAssignments ?? []).filter((assignment) => !isLoser(assignment));

  if (dualMatchUp) {
    // remove propagated lineUp
    const drawPositionSideIndex = loserMatchUp?.sides.reduce(
      (sideIndex, side, i) => (side.drawPosition === relevantDrawPosition ? i : sideIndex),
      undefined,
    );
    const targetMatchUp = matchUpsMap?.drawMatchUps?.find(({ matchUpId }) => matchUpId === loserMatchUp.matchUpId);
    const targetSide = targetMatchUp?.sides?.[drawPositionSideIndex];

    if (targetSide) {
      delete targetSide.lineUp;

      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        event,
        matchUp: targetMatchUp,
        context: stack,
        drawDefinition,
      });
    }
  }

  return { ...SUCCESS };
}

type RemoveDirectedByeArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  drawPosition: number;
  targetLink: DrawLink;
  event?: Event;
};
export function removeDirectedBye({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  drawPosition,
  matchUpsMap,
  targetLink,
  event,
}: RemoveDirectedByeArgs) {
  const structureId = targetLink.target.structureId;
  const stack = 'removeDirectedBye';

  pushGlobalLog({
    color: 'brightyellow',
    method: stack,
    drawPosition,
  });

  const result = clearDrawPosition({
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    drawPosition,
    matchUpsMap,
    structureId,
    event,
  });

  return decorateResult({ result, stack });
}

// Preserve includes(undefined), including an unfilled slot, without claiming the position is a number.
function includesDrawPosition(matchUp: MatchUp, drawPosition?: number): boolean | undefined {
  const positions: readonly (number | undefined)[] | undefined = matchUp.drawPositions;
  return positions?.includes(drawPosition);
}

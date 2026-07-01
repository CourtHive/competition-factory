import { removeSubsequentRoundsParticipant } from './removeSubsequentRoundsParticipant';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { clearDrawPosition } from './positionClear';
import { findStructure } from '@Acquire/findStructure';
import { isExit } from '@Validators/isExit';

// constants and types
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';

const FAILSAFE = 10;

// Reverse counterpart of the forward propagated-exit cascade (progressExitStatus +
// resolvePropagatedExitOnAdvance). When a matchUp that fed a propagated WALKOVER/
// DEFAULT into a consolation is reset, the generic removal path leaves the deep
// consolation exit matchUps in an inconsistent state:
//   (b) the exit CARRIER (the propagated loser) is removed but the exit matchUp
//       retains a stale WALKOVER + an over-advanced auto-resolve winner; or
//   (a) a fall-through BYE cannot be cleared (DRAW_POSITION_ACTIVE) because its
//       paired participant advanced through the exit — nothing unwinds.
// This module re-derives the affected exit matchUps from CURRENT state (it never
// relies on a persistent marker — a propagated exit is detected structurally).
export function reconcilePropagatedExits(params): { success?: boolean } {
  const { targetData, drawDefinition, matchUpsMap } = params;
  const loserStructureId = targetData?.targetLinks?.loserTargetLink?.target?.structureId;
  if (!loserStructureId || !matchUpsMap) return { ...SUCCESS };

  const { structure } = findStructure({ drawDefinition, structureId: loserStructureId });
  if (!structure) return { ...SUCCESS };

  collapseStaleExitMatchUps({ ...params, structureId: loserStructureId });
  return { ...SUCCESS };
}

// SCENARIO (b): the exit carrier has been removed but a downstream exit matchUp is
// still marked WALKOVER/DEFAULTED with an auto-resolved winner advanced onward.
// Collapse each such matchUp (drop the exit, clear the winner, un-advance them) and
// re-scan until the structure is stable (bounded fixpoint, mirrors the forward loop).
function collapseStaleExitMatchUps({ drawDefinition, matchUpsMap, tournamentRecord, structureId, event }): void {
  let iteration = 0;
  while (iteration < FAILSAFE) {
    iteration += 1;

    const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    const structureMatchUps = inContextDrawMatchUps
      .filter((m) => m.structureId === structureId)
      .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));

    const staleExit = structureMatchUps.find((exitMatchUp) => {
      if (!isExit(exitMatchUp.matchUpStatus) || !exitMatchUp.winningSide || !exitMatchUp.roundNumber) return false;
      // Structural (code-independent) test: a resolved propagated exit is stale once
      // its loser slot is emptied — the winning side still holds a participant (the
      // fall-through / auto-resolve winner) while the exiting side it "beat" is gone.
      // A still-PENDING propagated exit is left untouched: there the WINNING side is
      // the empty slot, so this predicate is false.
      const loserSideNumber = exitMatchUp.winningSide === 1 ? 2 : 1;
      const winnerSide = exitMatchUp.sides?.find((s) => s.sideNumber === exitMatchUp.winningSide);
      const loserSide = exitMatchUp.sides?.find((s) => s.sideNumber === loserSideNumber);
      return Boolean(winnerSide?.participantId) && !loserSide?.participantId && !loserSide?.bye;
    });
    if (!staleExit?.roundNumber) break;

    // un-advance the (now-unjustified) auto-resolve winner from the rounds beyond the exit
    const winnerSide = staleExit.sides?.find((s) => s.sideNumber === staleExit.winningSide);
    if (winnerSide?.participantId && winnerSide.drawPosition) {
      removeSubsequentRoundsParticipant({
        roundNumber: staleExit.roundNumber + 1,
        targetDrawPosition: winnerSide.drawPosition,
        inContextDrawMatchUps,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        structureId,
        event,
      });
    }

    collapseExitMatchUp({ drawDefinition, matchUpsMap, tournamentRecord, structureId, staleExit, event });
  }
}

function collapseExitMatchUp({ drawDefinition, matchUpsMap, tournamentRecord, structureId, staleExit, event }): void {
  const noContextMatchUp = matchUpsMap.drawMatchUps.find((m) => m.matchUpId === staleExit.matchUpId);
  if (!noContextMatchUp) return;

  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
  const containsBye = (noContextMatchUp.drawPositions ?? []).some(
    (drawPosition) => positionAssignments?.find((a) => a.drawPosition === drawPosition)?.bye,
  );

  Object.assign(noContextMatchUp, {
    matchUpStatus: containsBye ? BYE : TO_BE_PLAYED,
    matchUpStatusCodes: [],
    winningSide: undefined,
    score: undefined,
  });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    context: 'collapseStaleExit',
    matchUp: noContextMatchUp,
    eventId: event?.eventId,
    drawDefinition,
  });
}

// SCENARIO (a): a fall-through BYE at `byeDrawPosition` could not be cleared because
// its paired participant advanced through a downstream propagated exit (and took the
// auto-resolved walkover). Un-advance the pair out of the exit, re-derive the exit
// back to its PENDING form via the same forward primitive (progressExitStatus), then
// re-attempt the BYE clear (now unblocked).
export function revertActiveByeThroughExit(params): { success?: boolean } {
  const { byeDrawPosition, loserMatchUp, drawDefinition, matchUpsMap, tournamentRecord, event } = params;
  const structureId = loserMatchUp?.structureId;
  if (!structureId || !matchUpsMap) return { ...SUCCESS };

  const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });

  // only handle a genuine fall-through BYE (scenario a); the same removeDirectedBye
  // call also fires for a propagated-exit participant (scenario b), which is not a bye
  const byeIsPresent = positionAssignments?.find((a) => a.drawPosition === byeDrawPosition)?.bye;
  if (!byeIsPresent) return { ...SUCCESS };

  const pairDrawPosition = loserMatchUp.drawPositions?.find((dp) => dp && dp !== byeDrawPosition);
  if (!pairDrawPosition) return { ...SUCCESS };

  const pairAssignment = positionAssignments?.find((a) => a.drawPosition === pairDrawPosition);
  const pairParticipantId = pairAssignment?.participantId;
  if (!pairParticipantId) return { ...SUCCESS };

  const loserRoundNumber = loserMatchUp.roundNumber ?? 0;
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  const exitMatchUp = inContextDrawMatchUps.find(
    (E) =>
      E.structureId === structureId &&
      (E.roundNumber ?? 0) > loserRoundNumber &&
      isExit(E.matchUpStatus) &&
      E.sides?.find((s) => s.sideNumber === E.winningSide)?.participantId === pairParticipantId,
  );
  if (!exitMatchUp?.roundNumber) return { ...SUCCESS };

  // capture the carrier + carried code BEFORE mutating (the exiting participant is the
  // side that is NOT the pair, i.e. the auto-resolve loser)
  const carrierSide = exitMatchUp.sides?.find((s) => s.participantId && s.participantId !== pairParticipantId);
  const carrierParticipantId = carrierSide?.participantId;
  const carriedCode = (exitMatchUp.matchUpStatusCodes ?? []).find((code) => typeof code === 'string' && code.length);
  const exitStatus = exitMatchUp.matchUpStatus;

  // un-advance the pair out of the exit matchUp (and anything beyond it)
  removeSubsequentRoundsParticipant({
    roundNumber: exitMatchUp.roundNumber,
    targetDrawPosition: pairDrawPosition,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    structureId,
    event,
  });

  // re-derive the exit matchUp back to its PENDING form (carrier present, opponent slot
  // now empty): the empty side becomes the winner and the carried code sits on the
  // carrier's side — mirrors the forward progressExitStatus RULE 2 / auto-resolve.
  if (carrierParticipantId) {
    const refreshed = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
    const carrierSideNumber = refreshed
      .find((m) => m.matchUpId === exitMatchUp.matchUpId)
      ?.sides?.find((s) => s.participantId === carrierParticipantId)?.sideNumber;
    const noContextExit = matchUpsMap.drawMatchUps.find((m) => m.matchUpId === exitMatchUp.matchUpId);
    if (carrierSideNumber && noContextExit) {
      applyPendingExit({
        drawDefinition,
        tournamentRecord,
        carrierSideNumber,
        noContextExit,
        carriedCode,
        exitStatus,
        event,
      });
    }
  }

  // the BYE is no longer blocked by an advanced pair — clear it
  clearDrawPosition({
    drawPosition: byeDrawPosition,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    structureId,
    event,
  });

  return { ...SUCCESS };
}

// Put an exit matchUp back into its PENDING form: the exiting participant sits on
// `carrierSideNumber`, the opponent slot is the (empty) winner, and the carried code is
// placed position-aware on the carrier's side (leading slots padded with '' so a side-2
// code never mis-maps to side 1).
function applyPendingExit({
  drawDefinition,
  tournamentRecord,
  carrierSideNumber,
  noContextExit,
  carriedCode,
  exitStatus,
  event,
}): void {
  const opponentSideNumber = carrierSideNumber === 1 ? 2 : 1;
  const matchUpStatusCodes: string[] = [];
  if (carriedCode) {
    for (let i = 0; i < carrierSideNumber - 1; i++) matchUpStatusCodes[i] = '';
    matchUpStatusCodes[carrierSideNumber - 1] = carriedCode;
  }

  Object.assign(noContextExit, {
    matchUpStatus: exitStatus,
    winningSide: opponentSideNumber,
    matchUpStatusCodes,
    score: undefined,
  });

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    context: 'revertToPendingExit',
    matchUp: noContextExit,
    eventId: event?.eventId,
    drawDefinition,
  });
}

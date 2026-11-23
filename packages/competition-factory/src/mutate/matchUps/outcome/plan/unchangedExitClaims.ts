import { claimAssignment, hasSourceOrigin, holdsPosition, winnerClaimEdge } from './placementClaims';
import { heldLinkedWalkover } from './heldLinkedWalkovers';
import { APPLY_VALUES, bareResultRequest, indexed, sideDrawPosition } from './planShared';

// constants and types
import { BYE, COMPLETED, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { ExitReasonArgs } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';

// A BYE carries the occupied side's claim to the next round of its own structure.
function nextWinnerSeat(args: ExitReasonArgs, source: HydratedMatchUp) {
  if (!args.drawDefinition || !args.view.inContextDrawMatchUps || !source.roundNumber) return undefined;
  const next = winnerClaimEdge(
    { drawDefinition: args.drawDefinition, inContextDrawMatchUps: args.view.inContextDrawMatchUps },
    source,
  );
  return !next ||
    next.targetLinks.winnerTargetLink ||
    next.targetMatchUps.loserMatchUp ||
    next.targetMatchUps.byeMatchUp
    ? undefined
    : next.targetMatchUps.winnerMatchUp;
}

/** The linked loser passed a structural BYE and lost a standing walkover. The award's winner still
 * occupies the earned seat. A reservation, another feeder's exit or a missing placement owes a different proof. */
function lostAfterStructuralBye(args: ExitReasonArgs, linked: HydratedMatchUp, loserId?: string) {
  if (linked.matchUpStatus !== BYE || linked.winningSide || !args.view.targets.loserTargetSeat?.opponentBye)
    return false;
  const other = linked.sides?.find((side) => side.bye && !side.participantId);
  if (!other?.drawPosition) return false;
  if (!args.drawDefinition || !args.view.inContextDrawMatchUps) return false;
  const assignment = claimAssignment(
    { drawDefinition: args.drawDefinition, inContextDrawMatchUps: args.view.inContextDrawMatchUps },
    linked,
    other.drawPosition,
  );
  if (!assignment?.bye || assignment.byeFromPropagation || assignment.participantId || assignment.qualifier)
    return false;
  const award = nextWinnerSeat(args, linked);
  if (
    !award ||
    award.matchUpStatus !== WALKOVER ||
    award.sideExitProvenance ||
    !holdsPosition(award, loserId, args.view.targets.loserTargetDrawPosition)
  )
    return false;
  const earned = award.sides?.find((side) => side.sideNumber === award.winningSide);
  if (!earned?.participantId || earned.participantId === loserId) return false;
  const receiver = nextWinnerSeat(args, award);
  return (
    receiver?.matchUpStatus === TO_BE_PLAYED &&
    !receiver.winningSide &&
    !receiver.sideExitProvenance &&
    holdsPosition(receiver, earned.participantId, earned.drawPosition)
  );
}

/** A non-carrying retirement changes only the source result when both outgoing claims still stand.
 * The winner holds their own position. The loser holds the linked position in an independently completed
 * match, a standing walkover path, or a loss after a structural BYE. Any origin of this source, even beyond the two targets, can owe a withdrawal or a label refresh. */
export function retirementClaimsStand(args: ExitReasonArgs): boolean {
  const { request, route, view } = args;
  const { existing, targets, inContextDrawMatchUps } = view;
  const winner = request.winningSide;
  if (
    route !== APPLY_VALUES ||
    existing.matchUpStatus !== COMPLETED ||
    request.matchUpStatus !== RETIRED ||
    request.flags.propagateRetirementAsExit ||
    !request.flags.propagateExitStatus ||
    !request.score?.sets?.length ||
    !bareResultRequest({ ...request, score: undefined }) ||
    (winner !== 1 && winner !== 2) ||
    winner !== existing.winningSide ||
    !request.matchUpId ||
    view.isTeam ||
    view.line ||
    !inContextDrawMatchUps
  )
    return false;

  const winnerId = targets.sideParticipantIds[winner];
  const loserId = targets.sideParticipantIds[winner === 1 ? 2 : 1];
  const onward = indexed(view, targets.winnerMatchUpId);
  const linked = indexed(view, targets.loserMatchUpId);
  if (
    winnerId === loserId ||
    !onward ||
    !linked ||
    targets.winnerLink ||
    onward.structureId !== targets.source.structureId ||
    linked.structureId === onward.structureId ||
    !targets.loserTargetSeat?.opponentHeld ||
    targets.loserTargetSeat.participantId !== loserId ||
    !holdsPosition(onward, winnerId, sideDrawPosition(view, winner)) ||
    !holdsPosition(linked, loserId, targets.loserTargetDrawPosition)
  )
    return false;
  const played = linked.matchUpStatus === COMPLETED && !!linked.winningSide;
  const held = !linked.sideExitProvenance && (played || lostAfterStructuralBye(args, linked, loserId));
  if (!held && !heldLinkedWalkover(args, linked)) return false;
  return !hasSourceOrigin(inContextDrawMatchUps, request.matchUpId);
}

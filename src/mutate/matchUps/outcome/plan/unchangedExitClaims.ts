import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { APPLY_VALUES, bareResultRequest, indexed, sideDrawPosition } from './planShared';

// constants and types
import { BYE, COMPLETED, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { ExitReasonArgs } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';

function holdsPosition(matchUp: HydratedMatchUp | undefined, participantId?: string, position?: number): boolean {
  return (
    !!participantId &&
    !!position &&
    !!matchUp?.sides?.some((side) => side.participantId === participantId && side.drawPosition === position)
  );
}

// A BYE carries the occupied side's claim to the next round of its own structure.
function nextWinnerSeat(args: ExitReasonArgs, source: HydratedMatchUp) {
  if (!args.drawDefinition || !source.roundNumber) return undefined;
  const next = positionTargets({
    drawDefinition: args.drawDefinition,
    inContextDrawMatchUps: args.view.inContextDrawMatchUps,
    matchUpId: source.matchUpId,
    inContextMatchUp: source,
    asReferences: true,
  });
  const target = next.targetMatchUps?.winnerMatchUp;
  if (
    !target ||
    next.targetLinks?.winnerTargetLink ||
    next.targetMatchUps?.loserMatchUp ||
    next.targetMatchUps?.byeMatchUp
  )
    return undefined;
  return target.structureId === source.structureId &&
    target.roundNumber === source.roundNumber + 1 &&
    target.matchUpId === source.winnerMatchUpId
    ? target
    : undefined;
}

/** The linked loser passed a structural BYE and lost a standing walkover. The award's winner still
 * occupies the earned seat. A reservation, another feeder's exit or a missing placement owes a different proof. */
function lostAfterStructuralBye(args: ExitReasonArgs, linked: HydratedMatchUp, loserId?: string) {
  if (linked.matchUpStatus !== BYE || linked.winningSide || !args.view.targets.loserTargetSeat?.opponentBye)
    return false;
  const other = linked.sides?.find((side) => side.bye && !side.participantId);
  if (!other?.drawPosition) return false;
  const assignment = getPositionAssignments({
    drawDefinition: args.drawDefinition,
    structureId: linked.structureId,
  }).positionAssignments.find((seat) => seat.drawPosition === other.drawPosition);
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
 * match or has lost after a structural BYE. Any origin of this source, even beyond the two targets, can owe a withdrawal or a label refresh. */
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
    linked.sideExitProvenance ||
    !targets.loserTargetSeat?.opponentHeld ||
    targets.loserTargetSeat.participantId !== loserId ||
    !holdsPosition(onward, winnerId, sideDrawPosition(view, winner)) ||
    !holdsPosition(linked, loserId, targets.loserTargetDrawPosition)
  )
    return false;
  const played = linked.matchUpStatus === COMPLETED && !!linked.winningSide;
  if (!played && !lostAfterStructuralBye(args, linked, loserId)) return false;
  return !inContextDrawMatchUps.some((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some((entry) => entry?.sourceMatchUpId === request.matchUpId),
  );
}

import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { hasSourceOrigin, holdsPosition } from './placementClaims';
import { claimEdges as edges, consecutiveByeClaims, type ClaimDraw as Draw } from './byeAwardClaims';
import { APPLY_VALUES, bareResultRequest, indexed, sideDrawPosition, storedLoserId } from './planShared';

// constants and types
import { BYE, COMPLETED, DEFAULTED, DOUBLE_DEFAULT, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { ExitReasonArgs } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';

/** The other semifinal has nobody to send: its missing loser's side holds a default produced by its own feeder.
 * Check the losing link's actual landing and the stored assignment for the reservation there. */
function supportedEmptyLoser(draw: Draw, feeder: HydratedMatchUp, held: HydratedMatchUp, position: number) {
  if (feeder.matchUpStatus !== DEFAULTED || !feeder.winningSide) return false;
  const side = feeder.winningSide === 1 ? 2 : 1;
  const origin = feeder.sideExitProvenance?.[side];
  if (
    origin?.previousMatchUpStatus !== DOUBLE_DEFAULT ||
    origin.matchUpStatus !== DEFAULTED ||
    feeder.sides?.some((s) => s.sideNumber === side && s.participantId)
  )
    return false;
  const producer = draw.inContextDrawMatchUps.find((m) => m.matchUpId === origin.sourceMatchUpId);
  if (
    !producer ||
    producer.matchUpStatus !== DOUBLE_DEFAULT ||
    producer.winningSide ||
    producer.structureId !== feeder.structureId ||
    edges(draw, producer).targetMatchUps?.winnerMatchUp?.matchUpId !== feeder.matchUpId
  )
    return false;
  const target = edges(draw, feeder).targetMatchUps;
  return target?.loserMatchUp?.matchUpId === held.matchUpId && target.loserTargetDrawPosition === position;
}

/** A single-match loser structure ends at this BYE. The other feeder still supports the BYE;
 * the source's loser holds its other position and cannot encounter another award or reservation beyond it. */
function terminalReservationStands(draw: Draw, held: HydratedMatchUp, source: HydratedMatchUp) {
  const structureMatches = draw.inContextDrawMatchUps.filter((m) => m.structureId === held.structureId);
  if (structureMatches.length !== 1 || held.winnerMatchUpId || held.loserMatchUpId) return false;
  const next = edges(draw, held);
  if (
    !next.targetMatchUps ||
    Object.values(next.targetLinks).some(Boolean) ||
    next.targetMatchUps.winnerMatchUp ||
    next.targetMatchUps.loserMatchUp ||
    next.targetMatchUps.byeMatchUp
  )
    return false;
  const empty = held.sides?.find((s) => s.bye && !s.participantId)?.drawPosition;
  if (!empty) return false;
  const seat = getPositionAssignments({
    drawDefinition: draw.drawDefinition,
    structureId: held.structureId,
  }).positionAssignments.find((s) => s.drawPosition === empty);
  if (!seat?.bye || !seat.byeFromPropagation || seat.participantId || seat.qualifier) return false;
  const feeders = draw.inContextDrawMatchUps.filter(
    (m) => m.loserMatchUpId === held.matchUpId && m.matchUpId !== source.matchUpId,
  );
  return (
    feeders.length === 1 &&
    feeders[0].structureId === source.structureId &&
    supportedEmptyLoser(draw, feeders[0], held, empty)
  );
}

export function heldLoserByeClaims({ request, route, view, drawDefinition, direction }: ExitReasonArgs) {
  const { targets, existing, inContextDrawMatchUps } = view;
  const arrival = direction?.loser;
  if (!arrival?.arrives || arrival.bye || arrival.carriedPast || arrival.converged || arrival.exit || arrival.withdrawn)
    return false;
  const scoredRetirement =
    request.matchUpStatus === RETIRED &&
    !request.flags.propagateRetirementAsExit &&
    !view.draw.propagatesByeOnDoubleExit &&
    !!request.score?.sets?.length &&
    bareResultRequest({ ...request, score: undefined });
  const side = request.winningSide;
  if (
    route !== APPLY_VALUES ||
    existing.matchUpStatus !== COMPLETED ||
    !((request.matchUpStatus === WALKOVER && bareResultRequest(request)) || scoredRetirement) ||
    !request.flags.propagateExitStatus ||
    !drawDefinition ||
    !inContextDrawMatchUps ||
    (side !== 1 && side !== 2) ||
    side !== existing.winningSide ||
    targets.loserMatchUpStatus !== BYE ||
    !targets.loserTargetSeat?.opponentBye ||
    view.isTeam ||
    view.line ||
    targets.winnerLink
  )
    return false;
  const source = indexed(view, request.matchUpId);
  const winner = indexed(view, targets.winnerMatchUpId);
  const held = indexed(view, targets.loserMatchUpId);
  const loserId = storedLoserId(view);
  const winnerId = targets.sideParticipantIds[side];
  if (
    !source ||
    !winner ||
    !held ||
    held.winningSide ||
    held.sideExitProvenance ||
    winner.structureId !== source.structureId ||
    held.structureId === source.structureId ||
    !loserId ||
    !winnerId ||
    loserId === winnerId ||
    targets.loserTargetSeat.participantId !== loserId ||
    !holdsPosition(winner, winnerId, sideDrawPosition(view, side)) ||
    !holdsPosition(held, loserId, targets.loserTargetDrawPosition)
  )
    return false;
  if (hasSourceOrigin(inContextDrawMatchUps, source.matchUpId)) return false;
  const draw = { drawDefinition, inContextDrawMatchUps };
  return scoredRetirement
    ? !!targets.loserTargetDrawPosition && consecutiveByeClaims(draw, held, loserId, targets.loserTargetDrawPosition)
    : terminalReservationStands(draw, held, source);
}

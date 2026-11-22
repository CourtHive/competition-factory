import { feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { holdsPosition } from './placementClaims';

// constants and types
import { BYE, COMPLETED, DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

export type ClaimDraw = { drawDefinition: DrawDefinition; inContextDrawMatchUps: HydratedMatchUp[] };

export function claimEdges(draw: ClaimDraw, matchUp: HydratedMatchUp) {
  return positionTargets({ ...draw, matchUpId: matchUp.matchUpId, inContextMatchUp: matchUp, asReferences: true });
}

/** Only advance on the stored and derived winner edge. A separate loser or BYE feed is another obligation. */
function winnerEdge(draw: ClaimDraw, matchUp: HydratedMatchUp) {
  const edges = claimEdges(draw, matchUp);
  if (
    !edges.targetMatchUps ||
    edges.targetLinks.byeTargetLink ||
    edges.targetLinks.loserTargetLink ||
    matchUp.loserMatchUpId
  )
    return undefined;
  const next = edges.targetMatchUps.winnerMatchUp;
  if (next?.matchUpId !== matchUp.winnerMatchUpId) return undefined;
  if (
    next &&
    !edges.targetLinks.winnerTargetLink &&
    (next.structureId !== matchUp.structureId || next.roundNumber !== (matchUp.roundNumber ?? 0) + 1)
  )
    return undefined;
  return edges;
}

function assignment(draw: ClaimDraw, m: HydratedMatchUp, pos: number) {
  return getPositionAssignments({
    drawDefinition: draw.drawDefinition,
    structureId: m.structureId,
  }).positionAssignments.find((seat) => seat.drawPosition === pos);
}

/** The reserved position has a specific feeder, whose actual losing link still lands at this seat. */
function reservedByeStands(draw: ClaimDraw, held: HydratedMatchUp, position: number) {
  return draw.inContextDrawMatchUps.some((feeder) => {
    if (feeder.loserMatchUpId !== held.matchUpId) return false;
    const { targetLinks, targetMatchUps } = claimEdges(draw, feeder);
    if (
      targetMatchUps?.loserMatchUp?.matchUpId !== held.matchUpId ||
      targetMatchUps.loserTargetDrawPosition !== position
    )
      return false;
    const reason = feederSendsNobody({ ...draw, feeder, loserTargetLink: targetLinks?.loserTargetLink });
    // With the double-exit BYE policy off, only a fed position reserves a BYE for a double exit.
    return (
      reason === 'LINK_EXCLUDES' || reason === 'NOBODY_LOST' || (reason === 'DOUBLE_EXIT' && held.hasFedDrawPosition)
    );
  });
}

/** The empty side opposite a held position is either a structural BYE or a supported reservation. */
function byeStands(draw: ClaimDraw, m: HydratedMatchUp, position: number, reservation: boolean) {
  if (m.matchUpStatus !== BYE || m.winningSide) return false;
  const opposite = m.sides?.find((s) => s.drawPosition !== position && s.bye && !s.participantId)?.drawPosition;
  if (!opposite) return false;
  const seat = assignment(draw, m, opposite);
  return (
    !!seat?.bye &&
    !seat.participantId &&
    !seat.qualifier &&
    !!seat.byeFromPropagation === reservation &&
    (!reservation || reservedByeStands(draw, m, opposite))
  );
}

/** The standing award has exactly one origin, on the losing side. Start at that donor's
 * actual losing link. A position number in the donor's structure does not identify the landing. */
function awardOrigin(draw: ClaimDraw, award: HydratedMatchUp, id: string, position: number) {
  const winner = award.sides?.find((s) => s.sideNumber === award.winningSide);
  const loser = award.sides?.find((s) => s.sideNumber !== award.winningSide);
  if (
    !winner ||
    winner.participantId !== id ||
    winner.drawPosition !== position ||
    !loser?.sideNumber ||
    !loser.drawPosition
  )
    return undefined;
  const mark = award.sideExitProvenance?.[loser.sideNumber];
  if (
    !mark?.sourceMatchUpId ||
    mark.matchUpStatus !== award.matchUpStatus ||
    Object.keys(award.sideExitProvenance ?? {}).length !== 1
  )
    return undefined;
  const donor = draw.inContextDrawMatchUps.find((m) => m.matchUpId === mark.sourceMatchUpId);
  if (
    !donor ||
    donor.structureId === award.structureId ||
    donor.sideExitProvenance ||
    donor.matchUpStatus !== mark.previousMatchUpStatus
  )
    return undefined;
  const target = claimEdges(draw, donor).targetMatchUps;
  const landing = target?.loserMatchUp;
  if (
    !landing ||
    landing.matchUpId !== donor.loserMatchUpId ||
    landing.structureId !== award.structureId ||
    target?.loserTargetDrawPosition !== loser.drawPosition
  )
    return undefined;
  return { donor, landing, mark, loserId: loser.participantId, position: loser.drawPosition };
}

type AwardOrigin = NonNullable<ReturnType<typeof awardOrigin>>;

/** Every intervening BYE must carry the same owner's mark on the same position. */
function carriesToAward(draw: ClaimDraw, origin: AwardOrigin, award: HydratedMatchUp, reservations: boolean[]) {
  let current: HydratedMatchUp | undefined = origin.landing;
  for (const reserved of reservations) {
    const carried = current?.sides?.find((s) => s.drawPosition === origin.position);
    if (
      !current ||
      !carried?.sideNumber ||
      carried.participantId !== origin.loserId ||
      !byeStands(draw, current, origin.position, reserved)
    )
      return false;
    const mark = current.sideExitProvenance?.[carried.sideNumber];
    if (
      !mark ||
      mark.sourceMatchUpId !== origin.donor.matchUpId ||
      mark.matchUpStatus !== origin.mark.matchUpStatus ||
      mark.previousMatchUpStatus !== origin.mark.previousMatchUpStatus ||
      Object.keys(current.sideExitProvenance ?? {}).length !== 1
    )
      return false;
    current = winnerEdge(draw, current)?.targetMatchUps?.winnerMatchUp;
  }
  return current?.matchUpId === award.matchUpId;
}

function supportedDoubleExit(draw: ClaimDraw, award: HydratedMatchUp, id: string, position: number) {
  const origin = awardOrigin(draw, award, id, position);
  return (
    !!origin &&
    origin.donor.matchUpStatus === DOUBLE_WALKOVER &&
    !origin.donor.winningSide &&
    !origin.loserId &&
    award.matchUpStatus === WALKOVER &&
    carriesToAward(draw, origin, award, [false, true])
  );
}
export function consecutiveByeClaims(draw: ClaimDraw, first: HydratedMatchUp, id: string, position: number) {
  if (!byeStands(draw, first, position, false)) return false;
  const second = winnerEdge(draw, first)?.targetMatchUps?.winnerMatchUp;
  if (
    !second ||
    second.structureId !== first.structureId ||
    second.sideExitProvenance ||
    !holdsPosition(second, id, position) ||
    !byeStands(draw, second, position, true)
  )
    return false;
  const award = winnerEdge(draw, second)?.targetMatchUps?.winnerMatchUp;
  if (!award || award.structureId !== first.structureId || !supportedDoubleExit(draw, award, id, position))
    return false;
  const edge = winnerEdge(draw, award);
  if (!edge || edge.targetLinks?.winnerTargetLink) return false;
  const next = edge.targetMatchUps?.winnerMatchUp;
  return (
    !next ||
    (next.matchUpStatus === TO_BE_PLAYED &&
      !next.winningSide &&
      !next.sideExitProvenance &&
      holdsPosition(next, id, position))
  );
}

/** A carried single exit belongs to the participant who actually lost the independent donor. */
function supportedSingleExit(draw: ClaimDraw, award: HydratedMatchUp, id: string, position: number) {
  const origin = awardOrigin(draw, award, id, position);
  if (!origin?.loserId || !origin.donor.winningSide || origin.donor.matchUpStatus !== award.matchUpStatus) return false;
  const donorLoser = origin.donor.sides?.find((s) => s.sideNumber !== origin.donor.winningSide);
  return (
    donorLoser?.participantId === origin.loserId &&
    carriesToAward(draw, origin, award, origin.landing.matchUpId === award.matchUpId ? [] : [false])
  );
}

/** A winner returning across a structure link keeps their own assignment in the destination structure. */
function earnedSeat(draw: ClaimDraw, award: HydratedMatchUp, id: string, position: number) {
  const next = winnerEdge(draw, award);
  const matchUp = next?.targetMatchUps?.winnerMatchUp;
  if (!matchUp) return undefined;
  if (matchUp.structureId !== award.structureId) {
    if (next.targetLinks?.winnerTargetLink?.target.structureId !== matchUp.structureId) return undefined;
    const seats = getPositionAssignments({
      drawDefinition: draw.drawDefinition,
      structureId: matchUp.structureId,
    }).positionAssignments.filter((s) => s.participantId === id && !s.bye && !s.qualifier);
    if (seats.length !== 1) return undefined;
    position = seats[0].drawPosition;
  }
  return holdsPosition(matchUp, id, position) ? { matchUp, position } : undefined;
}

export function awardProtectedByPlay(draw: ClaimDraw, first: HydratedMatchUp, id: string, position: number) {
  if (!byeStands(draw, first, position, false)) return false;
  const award = winnerEdge(draw, first)?.targetMatchUps?.winnerMatchUp;
  if (
    !award ||
    award.structureId !== first.structureId ||
    award.matchUpStatus !== DEFAULTED ||
    !supportedSingleExit(draw, award, id, position)
  )
    return false;
  let end = earnedSeat(draw, award, id, position);
  // A produced walkover advances this participant, but only an independently recorded result fixes the award.
  if (end?.matchUp.matchUpStatus === WALKOVER) {
    if (!supportedSingleExit(draw, end.matchUp, id, end.position)) return false;
    end = earnedSeat(draw, end.matchUp, id, end.position);
  }
  const played = end?.matchUp;
  if (
    !played ||
    played.sideExitProvenance ||
    !played.sides?.every((s) => !!s.participantId) ||
    played.sides.length !== 2
  )
    return false;
  return played.matchUpStatus === COMPLETED
    ? !!played.winningSide
    : played.matchUpStatus === DOUBLE_WALKOVER && !played.winningSide;
}

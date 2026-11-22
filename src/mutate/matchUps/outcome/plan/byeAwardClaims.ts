import { feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { holdsPosition } from './placementClaims';

// constants and types
import { BYE, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
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

/** The opposite position receives an exit at its actual loser-link landing and carries the same mark
 * through each BYE to the standing award. A status alone does not identify the owner or the side. */
function supportedAward(draw: ClaimDraw, award: HydratedMatchUp, winnerId: string, position: number) {
  const won = award.sides?.find((s) => s.sideNumber === award.winningSide);
  const lost = award.sides?.find((s) => s.sideNumber !== award.winningSide);
  if (
    !won ||
    won.participantId !== winnerId ||
    won.drawPosition !== position ||
    !lost?.sideNumber ||
    !lost.drawPosition
  )
    return false;
  const entry = award.sideExitProvenance?.[lost.sideNumber];
  if (
    !entry?.sourceMatchUpId ||
    entry.matchUpStatus !== award.matchUpStatus ||
    award.sideExitProvenance?.[won.sideNumber!]
  )
    return false;
  const donor = draw.inContextDrawMatchUps.find((m) => m.matchUpId === entry.sourceMatchUpId);
  if (
    !donor ||
    donor.structureId === award.structureId ||
    donor.sideExitProvenance ||
    donor.matchUpStatus !== entry.previousMatchUpStatus ||
    donor.matchUpStatus !== DOUBLE_WALKOVER ||
    donor.winningSide ||
    lost.participantId ||
    award.matchUpStatus !== WALKOVER
  )
    return false;
  const landing = claimEdges(draw, donor).targetMatchUps;
  let m = landing?.loserMatchUp;
  if (
    !m ||
    m.matchUpId !== donor.loserMatchUpId ||
    m.structureId !== award.structureId ||
    landing?.loserTargetDrawPosition !== lost.drawPosition
  )
    return false;
  // Both sides of this award arrived from two consecutive BYEs on separate arms.
  for (const reserved of [false, true]) {
    const carried = m?.sides?.find((s) => s.drawPosition === lost.drawPosition);
    if (!m || !carried?.sideNumber || carried.participantId || !byeStands(draw, m, lost.drawPosition, reserved))
      return false;
    const mark = m.sideExitProvenance?.[carried.sideNumber];
    if (
      mark?.sourceMatchUpId !== donor.matchUpId ||
      mark.matchUpStatus !== WALKOVER ||
      mark.previousMatchUpStatus !== DOUBLE_WALKOVER ||
      Object.keys(m.sideExitProvenance ?? {}).length !== 1
    )
      return false;
    m = winnerEdge(draw, m)?.targetMatchUps?.winnerMatchUp;
  }
  return m?.matchUpId === award.matchUpId;
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
  if (!award || award.structureId !== first.structureId || !supportedAward(draw, award, id, position)) return false;
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

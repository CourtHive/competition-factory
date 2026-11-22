import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionTargets } from '@Query/matchUp/positionTargets';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/** A participant holds a seat only at the claimed draw position. */
export function holdsPosition(
  matchUp: HydratedMatchUp | undefined,
  participantId?: string,
  position?: number,
): boolean {
  return (
    !!participantId &&
    !!position &&
    !!matchUp?.sides?.some((side) => side.participantId === participantId && side.drawPosition === position)
  );
}

export function hasSourceOrigin(matchUps: HydratedMatchUp[], sourceId: string): boolean {
  return matchUps.some((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some((origin) => origin?.sourceMatchUpId === sourceId),
  );
}

export type ClaimDraw = { drawDefinition: DrawDefinition; inContextDrawMatchUps: HydratedMatchUp[] };

export function claimEdges(draw: ClaimDraw, matchUp: HydratedMatchUp) {
  return positionTargets({ ...draw, matchUpId: matchUp.matchUpId, inContextMatchUp: matchUp, asReferences: true });
}

/** Resolve the assignment in the owning structure separately from the side exposed by a match. */
export function claimAssignment(draw: ClaimDraw, match: HydratedMatchUp, position: number) {
  return getPositionAssignments({
    drawDefinition: draw.drawDefinition,
    structureId: match.structureId,
  }).positionAssignments.find((seat) => seat.drawPosition === position);
}

/** The winner's actual receiving match must agree with the stored edge and its structure link. */
export function winnerClaimEdge(draw: ClaimDraw, match: HydratedMatchUp) {
  const edges = claimEdges(draw, match);
  if (!edges.targetMatchUps) return undefined;
  const next = edges.targetMatchUps.winnerMatchUp;
  if (next?.matchUpId !== match.winnerMatchUpId) return undefined;
  const link = edges.targetLinks.winnerTargetLink;
  if (
    next &&
    (link
      ? link.source.structureId !== match.structureId || link.target.structureId !== next.structureId
      : next.structureId !== match.structureId || next.roundNumber !== (match.roundNumber ?? 0) + 1)
  )
    return undefined;
  return edges;
}

/** Recover the feeder and its first actual landing for a named exit. A double exit can feed either branch. */
export function exitOriginLanding(
  draw: ClaimDraw,
  receiver: HydratedMatchUp,
  side: number,
  branch: 'winner' | 'loser',
) {
  const mark = receiver.sideExitProvenance?.[side];
  if (!mark?.sourceMatchUpId || !mark.matchUpStatus || mark.matchUpStatus !== receiver.matchUpStatus) return undefined;
  const donor = draw.inContextDrawMatchUps.find((match) => match.matchUpId === mark.sourceMatchUpId);
  if (!donor || donor.matchUpStatus !== mark.previousMatchUpStatus) return undefined;
  const edges = claimEdges(draw, donor).targetMatchUps;
  const landing = branch === 'winner' ? edges?.winnerMatchUp : edges?.loserMatchUp;
  if (!landing || landing.matchUpId !== (branch === 'winner' ? donor.winnerMatchUpId : donor.loserMatchUpId))
    return undefined;
  const targetPosition = branch === 'winner' ? edges?.winnerTargetDrawPosition : edges?.loserTargetDrawPosition;
  return { donor, landing, mark, targetPosition };
}

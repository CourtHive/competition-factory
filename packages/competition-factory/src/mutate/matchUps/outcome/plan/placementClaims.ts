import { getExitWinningSide } from '@Mutate/drawDefinitions/matchUpGovernor/getExitWinningSide';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { findStructure } from '@Acquire/findStructure';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import {
  BYE,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
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

/** The mark on the opposite side must still be supplied by the named feeder, including every intervening BYE.
 * A single exit travels with its actual losing participant. A double exit sends a claim without an occupant. */
function supportedExit(draw: ClaimDraw, receiver: HydratedMatchUp, side: number, sourceId: string) {
  const mark = receiver.sideExitProvenance?.[side];
  if (!mark || mark.sourceMatchUpId === sourceId || Object.keys(receiver.sideExitProvenance ?? {}).length !== 1)
    return false;
  const prior = mark.previousMatchUpStatus;
  const double = prior === DOUBLE_DEFAULT || prior === DOUBLE_WALKOVER;
  const effective =
    { [DOUBLE_DEFAULT]: DEFAULTED, [DOUBLE_WALKOVER]: WALKOVER, [RETIRED]: WALKOVER }[prior ?? ''] ?? prior;
  if (effective !== receiver.matchUpStatus) return false;
  const origin = exitOriginLanding(draw, receiver, side, double ? 'winner' : 'loser');
  if (!origin) return false;
  const carrier = receiver.sides?.find((s) => s.sideNumber === side);
  const { donor } = origin;
  if (
    double
      ? donor.winningSide || carrier?.participantId
      : !donor.winningSide ||
        !carrier?.participantId ||
        donor.sides?.find((s) => s.sideNumber === 3 - donor.winningSide!)?.participantId !== carrier.participantId ||
        origin.targetPosition !== carrier.drawPosition
  )
    return false;
  return !!exitOriginRelays(draw, origin, receiver, carrier?.participantId);
}

type ExitOrigin = NonNullable<ReturnType<typeof exitOriginLanding>>;
type OriginRelay = {
  match: HydratedMatchUp;
  markedSide: number;
  edge: NonNullable<ReturnType<typeof winnerClaimEdge>>;
};

/** Trace an existing claim from its actual landing to the receiver. A topology edge alone carries no
 * exit. Each intervening BYE must still name the donor, status and carrier on the marked side. */
export function exitOriginRelays(draw: ClaimDraw, origin: ExitOrigin, receiver: HydratedMatchUp, carrierId?: string) {
  const relays: OriginRelay[] = [];
  let match: HydratedMatchUp | undefined = origin.landing;
  while (match && match.matchUpId !== receiver.matchUpId) {
    const relay = match;
    if (
      relays.some((step) => step.match.matchUpId === relay.matchUpId) ||
      relay.matchUpStatus !== BYE ||
      relay.winningSide
    )
      return undefined;
    const marked = Object.entries(relay.sideExitProvenance ?? {}).find(
      ([key, entry]) =>
        entry?.sourceMatchUpId === origin.donor.matchUpId &&
        entry.matchUpStatus === origin.mark.matchUpStatus &&
        entry.previousMatchUpStatus === origin.mark.previousMatchUpStatus &&
        relay.sides?.find((s) => s.sideNumber === Number(key))?.participantId === carrierId,
    );
    const edge = winnerClaimEdge(draw, relay);
    if (!marked || !edge) return undefined;
    relays.push({ match: relay, markedSide: Number(marked[0]), edge });
    match = edge.targetMatchUps.winnerMatchUp;
  }
  return match ? relays : undefined;
}

export type PlacementClaim = {
  match: HydratedMatchUp;
  positions: number[];
  position: number;
  added: boolean;
  announce: boolean;
  awardedSide?: 1 | 2;
};

/** Earlier placements in this same direction may supply a position to the preceding round.
 * Resolve a lone position against that projected round profile. */
function arrivalSide(
  draw: ClaimDraw,
  path: PlacementClaim[],
  match: HydratedMatchUp,
  positions: number[],
  position: number,
) {
  const bound = getDrawPositionSideNumber({
    drawDefinition: draw.drawDefinition,
    structureId: match.structureId,
    matchUp: { ...match, sides: undefined, drawPositions: positions },
    drawPosition: position,
  });
  if (bound) return bound;
  const projected = new Map(path.slice(0, -1).map((s) => [s.match.matchUpId, s.positions]));
  const feeders = draw.inContextDrawMatchUps.map((m) =>
    projected.has(m.matchUpId) ? { ...m, drawPositions: projected.get(m.matchUpId) } : m,
  );
  return getExitWinningSide({ inContextDrawMatchUps: feeders, matchUpId: match.matchUpId, drawPosition: position });
}

function awardOnArrival(draw: ClaimDraw, path: PlacementClaim[], claim: PlacementClaim, sourceId: string) {
  const { match, positions, position } = claim;
  if (match.matchUpStatus !== WALKOVER && match.matchUpStatus !== DEFAULTED) return false;
  const side = arrivalSide(draw, path, match, positions, position);
  if (
    (side !== 1 && side !== 2) ||
    (match.winningSide && match.winningSide !== side) ||
    !supportedExit(draw, match, 3 - side, sourceId)
  )
    return false;
  const stored = matchUpsOf(
    findStructure({ drawDefinition: draw.drawDefinition, structureId: match.structureId }).structure,
  )?.find((m) => m.matchUpId === match.matchUpId);
  if (!stored) return false;
  if (
    positions.length === 1 &&
    !stored.winnerMatchUpId &&
    !stored.sides?.some((s) => s.sideNumber === side && 'drawPosition' in s && s.drawPosition === position)
  )
    return false;
  claim.awardedSide = side;
  claim.announce = true;
  return true;
}

function crossStructurePosition(draw: ClaimDraw, match: HydratedMatchUp, next: HydratedMatchUp, participantId: string) {
  const source = findStructure({ drawDefinition: draw.drawDefinition, structureId: match.structureId }).structure;
  const seats = getPositionAssignments({
    drawDefinition: draw.drawDefinition,
    structureId: next.structureId,
  }).positionAssignments;
  const own = seats.filter((a) => a.participantId === participantId);
  if (
    next.matchUpStatus !== TO_BE_PLAYED ||
    next.sideExitProvenance ||
    !own[0]?.drawPosition ||
    own.length !== 1 ||
    next.drawPositions?.some((p) =>
      seats.some((a) => a.drawPosition === p && !a.participantId && !a.bye && !a.qualifier),
    ) ||
    source?.seedAssignments?.some((a) => a.participantId === participantId)
  )
    return undefined;
  return own[0].drawPosition;
}

function incomingSeat(
  draw: ClaimDraw,
  match: HydratedMatchUp,
  participantId: string,
  position: number,
  prior: PlacementClaim[],
) {
  if (checkScoreHasValue({ score: match.score }) || match.collectionId || match.matchUpType === 'TEAM')
    return undefined;
  const existing = (
    prior.find((s) => s.match.matchUpId === match.matchUpId)?.positions ??
    match.drawPositions ??
    []
  ).filter((p): p is number => !!p);
  const added = !existing.includes(position);
  const positions = added ? [...existing, position].sort((a, b) => a - b) : existing;
  if (
    positions.length > 2 ||
    match.sides?.some(
      (s) =>
        s.participantId === participantId || (s.drawPosition === position && (s.bye || s.qualifier || s.participantId)),
    )
  )
    return undefined;
  if (positions.some((p) => claimAssignment(draw, match, p)?.byeFromPropagation)) return undefined;
  return { match, positions, position, added, announce: added };
}

/** Follow an entrant from the resolved landing to the first open seat. Both halves of a directive use this walk. */
export function placementPath(
  draw: ClaimDraw,
  first: HydratedMatchUp,
  participantId: string,
  position: number,
  linked: boolean,
  sourceId: string,
  prior: PlacementClaim[] = [],
) {
  const path: PlacementClaim[] = [];
  let match: HydratedMatchUp | undefined = first;
  while (match) {
    if (path.some((s) => s.match.matchUpId === match!.matchUpId)) return undefined;
    const claim: PlacementClaim | undefined = incomingSeat(draw, match, participantId, position, prior);
    if (!claim) return undefined;
    if (linked && (match.roundNumber ?? 0) > (first.roundNumber ?? 0)) claim.announce = true;
    const status = match.matchUpStatus;
    path.push(claim);
    if (status === TO_BE_PLAYED) return match.winningSide || match.sideExitProvenance ? undefined : path;
    if (status === BYE) {
      if (
        match.winningSide ||
        match.sideExitProvenance ||
        !match.sides?.some((s) => s.bye && s.drawPosition !== position)
      )
        return undefined;
    } else if (!awardOnArrival(draw, path, claim, sourceId)) return undefined;
    const edge = winnerClaimEdge(draw, match);
    if (!edge) return undefined;
    const next: HydratedMatchUp | undefined = edge.targetMatchUps.winnerMatchUp;
    if (next && edge.targetLinks.winnerTargetLink) {
      const targetPosition = crossStructurePosition(draw, match, next, participantId);
      if (!targetPosition) return undefined;
      position = targetPosition;
    } else if (next?.drawPositions?.some((p) => p && p !== position && (match!.drawPositions ?? []).includes(p)))
      return undefined;
    match = next;
  }
  return path;
}

/** A newly occupied assignment fills every match that already holds its number. Each such match
 * must be an actual landing of this entrant, including steps that do not rewrite their positions. */
export function accountsForAssignment(
  draw: ClaimDraw,
  path: PlacementClaim[],
  first: HydratedMatchUp,
  position: number,
  participantId: string,
) {
  const seats = getPositionAssignments({
    drawDefinition: draw.drawDefinition,
    structureId: first.structureId,
  }).positionAssignments;
  if (seats.some((seat) => seat.participantId === participantId)) return false;
  return draw.inContextDrawMatchUps.every(
    (match) =>
      match.structureId !== first.structureId ||
      !match.drawPositions?.includes(position) ||
      path.some((step) => step.match.matchUpId === match.matchUpId && step.position === position),
  );
}

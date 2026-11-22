import { feederSendsNobody } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { hasSourceOrigin, holdsPosition } from './placementClaims';
import { producedTarget } from './producedTarget';
import { indexed } from './planShared';

// constants and types
import { BYE, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import type { ExitReasonArgs } from '../types';

const sideOf = (match: HydratedMatchUp, side?: number) => match.sides?.find((seat) => seat.sideNumber === side);
type OccupiedSide = HydratedSide & { participantId: string; drawPosition: number; sideNumber: number };
const occupied = (seat?: HydratedSide): seat is OccupiedSide =>
  !!seat?.participantId &&
  !!seat.drawPosition &&
  (seat.sideNumber === 1 || seat.sideNumber === 2) &&
  !seat.bye &&
  !seat.qualifier;
const pending = (match?: HydratedMatchUp) =>
  match?.matchUpStatus === TO_BE_PLAYED && !match.winningSide && !match.sideExitProvenance;

function targetsOf(args: ExitReasonArgs, match: HydratedMatchUp) {
  if (!args.drawDefinition) return undefined;
  return positionTargets({
    drawDefinition: args.drawDefinition,
    inContextDrawMatchUps: args.view.inContextDrawMatchUps,
    matchUpId: match.matchUpId,
    inContextMatchUp: match,
    asReferences: true,
  });
}

function standingFedBye(args: ExitReasonArgs, match: HydratedMatchUp, seat?: HydratedSide) {
  if (!seat?.bye || seat.participantId || !seat.drawPosition) return false;
  const assignment = getPositionAssignments({
    drawDefinition: args.drawDefinition,
    structureId: match.structureId,
  }).positionAssignments.find((a) => a.drawPosition === seat.drawPosition);
  if (!assignment?.bye || !assignment.byeFromPropagation || assignment.participantId || assignment.qualifier)
    return false;
  // The assignment's marker alone cannot establish who still owes this BYE.
  const inContextDrawMatchUps = args.view.inContextDrawMatchUps;
  if (!args.drawDefinition || !inContextDrawMatchUps) return false;
  const feeders = inContextDrawMatchUps.filter((candidate) => candidate.loserMatchUpId === match.matchUpId);
  if (feeders.length !== 1) return false;
  const [feeder] = feeders;
  if (feeder.matchUpId === args.request.matchUpId) return false;
  const route = targetsOf(args, feeder);
  if (
    route?.targetMatchUps?.loserMatchUp?.matchUpId !== match.matchUpId ||
    route.targetMatchUps.loserTargetDrawPosition !== assignment.drawPosition
  )
    return false;
  const reason = feederSendsNobody({
    feeder,
    drawDefinition: args.drawDefinition,
    inContextDrawMatchUps,
    loserTargetLink: route.targetLinks?.loserTargetLink,
  });
  return reason === 'DOUBLE_EXIT' || reason === 'LINK_EXCLUDES';
}

// A foreign carry stands only on the losing side, fed by that participant losing the named walkover.
function standingAward(args: ExitReasonArgs, match: HydratedMatchUp) {
  const winner = sideOf(match, match.winningSide);
  const loser = sideOf(match, 3 - (match.winningSide ?? 0));
  if (
    match.matchUpStatus !== WALKOVER ||
    !occupied(winner) ||
    !occupied(loser) ||
    winner.participantId === loser.participantId
  )
    return undefined;
  if (!match.sideExitProvenance) return winner;
  const origin = match.sideExitProvenance[loser.sideNumber];
  if (
    Object.keys(match.sideExitProvenance).length !== 1 ||
    origin?.matchUpStatus !== WALKOVER ||
    origin.previousMatchUpStatus !== WALKOVER ||
    origin.sourceMatchUpId === args.request.matchUpId
  )
    return undefined;
  const donor = indexed(args.view, origin.sourceMatchUpId);
  if (
    donor?.matchUpStatus !== WALKOVER ||
    !donor.winningSide ||
    donor.loserMatchUpId !== match.matchUpId ||
    sideOf(donor, 3 - donor.winningSide)?.participantId !== loser.participantId
  )
    return undefined;
  const targets = targetsOf(args, donor)?.targetMatchUps;
  return targets?.loserMatchUp?.matchUpId === match.matchUpId && targets.loserTargetDrawPosition === loser.drawPosition
    ? winner
    : undefined;
}

/** The earned position in the next match. A winner link uses the participant's assignment in the receiving structure. */
function winnerLanding(args: ExitReasonArgs, source: HydratedMatchUp, seat: HydratedSide) {
  const route = targetsOf(args, source);
  const next = route?.targetMatchUps?.winnerMatchUp;
  if (
    !next ||
    next.matchUpId !== source.winnerMatchUpId ||
    route.targetMatchUps?.loserMatchUp ||
    route.targetMatchUps?.byeMatchUp
  )
    return undefined;
  const link = route.targetLinks?.winnerTargetLink;
  let position = seat.drawPosition;
  if (link) {
    if (
      link.source?.structureId !== source.structureId ||
      link.target?.structureId !== next.structureId ||
      next.structureId === source.structureId
    )
      return undefined;
    const assignments = getPositionAssignments({
      drawDefinition: args.drawDefinition,
      structureId: next.structureId,
    }).positionAssignments;
    position = assignments.find((assignment) => assignment.participantId === seat.participantId)?.drawPosition;
  } else if (source.structureId !== next.structureId || next.roundNumber !== (source.roundNumber ?? 0) + 1)
    return undefined;
  return holdsPosition(next, seat.participantId, position) ? next : undefined;
}

// Check the next award as well when the earned position passes a fed BYE or a second walkover.
function awardStands(args: ExitReasonArgs, linked: HydratedMatchUp) {
  const winner = standingAward(args, linked);
  if (!winner || hasSourceOrigin(args.view.inContextDrawMatchUps ?? [], linked.matchUpId)) return false;
  // A carry on the arriving loser would be a withdrawal. Here the opponent carries the foreign exit,
  // or the incoming loser lost a director-entered walkover.
  const loserWon = winner.participantId === args.view.targets.loserTargetSeat?.participantId;
  if (loserWon !== !!linked.sideExitProvenance) return false;
  const next = winnerLanding(args, linked, winner);
  if (!next) return false;
  if (pending(next)) return true;
  if (next.structureId !== linked.structureId) return false;
  if (
    next.matchUpStatus === BYE &&
    !next.winningSide &&
    !next.sideExitProvenance &&
    standingFedBye(
      args,
      next,
      next.sides?.find((side) => side.bye),
    )
  )
    return pending(winnerLanding(args, next, winner));
  const nextWinner = standingAward(args, next);
  return !!nextWinner && pending(winnerLanding(args, next, nextWinner));
}

function producedMark(args: ExitReasonArgs, from: HydratedMatchUp, origin: HydratedMatchUp) {
  const target = producedTarget(args.view, from, DOUBLE_WALKOVER);
  if (!target || from.loserMatchUpId) return undefined;
  const { entry, fedSide } = target;
  const stamp = entry.sideExitProvenance?.[fedSide];
  if (
    Object.keys(entry.sideExitProvenance ?? {}).length !== 1 ||
    stamp?.sourceMatchUpId !== origin.matchUpId ||
    stamp.previousMatchUpStatus !== DOUBLE_WALKOVER ||
    stamp.matchUpStatus !== WALKOVER ||
    sideOf(entry, fedSide)?.drawPosition
  )
    return undefined;
  return target;
}

function doubleWalkoverStands(args: ExitReasonArgs, linked: HydratedMatchUp) {
  if (linked.winningSide || linked.sideExitProvenance) return false;
  const first = producedMark(args, linked, linked);
  if (!first?.feed || first.entry.winningSide) return false;
  // Account for every remaining mark of this double exit: its first landing and, across a fed BYE, its relay.
  const furtherOrigins = (args.view.inContextDrawMatchUps ?? []).filter(
    (match) => match.matchUpId !== first.entry.matchUpId,
  );
  const other = sideOf(first.entry, first.awardedSide);
  if (first.entry.matchUpStatus === WALKOVER) {
    // The fed opponent's vacant position is already reserved in the next round.
    const next = indexed(args.view, first.entry.winnerMatchUpId);
    return (
      !hasSourceOrigin(furtherOrigins, linked.matchUpId) &&
      !!other?.drawPosition &&
      !other.participantId &&
      !other.bye &&
      !other.qualifier &&
      pending(next) &&
      next?.structureId === linked.structureId &&
      next.roundNumber === (first.entry.roundNumber ?? 0) + 1 &&
      !!next.sides?.some((side) => side.drawPosition === other.drawPosition && !side.participantId)
    );
  }
  if (first.entry.matchUpStatus !== BYE || !standingFedBye(args, first.entry, other)) return false;
  const relay = producedMark(args, first.entry, linked);
  if (!relay || relay.entry.matchUpStatus !== WALKOVER || relay.entry.winningSide !== relay.awardedSide) return false;
  if (
    hasSourceOrigin(
      furtherOrigins.filter((match) => match.matchUpId !== relay.entry.matchUpId),
      linked.matchUpId,
    )
  )
    return false;
  const winner = sideOf(relay.entry, relay.awardedSide);
  return occupied(winner) && pending(winnerLanding(args, relay.entry, winner));
}

export function heldLinkedWalkover(args: ExitReasonArgs, linked: HydratedMatchUp): boolean {
  if (linked.matchUpStatus !== WALKOVER && linked.matchUpStatus !== DOUBLE_WALKOVER) return false;
  const one = sideOf(linked, 1);
  const two = sideOf(linked, 2);
  if (indexed(args.view, args.request.matchUpId)?.sideExitProvenance || linked.sides?.length !== 2) return false;
  if (!occupied(one) || !occupied(two) || one.participantId === two.participantId) return false;
  if (linked.matchUpStatus === WALKOVER) return awardStands(args, linked);
  return doubleWalkoverStands(args, linked);
}

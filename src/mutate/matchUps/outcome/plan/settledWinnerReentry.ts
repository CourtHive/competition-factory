import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { bareResultRequest, indexed, sideDrawPosition } from './planShared';
import { positionTargets, type PositionTargets } from '@Query/matchUp/positionTargets';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import { BYE, COMPLETED, DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCHUP, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/matchUpTypes';
import type { PlanArgs } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { DrawDefinition } from '@Types/tournamentTypes';

/** On a completed re-entry directLoser leaves a seated loser alone unless this source has a carry to withdraw. */
function loserStands({ view, direction }: PlanArgs): boolean {
  const { targets } = view;
  const loser = direction?.loser;
  if (!targets.loserMatchUpId) return !targets.loserLink && !loser;
  if (!loser?.arrives || loser.bye || loser.exit || loser.converged || loser.withdrawn || loser.carriedPast)
    return false;
  if (targets.loserTargetSeat?.participantId !== loser.participantId || targets.loserTargetSeat.opponentBye)
    return false;
  const target = indexed(view, loser.matchUpId);
  if (!targets.loserTargetDrawPosition || !target?.drawPositions?.includes(targets.loserTargetDrawPosition))
    return false;
  return !!target.sides?.some(
    (s) => s.participantId === loser.participantId && s.drawPosition === targets.loserTargetDrawPosition,
  );
}

/** An awarded exit or propagated BYE can still owe its connected loser seat a BYE (propagateUnfillableLoserBye). */
function loserSeatSettled(drawDefinition: DrawDefinition, next: PositionTargets): boolean {
  const { loserMatchUp, loserTargetDrawPosition } = next.targetMatchUps;
  if (!loserMatchUp || !next.targetLinks.loserTargetLink) return true;
  const seat = getPositionAssignments({
    drawDefinition,
    structureId: loserMatchUp.structureId,
  }).positionAssignments?.find((assignment) => assignment.drawPosition === loserTargetDrawPosition);
  return !!(seat?.participantId || seat?.bye);
}

type WinnerPath = {
  drawDefinition: DrawDefinition;
  matches: HydratedMatchUp[];
  participantId: string;
  position: number;
  firstReservationSettled: boolean;
};

/** Follow only an already occupied same-structure winner position, strictly forward in round order. */
function winnerPathSettled(path: WinnerPath, first: HydratedMatchUp, source: HydratedMatchUp): boolean {
  const { drawDefinition, matches, participantId, position } = path;
  let previousRound = source.roundNumber;
  let holder: HydratedMatchUp | undefined = first;
  while (holder) {
    if (
      !previousRound ||
      !holder.roundNumber ||
      holder.roundNumber <= previousRound ||
      holder.matchUpType === TEAM ||
      holder.structureId !== source.structureId
    )
      return false;
    const side = holder.sides?.find(
      (candidate) => candidate.participantId === participantId && candidate.drawPosition === position,
    );
    if (!side || !holder.drawPositions?.includes(position)) return false;
    const next = positionTargets({
      drawDefinition,
      inContextDrawMatchUps: matches,
      inContextMatchUp: holder,
      matchUpId: holder.matchUpId,
      asReferences: true,
    });
    if (next.error) return false;
    if (holder.matchUpStatus === TO_BE_PLAYED) {
      // Only an open target can reserve a FIRST_MATCHUP seat; a paired double exit can advance it again.
      const holderId = holder.matchUpId;
      if (
        next.targetLinks.loserTargetLink?.linkCondition === FIRST_MATCHUP &&
        holder.drawPositions.filter(Boolean).length === 2 &&
        !(holder === first && path.firstReservationSettled)
      )
        return false;
      return (
        !holder.winningSide &&
        !holder.sideExitProvenance &&
        !holder.sides?.some((s) => s.bye) &&
        !matches.some(
          (m) =>
            m.structureId === source.structureId &&
            (m.winnerMatchUpId === holderId || m.loserMatchUpId === holderId) &&
            isDoubleExit(m.matchUpStatus),
        )
      );
    }
    const bye = holder.matchUpStatus === BYE && holder.sides?.some((s) => s.bye);
    const award =
      (holder.matchUpStatus === WALKOVER || holder.matchUpStatus === DEFAULTED) &&
      holder.winningSide === side.sideNumber;
    if ((!bye && !award) || !loserSeatSettled(drawDefinition, next)) return false;
    // The qualified repeats cross at most one relay. A second onward placement needs its own proof.
    if (next.targetMatchUps.winnerMatchUp && (holder !== first || next.targetLinks.winnerTargetLink)) return false;
    previousRound = holder.roundNumber;
    holder = next.targetMatchUps.winnerMatchUp;
  }
  return true;
}

/** The writer repeats the source result. All its placements, onward advances and arrival labels already stand. */
export function settledWinnerReentry(args: PlanArgs): boolean {
  const { view, request, write, drawDefinition } = args;
  const { targets, existing } = view;
  const side = request.winningSide;
  if ((side !== 1 && side !== 2) || side !== existing.winningSide || side !== write?.winningSide) return false;
  if (
    existing.matchUpStatus !== COMPLETED ||
    write.matchUpStatus !== COMPLETED ||
    request.matchUpStatus !== undefined ||
    !bareResultRequest(request)
  )
    return false;
  if (
    !drawDefinition ||
    view.isTeam ||
    view.group ||
    view.draw.luckyBased ||
    view.draw.tallied ||
    existing.hasSideExitProvenance ||
    existing.carriedExit ||
    view.line ||
    targets.byeTarget ||
    targets.winnerLink ||
    args.direction?.decider
  )
    return false;
  const source = indexed(view, request.matchUpId);
  const matches = view.inContextDrawMatchUps;
  const structure = drawDefinition.structures?.find((s) => s.structureId === source?.structureId);
  if (!source || !matches || !structure || structure.stage === QUALIFYING || !loserStands(args)) return false;
  // A normal winner arrival already labelled COMPLETED needs no refresh. A BYE-held or carried-past
  // loser origin can require withdrawal even when the nominal landing has no provenance from this source.
  if (
    matches.some((m) =>
      Object.values(m.sideExitProvenance ?? {}).some(
        (e) =>
          e.sourceMatchUpId === source.matchUpId &&
          (m.matchUpId !== targets.winnerMatchUpId ||
            m.structureId === targets.loserStructureId ||
            e.matchUpStatus !== undefined ||
            e.previousMatchUpStatus !== COMPLETED),
      ),
    )
  )
    return false;
  const participantId = targets.sideParticipantIds[side];
  const position = sideDrawPosition(view, side);
  if (!participantId || !position || !source.drawPositions?.includes(position)) return false;
  const first = indexed(view, targets.winnerMatchUpId);
  if (!first) return !targets.winnerMatchUpId && !args.direction?.winner;
  const firstReservationSettled = targets.reservations?.[side]?.kind === 'none';
  return winnerPathSettled(
    { drawDefinition, matches, participantId, position, firstReservationSettled },
    first,
    source,
  );
}

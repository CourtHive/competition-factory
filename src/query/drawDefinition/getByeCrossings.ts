import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionTargets } from '@Query/matchUp/positionTargets';

// constants and types
import type { DrawDefinition, DrawLink, MatchUp } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * A participant beside a BYE at the SOURCE round of a cross-structure WINNER link, who is not yet standing in the
 * link's target: a BYE advancement that has to cross the link.
 *
 * Within a structure a BYE advances its occupant structurally and `BYE_ADVANCEMENT_MISSING` asks whether it did.
 * Across a link nobody advanced them until `crossLinksThroughByes` (the settle at the end of a propagation) did, and
 * on `dev` before #5269 that settle ran only with the `doubleExitPropagateBye` policy off, so a DOUBLE_ELIMINATION
 * Backdraw champion beside a propagated BYE stood there while the Main final waited, and the census scored the
 * draw clean (w2 9100389). This is the one predicate behind both the settle and the
 * `BYE_ADVANCEMENT_MISSING_ACROSS_LINK` inconsistency, so the two cannot disagree about what must cross.
 *
 * The target is asked, not its structure: in a double elimination the Backdraw champion has played in Main before,
 * and re-enters the final on their own Main drawPosition. A decided target is left alone; the engine does not
 * reopen a result to seat a late arrival, and a check that said otherwise would flag every grand final played
 * before a late BYE appeared. A target whose links cannot be read is an error, never "nothing crosses".
 */
export function getByeCrossing({
  inContextDrawMatchUps,
  drawDefinition,
  matchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUp: HydratedMatchUp;
}) {
  if (matchUp.collectionId || !matchUp.winnerMatchUpId) return undefined;
  const occupants = (matchUp.sides ?? []).filter((side) => side.participantId && !side.bye);
  if (occupants.length !== 1 || !matchUpHoldsBye({ drawDefinition, matchUp })) return undefined;

  const targetData = positionTargets({
    matchUpId: matchUp.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  // a crossing whose links cannot be read is refused, never read as "nothing crosses"
  if (targetData.error) return targetData;
  const { targetMatchUps, targetLinks } = targetData;
  const winnerMatchUp = targetMatchUps?.winnerMatchUp;
  const winnerTargetLink = targetLinks?.winnerTargetLink;
  if (!winnerMatchUp || !winnerTargetLink || winnerMatchUp.structureId === matchUp.structureId) return undefined;
  if (winnerMatchUp.winningSide) return undefined;

  const [{ participantId, drawPosition }] = occupants;
  // asked of the TARGET and not of its structure: in a double elimination they have played there before
  if (winnerMatchUp.sides?.some((side) => side.participantId === participantId)) return undefined;

  return {
    winnerMatchUpDrawPositionIndex: targetMatchUps.winnerMatchUpDrawPositionIndex,
    winnerTargetLink,
    winnerMatchUp,
    participantId,
    drawPosition,
    matchUp,
  };
}

export type ByeCrossing = {
  winnerMatchUpDrawPositionIndex: number | undefined;
  drawPosition: number | undefined;
  winnerMatchUp: HydratedMatchUp;
  winnerTargetLink: DrawLink;
  matchUp: HydratedMatchUp;
  participantId: string;
};

/** Every BYE crossing the draw owes, in matchUp order. A source whose links cannot be read is left out here. */
export function getByeCrossings({
  inContextDrawMatchUps,
  drawDefinition,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
}): ByeCrossing[] {
  return inContextDrawMatchUps
    .map((matchUp) => getByeCrossing({ inContextDrawMatchUps, drawDefinition, matchUp }))
    .filter(
      (crossing): crossing is ByeCrossing & { participantId: string } =>
        !!crossing && !('error' in crossing) && !!crossing.participantId,
    );
}

/**
 * Does this matchUp hold a draw BYE on one of its positions?
 *
 * Read from the positionAssignment, never from `matchUpStatus` — the same rule
 * `conditionallyAdvanceDrawPosition` and `removeDoubleExit.targetDrawPositionIsBye` follow, because
 * by the time a cascade reaches here the status may already have been overwritten.
 */
export function matchUpHoldsBye({
  drawDefinition,
  matchUp,
}: {
  drawDefinition: DrawDefinition;
  matchUp: Pick<MatchUp, 'drawPositions'> & { structureId?: string };
}): boolean {
  const drawPositions = (matchUp?.drawPositions ?? []).filter(Boolean);
  if (!drawPositions.length) return false;
  const { positionAssignments } = getPositionAssignments({ structureId: matchUp.structureId, drawDefinition });
  return !!positionAssignments?.some((assignment) => assignment.bye && drawPositions.includes(assignment.drawPosition));
}

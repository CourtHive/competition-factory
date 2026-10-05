import { carriedExitStatus, getSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { releaseAdvancedDrawPositionAcrossLinks } from './releaseLinkedWinnerAdvancement';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { getDrawPositionSides } from '@Query/matchUps/getDrawPositionSides';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { isAnyExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { LOSER } from '@Constants/drawDefinitionConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

const UNDECIDED_STATUSES = new Set<string | undefined>([undefined, TO_BE_PLAYED, BYE]);

type RemoveOnwardLoserPlacementsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  participantId: string;
  structureId: string;
};

/**
 * Is this placement INERT for the participant holding it?
 *
 * Inert means nothing they did is recorded here: every matchUp holding the position is undecided,
 * or records an exit whose provenance shows THEIR side was carried in rather than earned, or an exit
 * they WIN only because the OTHER side's exit was carried in.
 *
 * The third is the second seen from across the matchUp. A carried exit's `winningSide` belongs to the
 * exit, not to whoever sits opposite it. It is the shape `withdrawProducedExits` leaves behind, and it
 * runs FIRST (see `removeDirectedParticipants`): a convergence of two carried exits loses this
 * participant's provenance and re-derives as a WALKOVER the participant "wins" against the exit that
 * remains. Census seed 9000352 (OLYMPIC 16), three steps: two East walkovers carried their losers
 * through West into the same South matchUp, and clearing one left that loser in South as the
 * unadvanced winner of the other's walkover (WINNER_NOT_ADVANCED).
 */
function placementIsInert({
  structureMatchUps,
  drawDefinition,
  drawPosition,
  structureId,
}: {
  drawDefinition: DrawDefinition;
  structureMatchUps: any[];
  drawPosition: number;
  structureId: string;
}) {
  return structureMatchUps
    .filter((matchUp) => matchUp.drawPositions?.includes(drawPosition))
    .every((matchUp) => {
      if (!matchUp.winningSide && UNDECIDED_STATUSES.has(matchUp.matchUpStatus)) return true;
      if (!isAnyExit(matchUp.matchUpStatus)) return false;
      const sideNumber = getDrawPositionSideNumber({ drawDefinition, structureId, matchUp, drawPosition });
      if (!sideNumber) return false;
      const provenance = getSideExitProvenance({ matchUp });
      if (provenance?.[sideNumber]) return true;
      const opposingSide = 3 - sideNumber;
      return matchUp.winningSide === sideNumber && !!carriedExitStatus(provenance?.[opposingSide]);
    });
}

/** The side a drawPosition holds — by order with both present, structurally with one (never by index). */
function getDrawPositionSideNumber({ drawDefinition, structureId, matchUp, drawPosition }: any): number | undefined {
  const drawPositions = matchUp.drawPositions ?? [];
  // `indexOf` as a side number — valid only because drawPositions are stored ascending, and only while
  // both are present. See the canonical statement in `getOrderedDrawPositions`.
  if (drawPositions.filter(Boolean).length === 2) return drawPositions.indexOf(drawPosition) + 1;
  return getDrawPositionSides({ drawDefinition, structureId, matchUp })?.find(
    (side) => side.drawPosition === drawPosition,
  )?.sideNumber;
}

/** Empty the participant's inert assignments in one structure, and release the positions they held. */
function releaseInertPlacements({
  targetStructureId,
  tournamentRecord,
  drawDefinition,
  participantId,
  matchUpsMap,
  structure,
}: any): number {
  const structureMatchUps = matchUpsMap?.mappedMatchUps?.[targetStructureId]?.matchUps ?? [];
  const { positionAssignments } = structureAssignedDrawPositions({ structure });

  const clearedDrawPositions: number[] = [];
  for (const assignment of positionAssignments ?? []) {
    if (assignment.participantId !== participantId) continue;
    const drawPosition = assignment.drawPosition;
    if (!placementIsInert({ structureMatchUps, drawDefinition, drawPosition, structureId: targetStructureId }))
      continue;
    delete assignment.participantId;
    clearedDrawPositions.push(assignment.drawPosition);
  }

  for (const drawPosition of clearedDrawPositions) {
    const holdingRoundNumbers = structureMatchUps
      .filter((matchUp) => matchUp.drawPositions?.includes(drawPosition))
      .map((matchUp) => matchUp.roundNumber)
      .filter((roundNumber): roundNumber is number => roundNumber !== undefined);
    if (!holdingRoundNumbers.length) continue;

    releaseAdvancedDrawPositionAcrossLinks({
      fromRoundNumber: Math.min(...holdingRoundNumbers),
      structureId: targetStructureId,
      tournamentRecord,
      drawDefinition,
      drawPosition,
      matchUpsMap,
    });
  }

  return clearedDrawPositions.length;
}

/**
 * Follow a removed loser down the rest of the feed chain, as far as the chain is INERT for them.
 *
 * `removeDirectedLoser` empties the participant's assignment in the structure they were fed INTO,
 * which is correct but exactly ONE link deep. A participant who then lost in that structure has
 * already been fed onward by `directLoser`, and that further placement is not theirs to keep once
 * the result that put them in the source structure no longer stands — they cannot have lost a
 * matchUp in a structure they are no longer in.
 *
 * Only a draw whose LOSER-link target is itself a LOSER-link SOURCE can reach this. Measured across
 * all ten sweep draw types at drawSizes 8/16/32, that is COMPASS (East->West->South, East->North)
 * and OLYMPIC (East->West->South) and no other; every other type unwinds completely in one link,
 * which is why eight draw types exercising this code constantly could never expose the gap.
 *
 * WHY A DEEPER UNWIND IS SAFE HERE, WHEN A BLANKET ONE IS NOT.
 *
 * `setMatchUpState` only reaches `removeDirectedParticipants` after `isActiveDownstream` — which
 * recurses across links without bound — has reported nothing active below. The engine trades a deep
 * unwind for a deep GUARD, and one link is sufficient BY CONSTRUCTION whenever that guard is right.
 * So this walk does not need a re-propagation pass to pair with it, because there is nothing live to
 * re-propagate; propagation in this engine is event-driven and no such pass exists.
 *
 * A blanket cascade was built first and measured WORSE: a re-score removes the participant and
 * re-directs them within the SAME mutation, so removing everything downstream destroys state the
 * re-direction never restores. It closed 4 seeds and opened 2, including a `DROPPED_PROGRESSION` for
 * a participant still sitting in the source structure. The scope below is what makes the difference.
 *
 * WHAT COUNTS AS INERT, and why a recorded exit can still be:
 *
 *  - an UNDECIDED matchUp, plainly; or
 *  - a matchUp recording an exit whose provenance shows THIS participant's side was CARRIED there.
 *
 * The second is the case that looks wrong and is not. A propagated exit's `winningSide` was written
 * by the cascade BEFORE any participant arrived — it belongs to the exit, not to the occupant — so
 * withdrawing the occupant returns the matchUp to the pending propagated exit it was, still waiting
 * for the next arrival. Leaving the status, the winningSide and the provenance in place is therefore
 * the correct resting state, not residue. Measured over the 600-seed window: of 22 decided
 * placements holding a stranded participant, 21 carry provenance for that participant's side.
 *
 * Anything else — a result the participant EARNED in the downstream structure — is left strictly
 * alone, and the walk stops on that branch. Removing such a participant would leave a recorded
 * result unresolvable; that was measured as `WINNER_NOT_ADVANCED` when an earlier, looser version of
 * this rule released them.
 */
export function removeOnwardLoserPlacements({
  tournamentRecord,
  drawDefinition,
  participantId,
  matchUpsMap,
  structureId,
}: RemoveOnwardLoserPlacementsArgs) {
  if (!participantId) return { ...SUCCESS, releasedCount: 0 };

  const resolvedMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const visited = new Set<string>([structureId]);
  const pending = [structureId];
  let releasedCount = 0;

  while (pending.length) {
    const sourceStructureId = pending.shift() as string;
    const onwardTargetIds = (drawDefinition.links ?? [])
      .filter((link) => link?.linkType === LOSER && link.source?.structureId === sourceStructureId)
      .map((link) => link.target?.structureId)
      .filter(
        (targetStructureId): targetStructureId is string => !!targetStructureId && !visited.has(targetStructureId),
      );

    for (const targetStructureId of onwardTargetIds) {
      visited.add(targetStructureId);
      const { structure } = findStructure({ drawDefinition, structureId: targetStructureId });
      if (!structure) continue;

      const released = releaseInertPlacements({
        matchUpsMap: resolvedMap,
        targetStructureId,
        tournamentRecord,
        drawDefinition,
        participantId,
        structure,
      });

      // Nothing released means the participant either never reached this structure or earned a
      // result in it; either way there is nothing of theirs beyond it that this removal produced.
      if (!released) continue;
      releasedCount += released;
      pending.push(targetStructureId);
    }
  }

  return { ...SUCCESS, releasedCount };
}

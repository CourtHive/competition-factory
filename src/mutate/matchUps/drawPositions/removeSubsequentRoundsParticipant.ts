import { carriedExitStatus, participatesInExitCascade } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { recordSourceSideProvenance } from '@Mutate/drawDefinitions/matchUpGovernor/recordSourceSideProvenance';
import { rekeySideFacts } from '@Mutate/matchUps/drawPositions/setMatchUpDrawPositions';
import { releaseLinkedWinnerAdvancement } from './releaseLinkedWinnerAdvancement';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import {
  DrawDefinition,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  PositionAssignment,
  Tournament,
} from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type RemoveSubsequentDrawPositionArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  dualMatchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  sourceMatchUpStatus?: MatchUpStatusUnion;
  targetDrawPosition: number;
  matchUpsMap?: MatchUpsMap;
  sourceMatchUpId?: string;
  roundNumber: number;
  structureId: string;
  event?: Event;
};
export function removeSubsequentRoundsParticipant({
  inContextDrawMatchUps,
  sourceMatchUpStatus,
  targetDrawPosition,
  tournamentRecord,
  sourceMatchUpId,
  drawDefinition,
  structureId,
  dualMatchUp,
  roundNumber,
  matchUpsMap,
  event,
}: RemoveSubsequentDrawPositionArgs) {
  const { structure } = findStructure({ drawDefinition, structureId });
  if (structure?.structureType === CONTAINER) return { ...SUCCESS };

  matchUpsMap = matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const mappedMatchUps = matchUpsMap?.mappedMatchUps ?? {};
  const matchUps = mappedMatchUps[structureId].matchUps;

  const { initialRoundNumber } = getInitialRoundNumber({
    drawPosition: targetDrawPosition,
    matchUps,
  });

  const relevantMatchUps = matchUps?.filter(
    (matchUp: any) =>
      matchUp.roundNumber >= roundNumber &&
      matchUp.roundNumber !== initialRoundNumber &&
      matchUp.drawPositions?.includes(targetDrawPosition),
  );

  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structureId,
  });

  for (const matchUp of relevantMatchUps ?? []) {
    removeDrawPosition({
      structureId,
      inContextDrawMatchUps,
      sourceMatchUpStatus,
      positionAssignments,
      targetDrawPosition,
      tournamentRecord,
      sourceMatchUpId,
      drawDefinition,
      dualMatchUp,
      matchUpsMap,
      roundNumber,
      matchUp,
      event,
    });

    // what this matchUp carried across a WINNER link comes back with it
    releaseLinkedWinnerAdvancement({
      roundNumber: matchUp.roundNumber as number,
      drawPosition: targetDrawPosition,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      structureId,
      event,
    });
  }

  return { ...SUCCESS };
}

function removeDrawPosition({
  inContextDrawMatchUps,
  structureId,
  positionAssignments,
  sourceMatchUpStatus,
  targetDrawPosition,
  tournamentRecord,
  sourceMatchUpId,
  drawDefinition,
  dualMatchUp,
  matchUpsMap,
  roundNumber,
  matchUp,
  event,
}: {
  positionAssignments: PositionAssignment[];
  inContextDrawMatchUps?: HydratedMatchUp[];
  dualMatchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  sourceMatchUpStatus?: MatchUpStatusUnion;
  targetDrawPosition: number;
  matchUpsMap: MatchUpsMap;
  sourceMatchUpId?: string;
  roundNumber: number;
  structureId: string;
  matchUp: MatchUp;
  event?: Event;
}) {
  const stack = 'removeSubsequentDrawPosition';

  if (dualMatchUp) {
    // remove propagated lineUp
    const inContextMatchUp = inContextDrawMatchUps?.find(({ matchUpId }) => matchUp.matchUpId === matchUpId);
    const targetSideNumber = inContextMatchUp?.sides?.find(
      (side) => side.drawPosition === targetDrawPosition,
    )?.sideNumber;
    const targetSide = matchUp.sides?.find((side) => side.sideNumber === targetSideNumber);
    if (targetSide) {
      delete targetSide.lineUp;
    }
  }

  // Removal, not substitution: preserves ascending order. See `getOrderedDrawPositions`. The participant who stays
  // can change side as the other seat empties, and what is recorded by side goes with them (`setMatchUpDrawPositions`).
  const remaining = (matchUp.drawPositions ?? [])
    .map((drawPosition) => (drawPosition === targetDrawPosition ? undefined : drawPosition))
    .filter((drawPosition): drawPosition is number => !!drawPosition);
  rekeySideFacts({ drawPositions: remaining, drawDefinition, structureId, matchUp });
  matchUp.drawPositions = remaining;
  const matchUpAssignments = positionAssignments.filter(({ drawPosition }) =>
    matchUp.drawPositions?.includes(drawPosition),
  );
  const matchUpContainsBye = matchUpAssignments.filter((assignment) => assignment.bye).length;

  matchUp.matchUpStatus =
    (matchUpContainsBye && BYE) || (isExit(matchUp.matchUpStatus) && matchUp.matchUpStatus) || TO_BE_PLAYED;

  /**
   * The result goes with the participant. Every time, not only on an exit.
   *
   * This matchUp has just lost one of the two participants whose contest the result described, and
   * the three statuses the line above can produce — BYE, a carried exit, TO_BE_PLAYED — are all
   * undecided. None of them can carry a winner.
   *
   * The clear was scoped to `isExit` (for the DOUBLE_WALKOVER-produced WALKOVER), so a COMPLETED
   * matchUp collapsing to TO_BE_PLAYED kept its `winningSide` and its score: measured as
   * `Consolation|4|1` left TO_BE_PLAYED with winningSide 1 over sides `[null, participant]`. The
   * score goes for the same reason — a set score over a contest that no longer has two sides is the
   * same residue wearing a different field.
   */
  //
  // EXCEPT the award of a CARRIED exit to the seat that just emptied. A carried exit points `winningSide` at its
  // opponent's side even while that side is empty: the outcome is known, and whoever arrives wins it
  // (exit-propagation.md, "The pending propagated exit"; only a PRODUCED exit waits for an arrival). Clearing it
  // here left a carry that no relabel or withdrawal at its source could recognise as its own (`onlyThisCarry`
  // asks for exactly that award), so the source's change never reached it (census w2 9100478, FICSF 8/5).
  matchUp.winningSide = carriedAwardToEmptySeat({ matchUp, positionAssignments, drawDefinition, structureId });
  matchUp.score = undefined;

  // A LEGACY-ARRAY GATE ON A NATIVE WRITE. Kept: removing it is measured wrong — see the long note at the
  // twin site in `drawPositionPlacement`, where the pair of removals costs 58 tests across 5 files and the
  // measurement names what the truthy array stands in for ("this matchUp is already part of the exit
  // cascade"), why it matters (provenance is PRESENCE-read — P19), and what a replacement has to test.
  //
  // ONLY THE SOURCE'S OWN TARGET. The loop above reaches every later round holding the position; the source feeds
  // just the first of them (`roundNumber`, the winner matchUp's round). Stamping the rest recorded an origin from a
  // matchUp that does not feed them, on a side computed for a different matchUp (factory-a7's probe, 2026-10-06:
  // 20 such stamps over the census, e.g. w1 9000273 FRLC `Main|3|1` "from" `Main|1|3`).
  if (matchUp.roundNumber === roundNumber && participatesInExitCascade({ matchUp })) {
    recordSourceSideProvenance({
      inContextDrawMatchUps: inContextDrawMatchUps ?? [],
      drawPositions: matchUp.drawPositions,
      sourceMatchUpStatus,
      sourceMatchUpId,
      drawDefinition,
      matchUpsMap,
      matchUp,
    });
  }

  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    context: `${stack}-${targetDrawPosition}`,
    drawDefinition,
    matchUp,
    event,
  });

  return { ...SUCCESS };
}

/** the side a carried exit standing here awards, when the participant who stays is the one who carried it in */
function carriedAwardToEmptySeat({ matchUp, positionAssignments, drawDefinition, structureId }): number | undefined {
  if (!isExit(matchUp.matchUpStatus)) return undefined;
  const occupied = (matchUp.drawPositions ?? []).filter((drawPosition) =>
    positionAssignments.some((assignment) => assignment.drawPosition === drawPosition && assignment.participantId),
  );
  if (occupied.length !== 1) return undefined;
  const carrierSide = getDrawPositionSideNumber({
    matchUp: { ...matchUp, sides: undefined },
    drawPosition: occupied[0],
    drawDefinition,
    structureId,
  });
  const entry = carrierSide ? matchUp.sideExitProvenance?.[carrierSide] : undefined;
  if (!carriedExitStatus(entry) || isDoubleExit(entry?.previousMatchUpStatus)) return undefined;
  return carrierSide === 1 ? 2 : 1;
}

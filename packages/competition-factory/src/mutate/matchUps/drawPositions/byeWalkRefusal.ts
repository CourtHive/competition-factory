import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { drawPositionFilled } from './drawPositionFilled';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  DRAW_POSITION_ASSIGNED,
  INVALID_MATCHUP,
  LUCKY_DRAW_BYE_LIMIT,
  MISSING_DRAW_POSITION,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type ByeWalk = {
  inContextDrawMatchUps: HydratedMatchUp[];
  provisionalPositioning?: boolean;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
};

/**
 * THE REFUSALS OF A BYE PLACEMENT THE WRITER WALKS, FOUND BEFORE IT WRITES. A public placement whose walk meets an exit
 * the planner does not plan through is placed by `assignDrawPositionBye`'s writer, which can return a refusal only
 * after it has written: a loser seat it must make a BYE (the seat a BYE's matchUp sends its loser to, in another
 * structure) is already filled, missing or in a structure the draw does not hold; a target the draw's links do
 * not resolve; or a forward edge that resolves backward because the record repeats a matchUpId, which it throws.
 *
 * Asked here first, of the record as it stands, along the same chain of placements the writer would make: the seat's
 * furthest matchUp, the loser seat it owes a BYE when the BYE is that matchUp's loser (a first-round target, or a fed
 * one entered at that round), and so on from each of those. Only the refusals the writer RETURNS are asked: those met
 * inside the winner's advance it ignores, and the call succeeds. The seat itself was asked already (the planner asks it
 * in the writer's order before it reports the walk unplanned).
 *
 * Returns the refusal the writer would return, or the draw's map and in-context matchUps (the planner's hydration of
 * the record as it stands, where it hands one over), which the writer then reads instead of building them again. A repeated matchUpId is thrown, as the writer throws it.
 */
export function byeWalkRefusal({
  inContextDrawMatchUps: hydrated,
  provisionalPositioning,
  drawDefinition,
  drawPosition,
  structureId,
}: {
  inContextDrawMatchUps?: HydratedMatchUp[];
  provisionalPositioning?: boolean;
  drawDefinition: DrawDefinition;
  drawPosition: number;
  structureId?: string;
}): { refusal?: ResultType; matchUpsMap: MatchUpsMap; inContextDrawMatchUps: HydratedMatchUp[] } {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps =
    hydrated ?? getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  refuseRepeatedMatchUpIds(inContextDrawMatchUps);
  const walk: ByeWalk = { inContextDrawMatchUps, provisionalPositioning, drawDefinition, matchUpsMap };
  const refusal = placementRefusal(walk, { structureId, drawPosition, seatAsked: true });
  return { refusal: refusal.error ? refusal : undefined, matchUpsMap, inContextDrawMatchUps };
}

/**
 * `refuseNonForwardAdvance` throws where a winner target's id resolves to an earlier round of the same structure, which
 * with unique matchUpIds never happens (`f016ExitWalkResidual.test.ts`, the census of every draw type). A record whose
 * ids repeat is refused before the walk, with the same code.
 */
function refuseRepeatedMatchUpIds(matchUps: HydratedMatchUp[]) {
  const seen = new Set<string>();
  for (const { matchUpId } of matchUps) {
    if (seen.has(matchUpId))
      throw new Error(
        `${INVALID_MATCHUP.code}: matchUpId ${matchUpId} is repeated; the record's matchUpIds are not unique`,
      );
    seen.add(matchUpId);
  }
}

/** a BYE placed at `drawPosition` of `structureId`, as the writer's `assignDrawPositionBye` refuses it */
function placementRefusal(
  walk: ByeWalk,
  { structureId, drawPosition, seatAsked }: { structureId?: string; drawPosition: number; seatAsked?: boolean },
): ResultType {
  const { drawDefinition } = walk;
  const stack = 'assignDrawPositionBye';
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  if (!seatAsked) {
    const { positionAssignments } = getPositionAssignments({ structure });
    const assignment = positionAssignments?.find((candidate) => candidate.drawPosition === drawPosition);
    // a seat that is a BYE already is the writer's success, and its walk stops there
    if (assignment?.bye) return {};
    if (
      isLuckyBasedDraw(drawDefinition.drawType) &&
      positionAssignments?.some((candidate) => candidate.bye && candidate.drawPosition !== drawPosition)
    )
      return decorateResult({ result: { error: LUCKY_DRAW_BYE_LIMIT }, stack });
    // DRAW_POSITION_ACTIVE is not asked again here: it is answered already. A seat is active when its matchUp, or one
    // its result feeds, is active (`getStructureDrawPositionProfiles`: active matchUps and every matchUp upstream of
    // them). Every seat this walk reaches is fed by a link from the matchUp holding the placed seat, so whatever makes
    // it active makes the placed seat active too, and the placed seat was asked first and found not active.
    if (assignment && drawPositionFilled(assignment).filled)
      return decorateResult({ result: { error: DRAW_POSITION_ASSIGNED }, stack });
  }

  if (structure.structureType === CONTAINER) return {};

  const { matchUps } = getAllStructureMatchUps({
    provisionalPositioning: walk.provisionalPositioning,
    matchUpFilters: { isCollectionMatchUp: false },
    matchUpsMap: walk.matchUpsMap,
    drawDefinition,
    structure,
  });
  const { roundProfile, roundMatchUps } = getRoundMatchUps({ matchUps });
  const roundNumber =
    roundProfile &&
    Object.keys(roundProfile)
      .map((key) => Number.parseInt(key))
      .reverse()
      .find((key) => roundProfile[key].drawPositions?.includes(drawPosition));
  const matchUp = roundNumber
    ? roundMatchUps?.[roundNumber].find(({ drawPositions }) => drawPositions?.includes(drawPosition))
    : undefined;
  if (!matchUp) return {};

  const advanced = matchUp.drawPositions?.find((position) => position !== drawPosition);
  if (advanced) return advanceRefusal(walk, matchUp, structure.structureId);
  if (roundNumber && roundNumber > (getInitialRoundNumber({ drawPosition, matchUps }).initialRoundNumber ?? 0))
    return loserTargetRefusal(walk, matchUp);
  return {};
}

/** `advanceDrawPosition` from the BYE's matchUp: its targets, and the loser seat a first-round loser link owes a BYE */
function advanceRefusal(walk: ByeWalk, matchUp: MatchUp, structureId: string): ResultType {
  const targetData = positionTargets({
    inContextDrawMatchUps: walk.inContextDrawMatchUps,
    drawDefinition: walk.drawDefinition,
    matchUpId: matchUp.matchUpId,
  });
  if (targetData.error) return decorateResult({ result: targetData, stack: 'advanceDrawPosition' });
  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, loserTargetDrawPosition },
  } = targetData;
  // the BYE is this matchUp's losing position; a fed target's refusal is not returned here
  if (
    loserTargetLink &&
    loserMatchUp &&
    loserTargetDrawPosition !== undefined &&
    loserMatchUp.structureId !== structureId &&
    loserMatchUp.roundNumber === 1
  )
    return placementRefusal(walk, {
      structureId: loserTargetLink.target.structureId,
      drawPosition: loserTargetDrawPosition,
    });
  return {};
}

/** `assignByeToLoserTarget`: a BYE alone in `matchUp` owes its loser seat a BYE */
function loserTargetRefusal(walk: ByeWalk, matchUp: MatchUp): ResultType {
  const { drawDefinition } = walk;
  const targetData = positionTargets({
    inContextDrawMatchUps: walk.inContextDrawMatchUps,
    matchUpId: matchUp.matchUpId,
    drawDefinition,
  });
  if (targetData.error) return decorateResult({ result: targetData, stack: 'assignByeToLoserTarget' });
  const {
    targetLinks: { loserTargetLink },
    targetMatchUps: { loserMatchUp, loserTargetDrawPosition },
  } = targetData;
  if (!loserTargetLink || !loserMatchUp?.drawPositions || loserTargetDrawPosition === undefined) return {};

  if (loserMatchUp.feedRound) {
    // `assignFedDrawPositionBye`: placed only where the seat enters at the loser matchUp's round
    const loserStructureMatchUps = walk.matchUpsMap.mappedMatchUps[loserMatchUp.structureId]?.matchUps;
    const { initialRoundNumber } = getInitialRoundNumber({
      drawPosition: loserTargetDrawPosition,
      matchUps: loserStructureMatchUps,
    });
    if (initialRoundNumber !== loserMatchUp.roundNumber) return {};
    return placementRefusal(walk, {
      structureId: loserTargetLink.target.structureId,
      drawPosition: loserTargetDrawPosition,
    });
  }

  const targetDrawPosition = getSideDrawPosition({
    structureId: loserTargetLink.target.structureId,
    sideNumber: 2 - ((matchUp.roundPosition as number) % 2),
    matchUp: loserMatchUp,
    drawDefinition,
  });
  if (!targetDrawPosition)
    return decorateResult({ result: { error: MISSING_DRAW_POSITION }, stack: 'advanceByeToLoserMatchUp' });
  return placementRefusal(walk, { structureId: loserTargetLink.target.structureId, drawPosition: targetDrawPosition });
}

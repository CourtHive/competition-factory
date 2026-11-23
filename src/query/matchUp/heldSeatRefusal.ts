import { resolveTieScoreSource } from '@Query/hierarchical/tieFormats/resolveTieScoreSource';
import { drawPositionAssignmentRefusal } from '@Query/drawDefinition/drawPositionAssignmentRefusal';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { getInitialRoundNumber } from '@Query/matchUps/getInitialRoundNumber';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import {
  DRAW_POSITION_ASSIGNED,
  DRAW_POSITION_OCCUPIED,
  MISSING_DRAW_POSITIONS,
  type ErrorType,
} from '@Constants/errorConditionConstants';
import { BYE, COMPLETED, DEFAULTED, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { positionTargets, type PositionTargetsResult } from '@Query/matchUp/positionTargets';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import type {
  DrawDefinition,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  PositionAssignment,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';

const CARRIED_EXITS_WITH_RETIRED = new Set<string>([RETIRED, WALKOVER, DEFAULTED]);
const CARRIED_EXITS = new Set<string>([WALKOVER, DEFAULTED]);
const COMPLETED_OR_BYE = new Set<string>([COMPLETED, BYE]);

/**
 * A WINNER OR A LOSER WITH NO SEAT TO TAKE IS REFUSED BEFORE THE FIRST WRITE (CA, 2026-10-22: an error leaves the record
 * unchanged, and no mutation relies on rollback; record soak 2026-11-18, class D4).
 *
 * `directParticipants` writes the matchUp's result (`attemptToModifyScore`) and then places the winner and the loser.
 * Two placements refuse where a seat is held by somebody else, after that write:
 *
 *  - THE WINNER (`assignMatchUpDrawPosition`, DRAW_POSITION_ASSIGNED): both drawPositions of the next matchUp of the
 *    structure are held by other positions, and neither is a propagated BYE standing where it never earned a place
 *    (`yieldSquattingPropagatedBye`, which gives the seat up);
 *  - THE LOSER (`directLoser`'s last branch, DRAW_POSITION_OCCUPIED): the loser has a participant who does not stand in
 *    the loser link's matchUp, the link is not a first-match feed (which places the loser or a BYE), and none of that
 *    matchUp's seats is free or a propagated BYE.
 *
 * Converted records can hold either shape (a stored winner who is not the side that advanced, a consolation seated
 * in another order). A TEAM dual can also be undecided with a held winner or consolation seat. Its first award directs
 * its named winner and loser. The same questions are asked here of the same values, on the route that reaches the placement: a
 * winner named, on a matchUp with drawPositions outside lines, ad hoc and lucky draws; not beneath an
 * active downstream (nothing is directed there), not a swap, and not over a stored double exit (its unwind runs first).
 * A stored winner that the call replaces is taken back first, so the seat they hold counts as free, as does the seat the
 * new winner holds in the loser's matchUp.
 */
export type HeldSeatParams = {
  readonly matchUp: Readonly<
    Pick<
      MatchUp,
      | 'drawPositions'
      | 'collectionId'
      | 'winningSide'
      | 'matchUpStatus'
      | 'matchUpType'
      | 'tieMatchUps'
      | 'roundPosition'
    >
  >;
  readonly inContextMatchUp?: Readonly<Pick<HydratedMatchUp, 'sides'>>;
  readonly drawDefinition?: Readonly<DrawDefinition>;
  readonly targetData?: PositionTargetsResult;
  readonly structure?: Readonly<Structure>;
  readonly inContextDrawMatchUps?: HydratedMatchUp[];
  readonly propagateRetirementAsExit?: boolean;
  readonly allowChangePropagation?: boolean;
  readonly propagateExitStatus?: boolean;
  readonly matchUpStatus?: MatchUpStatusUnion;
  readonly tournamentRecord?: Tournament;
  readonly projectedWinningSide?: number;
  readonly autoCalcDisabled?: boolean;
  readonly winningSide?: number;
  readonly event?: Event;
};

export type HeldSeat = { error: ErrorType; context: Record<string, unknown> };

export function heldSeatRefusal({
  activeDownstream,
  params,
}: {
  params: HeldSeatParams;
  activeDownstream: boolean;
}): HeldSeat | undefined {
  const { matchUp, structure, drawDefinition, targetData, winningSide, inContextMatchUp } = params;
  if (matchUp.collectionId) return lineSeatRefusal(params, activeDownstream);
  if (!drawDefinition || !structure || !targetData?.targetMatchUps) return undefined;
  if (winningSide !== 1 && winningSide !== 2) return undefined;
  if (!matchUp.drawPositions || isAdHoc({ structure })) return undefined;
  // An undecided dual awarded a winner directs both sides, through the same placements as singles.
  if (matchUp.winningSide && (matchUp.tieMatchUps || isMatchUpEventType(TEAM)(matchUp.matchUpType))) return undefined;
  if (isLuckyBasedDraw(drawDefinition.drawType)) return undefined;
  // a stored double exit is unwound first: what it produced in the next matchUp is taken back, so the winner's question
  // cannot be asked of the draw as it stands. The loser's can: the BYE it placed on their seat is a propagated one
  const unwound = isDoubleExit(matchUp.matchUpStatus);
  const stored = matchUp.winningSide;
  const sideParticipantId = (sideNumber: number) =>
    inContextMatchUp?.sides?.find((side) => side?.sideNumber === sideNumber)?.participantId;
  // beneath an active downstream nobody is directed; the same winner entered as an exit still carries it on from where
  // the loser stands (`relabelWithoutDirection`), and only the carry's levels are asked
  if (stored && activeDownstream)
    return stored === winningSide ? relabelledCarrySeat(params, sideParticipantId(3 - winningSide)) : undefined;
  const replacesPriorWinner = !!stored && stored !== winningSide;
  if (replacesPriorWinner && params.allowChangePropagation && matchUp.roundPosition) return undefined;
  // an exit awarded to an empty side advances nobody (`winnerSlotEmpty`)
  const winnerPlaced = !(isExit(params.matchUpStatus) && !sideParticipantId(winningSide));
  // bound by side, as `directParticipants` binds them
  const positioned = { ...matchUp, ...targetData.matchUp };
  const sidePosition = (sideNumber: number) =>
    getSideDrawPosition({ drawDefinition, structureId: structure.structureId, matchUp: positioned, sideNumber });

  return (
    (winnerPlaced && !unwound
      ? heldWinnerSeat({ targetData, structure, drawDefinition, replacesPriorWinner, sidePosition, winningSide })
      : undefined) ??
    heldLoserSeat({
      winnerParticipantId: replacesPriorWinner ? sideParticipantId(winningSide) : undefined,
      loserDrawPosition: sidePosition(3 - winningSide),
      inContextDrawMatchUps: carriesExit(params) ? params.inContextDrawMatchUps : undefined,
      tournamentRecord: params.tournamentRecord,
      event: params.event,
      drawDefinition,
      targetData,
      structure,
    })
  );
}

function lineSeatRefusal(params: HeldSeatParams, activeDownstream: boolean): HeldSeat | undefined {
  const { matchUp, drawDefinition, structure, targetData, winningSide } = params;
  if (!drawDefinition || !structure || !targetData?.targetMatchUps || activeDownstream) return undefined;
  if (winningSide) return handoverLoserAssignment(params);
  const projected = params.projectedWinningSide;
  const dual = targetData.matchUp;
  if (!dual || !projected || projected === dual.winningSide || params.autoCalcDisabled || isAdHoc({ structure }))
    return undefined;
  if (isDoubleExit(matchUp.matchUpStatus) && matchUp.matchUpStatus === params.matchUpStatus && !matchUp.winningSide)
    return undefined;
  if (resolveTieScoreSource({ drawDefinition, structure, matchUp: dual, event: params.event }) === 'REPORTED')
    return undefined;
  const { winnerMatchUp, loserMatchUp, byeMatchUp } = targetData.targetMatchUps;
  if (!winnerMatchUp && !loserMatchUp && !byeMatchUp) return undefined;
  if (!dual.drawPositions) return { error: MISSING_DRAW_POSITIONS, context: { matchUpId: dual.matchUpId } };
  const sidePosition = (sideNumber: number) =>
    getSideDrawPosition({ drawDefinition, structureId: structure.structureId, matchUp: dual, sideNumber });
  return (
    heldWinnerSeat({
      targetData,
      structure,
      drawDefinition,
      replacesPriorWinner: !!dual.winningSide,
      sidePosition,
      winningSide: projected,
    }) ??
    handoverLoserAssignment(params) ??
    heldLoserSeat({
      targetData,
      structure,
      drawDefinition,
      tournamentRecord: params.tournamentRecord,
      event: params.event,
      winnerParticipantId: dual.winningSide
        ? dual.sides?.find((side) => side.sideNumber === projected)?.participantId
        : undefined,
      loserDrawPosition: sidePosition(3 - projected),
    })
  );
}

/** A line can reverse its dual's declared winner. Removing the previous direction frees
 * the old loser's assignment. It does not free the new loser's seat elsewhere in the backdraw. */
function handoverLoserAssignment(params: HeldSeatParams): HeldSeat | undefined {
  const { projectedWinningSide, autoCalcDisabled, targetData, drawDefinition, event, tournamentRecord } = params;
  const dual = targetData?.matchUp;
  if (autoCalcDisabled || !dual?.winningSide || !projectedWinningSide || projectedWinningSide === dual.winningSide)
    return undefined;

  const target = targetData?.targetMatchUps?.loserMatchUp;
  const link = targetData?.targetLinks?.loserTargetLink;
  if (!drawDefinition || !target || !link || target.structureId === dual.structureId) return undefined;
  if (link.linkCondition === FIRST_MATCHUP && target.roundNumber === 2) return undefined;
  if (target.matchUpId === targetData?.targetMatchUps?.winnerMatchUp?.matchUpId) return undefined;
  const participant = (side: number) => dual.sides?.find((s) => s.sideNumber === side)?.participantId;
  const loserId = participant(dual.winningSide);
  if (!loserId) return undefined;
  const assignments =
    structureAssignedDrawPositions({ drawDefinition, structureId: target.structureId }).positionAssignments ?? [];
  const standing = assignments.find((seat) => seat.participantId === loserId);
  const positions = target.drawPositions ?? [];
  if (!standing || positions.includes(standing.drawPosition)) return undefined;

  const removed = participant(projectedWinningSide);
  const available = assignments
    .filter(
      (seat) =>
        positions.includes(seat.drawPosition) &&
        ((!!removed && seat.participantId === removed) ||
          (!seat.participantId && !seat.bye && !seat.qualifier) ||
          (seat.bye && seat.byeFromPropagation)),
    )
    .map((seat) => seat.drawPosition);
  const directed = targetData?.targetMatchUps?.loserTargetDrawPosition;
  const destination =
    target.roundNumber === 1 && directed && available.includes(directed) ? directed : Math.min(...available);
  if (!Number.isFinite(destination)) return undefined;
  const refusal = drawPositionAssignmentRefusal({
    drawDefinition,
    tournamentRecord,
    event,
    structureId: target.structureId,
    participantId: loserId,
    drawPosition: destination,
  });
  return refusal?.error ? { error: refusal.error as ErrorType, context: { drawPosition: destination } } : undefined;
}

function heldWinnerSeat({
  drawDefinition,
  sidePosition,
  winningSide,
  targetData,
  structure,
  replacesPriorWinner,
}: {
  targetData: PositionTargetsResult;
  sidePosition: (sideNumber: number) => number | undefined;
  drawDefinition: Readonly<DrawDefinition>;
  structure: Readonly<Structure>;
  winningSide: number;
  replacesPriorWinner: boolean;
}): HeldSeat | undefined {
  const winnerMatchUp = targetData.targetMatchUps?.winnerMatchUp;
  // across a link the placement's refusals are logged, not returned (`directWinnerViaLink`)
  if (!winnerMatchUp || targetData.targetLinks?.winnerTargetLink) return undefined;
  const drawPosition = sidePosition(winningSide);
  if (!drawPosition) return undefined;
  const previous = replacesPriorWinner ? sidePosition(3 - winningSide) : undefined;
  const held = (winnerMatchUp.drawPositions ?? []).filter((position) => !!position && position !== previous);
  if (held.length < 2 || new Set(held).has(drawPosition)) return undefined;

  // a propagated BYE standing in a later round than its own gives the seat up (`yieldSquattingPropagatedBye`)
  const { positionAssignments } = structureAssignedDrawPositions({
    drawDefinition: drawDefinition as DrawDefinition,
    structure: structure as Structure,
  });
  const structureMatchUps = matchUpsOf(structure as Structure) ?? [];
  const yields = held.some((candidate) => {
    const assignment = positionAssignments?.find((a: PositionAssignment) => a.drawPosition === candidate);
    if (!assignment?.bye || !assignment.byeFromPropagation) return false;
    const { initialRoundNumber } = getInitialRoundNumber({ drawPosition: candidate, matchUps: structureMatchUps });
    return !!initialRoundNumber && !!winnerMatchUp.roundNumber && winnerMatchUp.roundNumber > initialRoundNumber;
  });
  return yields ? undefined : { error: DRAW_POSITION_ASSIGNED, context: { drawPosition } };
}

function relabelledCarrySeat(params: HeldSeatParams, participantId?: string): HeldSeat | undefined {
  const { drawDefinition, inContextDrawMatchUps, targetData } = params;
  const landing = targetData?.targetMatchUps?.loserMatchUp;
  if (!drawDefinition || !inContextDrawMatchUps || !landing || !participantId || !carriesExit(params)) return undefined;
  return heldCarrySeat({ drawDefinition, inContextDrawMatchUps, participantId, landing, standingOnly: true });
}

/** the call's exit follows its loser on: a WALKOVER or DEFAULTED under `propagateExitStatus`, a RETIRED by policy */
function carriesExit(params: HeldSeatParams): boolean {
  const carried = params.propagateRetirementAsExit ? CARRIED_EXITS_WITH_RETIRED : CARRIED_EXITS;
  return !!params.propagateExitStatus && carried.has(params.matchUpStatus as string);
}

function heldLoserSeat({
  winnerParticipantId,
  inContextDrawMatchUps,
  loserDrawPosition,
  tournamentRecord,
  drawDefinition,
  targetData,
  structure,
  event,
}: {
  targetData: PositionTargetsResult;
  drawDefinition: Readonly<DrawDefinition>;
  structure: Readonly<Structure>;
  inContextDrawMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  winnerParticipantId?: string;
  loserDrawPosition?: number;
  event?: Event;
}): HeldSeat | undefined {
  const { loserMatchUp, winnerMatchUp } = targetData.targetMatchUps ?? {};
  const loserTargetLink = targetData.targetLinks?.loserTargetLink;
  if (!loserMatchUp || !loserTargetLink || !loserDrawPosition) return undefined;
  // a matchUp of the source's own structure, or the one the winner is sent to (a decider): the winner's placement
  // changes what the loser's reads, and the question cannot be asked before it
  if (loserMatchUp.structureId === structure.structureId || loserMatchUp.matchUpId === winnerMatchUp?.matchUpId)
    return undefined;
  const targetDrawPositions = new Set((loserMatchUp.drawPositions ?? []) as number[]);
  const fedFirstMatch = loserTargetLink.linkCondition === FIRST_MATCHUP && loserMatchUp.roundNumber === 2;

  const assignmentsOf = (structureId: string) =>
    structureAssignedDrawPositions({ drawDefinition: drawDefinition as DrawDefinition, structureId })
      .positionAssignments ?? [];
  const loserParticipantId = assignmentsOf(loserTargetLink.source.structureId).find(
    (assignment: PositionAssignment) => assignment.drawPosition === loserDrawPosition,
  )?.participantId;
  if (!loserParticipantId) return undefined;
  const seats = assignmentsOf(loserTargetLink.target.structureId).filter((assignment: PositionAssignment) =>
    targetDrawPositions.has(assignment.drawPosition),
  );
  // the levels a carried exit goes on to. A stored winner the call replaces is taken back out of every seat first
  const carried = () =>
    inContextDrawMatchUps
      ? heldCarrySeat({
          participantId: loserParticipantId,
          landing: loserMatchUp,
          inContextDrawMatchUps,
          winnerParticipantId,
          drawDefinition,
        })
      : undefined;
  // the loser already stands there (a result entered again as an exit): nobody is seated, and the exit is carried on
  // from where they stand while that matchUp holds no result (`relabelLoserExit`)
  if (seats.some((assignment: PositionAssignment) => assignment.participantId === loserParticipantId)) return carried();
  if (fedFirstMatch)
    return winnerParticipantId
      ? undefined
      : fedSeatRefusal({ loserParticipantId, loserDrawPosition, tournamentRecord, drawDefinition, targetData, event });
  const available = seats.some(
    (assignment: PositionAssignment) =>
      (!assignment.participantId && !assignment.bye && !assignment.qualifier) ||
      (!!assignment.bye && !!assignment.byeFromPropagation) ||
      // the winner the call names held this seat as the stored loser, and is taken back out of it first
      (!!winnerParticipantId && assignment.participantId === winnerParticipantId),
  );
  if (available) return carried();
  return {
    context: { loserDrawPosition, loserTargetLink, targetDrawPositionIsUnfilled: false },
    error: DRAW_POSITION_OCCUPIED,
  };
}

/**
 * A FIRST-MATCH FEED seats the loser on the feed's lower position if this was their first match, and a BYE there
 * otherwise. The seat's own refusals (`drawPositionAssignmentRefusal`, which `assignDrawPosition` asks first: a position
 * the structure holds no assignment for, a participant seated elsewhere in it) were met after the result was written.
 * The wins are counted only where one of them would be raised.
 */
function fedSeatRefusal({
  loserParticipantId,
  loserDrawPosition,
  tournamentRecord,
  drawDefinition,
  targetData,
  event,
}: {
  targetData: PositionTargetsResult;
  drawDefinition: Readonly<DrawDefinition>;
  tournamentRecord?: Tournament;
  loserParticipantId: string;
  loserDrawPosition: number;
  event?: Event;
}): HeldSeat | undefined {
  const link = targetData.targetLinks?.loserTargetLink;
  const fed = (targetData.targetMatchUps?.loserMatchUp?.drawPositions ?? []).filter(Boolean) as number[];
  if (!link || !fed.length) return undefined;
  const drawPosition = Math.min(...fed);
  const refusal = drawPositionAssignmentRefusal({
    drawDefinition: drawDefinition as DrawDefinition,
    structureId: link.target.structureId,
    participantId: loserParticipantId,
    tournamentRecord,
    drawPosition,
    event,
  });
  if (!refusal?.error) return undefined;
  const { structure } = findStructure({
    drawDefinition: drawDefinition as DrawDefinition,
    structureId: link.source.structureId,
  });
  const wins = getDrawPositionWinCount({
    sourceMatchUps: teamLevelMatchUps(
      getAllStructureMatchUps({
        drawDefinition: drawDefinition as DrawDefinition,
        afterRecoveryTimes: false,
        inContext: true,
        structure,
        event,
      }).matchUps,
    ),
    drawPosition: loserDrawPosition,
  });
  return wins === 0 ? { error: refusal.error as ErrorType, context: { drawPosition } } : undefined;
}

/**
 * A CARRIED EXIT GOES ON WITH ITS LOSER. The matchUp the loser lands in is awarded to its other side, and the loser is
 * sent across that matchUp's own loser link, level after level (`propagateExitFrom`, a COMPASS East to West to South).
 * Each level is a call of its own made after the source's result is written and its loser seated, so a seat held at a
 * later level was refused over all of that (record soak 2026-11-18: 13 calls on COMPASS draws seated in another order
 * than their links describe). The same seat question is asked of each level the carry reaches, before anything is
 * written. A loser who already stands in the structure carries from the furthest matchUp they hold there: past a BYE
 * they went on, and the carry follows them. The walk stops where v1's carry does something else than cross a link: a
 * matchUp that is decided, a BYE beside a seat nobody holds yet, a first-match feed, a link back into the same
 * structure, or the bound on levels.
 */
const CARRY_LEVELS = 10;

function heldCarrySeat({
  inContextDrawMatchUps,
  winnerParticipantId,
  drawDefinition,
  participantId,
  standingOnly,
  landing,
}: {
  drawDefinition: Readonly<DrawDefinition>;
  inContextDrawMatchUps: HydratedMatchUp[];
  winnerParticipantId?: string;
  /** nobody is seated by the call: the carry starts only where the loser already stands */
  standingOnly?: boolean;
  landing: HydratedMatchUp;
  participantId: string;
}): HeldSeat | undefined {
  const assignmentsOf = (structureId: string) =>
    structureAssignedDrawPositions({ drawDefinition: drawDefinition as DrawDefinition, structureId })
      .positionAssignments ?? [];
  const seatsOf = (matchUp: HydratedMatchUp) => {
    const positions = new Set((matchUp.drawPositions ?? []) as number[]);
    return assignmentsOf(matchUp.structureId).filter((a: PositionAssignment) => positions.has(a.drawPosition));
  };
  // where the loser stands furthest in the landing's structure, if they stand in it
  const standing = inContextDrawMatchUps
    .filter(
      (matchUp) =>
        matchUp.structureId === landing.structureId &&
        !matchUp.collectionId &&
        !!matchUp.sides?.some((side) => side?.participantId === participantId),
    )
    .sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0))[0];
  if (standingOnly && !standing) return undefined;
  let current = standing ?? landing;
  for (let level = 0; level < CARRY_LEVELS; level += 1) {
    // a result of its own stops the carry; a matchUp merely abandoned, suspended or under way holds none
    const status = current.matchUpStatus ?? TO_BE_PLAYED;
    if (current.winningSide || isAnyExit(status) || COMPLETED_OR_BYE.has(status)) return undefined;
    // a BYE beside a seat the loser has yet to take: they would go on past it, and where to is not read here
    const seated = current === standing;
    if (!seated && seatsOf(current).some((seat: PositionAssignment) => seat.bye)) return undefined;
    const targets = positionTargets({
      drawDefinition: drawDefinition as DrawDefinition,
      matchUpId: current.matchUpId,
      inContextDrawMatchUps,
    });
    const next = targets.targetMatchUps?.loserMatchUp;
    const link = targets.targetLinks?.loserTargetLink;
    if (!next || !link || next.structureId === current.structureId) return undefined;
    if (link.linkCondition === FIRST_MATCHUP && next.roundNumber === 2) return undefined;
    const free = seatsOf(next).some(
      (seat: PositionAssignment) =>
        (!seat.participantId && !seat.bye && !seat.qualifier) ||
        (!!seat.bye && !!seat.byeFromPropagation) ||
        (!!winnerParticipantId && seat.participantId === winnerParticipantId),
    );
    if (!free)
      return { context: { loserTargetLink: link, targetDrawPositionIsUnfilled: false }, error: DRAW_POSITION_OCCUPIED };
    current = next;
  }
  return undefined;
}

import { tiebreakPointsWarnings } from '@Scoring/analysis/validateScore';
import {
  accountsForAssignment,
  claimAssignment,
  holdsPosition,
  winnerClaimEdge,
  placementPath,
  type PlacementClaim,
} from './placementClaims';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { withPendingCarry, type CarrySource } from './pendingCarry';
import { buildSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import {
  APPLY_VALUES,
  bareResultRequest,
  sideDrawPosition,
  indexed,
  changesWinner,
  linkedWinnerPosition,
  deciderSeats,
  positionsOf,
  pendingProducedArrival,
  reentersWinner,
  removesDirection,
  standingAwardArrival,
  producedLoserArrival,
  awardedProducedArrival,
  standingWinnerAward,
  storedLoserId,
} from './planShared';

// constants and types
import type { PlanArgs, DirectionPlan, MatchUpWrite, OutcomeView, Route } from '../types';
import type { MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';

/**
 * The builders of the plain shapes (S3, S4): the winner's placement, a swap's relabel, a cleared result's removal, and
 * the plain loser arrival.
 */

/**
 * The winner's position joining the next matchUp, which v1 stores ascending. For a changed winner the old winner's
 * position comes out as the new one goes in, and the matchUp's score with it (v1's `removeSubsequentRoundsParticipant`).
 */
export function winnerPlacementOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  winner?: DirectionPlan['winner'],
): OutcomeOp[] {
  const target = view.targets.winner;
  const position = write.winningSide ? view.targets.sideDrawPositions[write.winningSide as 1 | 2] : undefined;
  if (!winner || !position || !target) return [];
  if (target.structureId !== view.targets.source.structureId) return linkedWinnerOps(view, route, write, winner);
  const award = route === 'winner' ? pendingProducedArrival(view, write) : undefined;
  if (award) return pendingProducedArrivalOps(write, award);
  const standing = route === 'winner' ? standingWinnerAward(view, write) : undefined;
  if (standing) return standingWinnerAwardOps(standing);
  const replaced = changesWinner(view, route, write)
    ? view.targets.sideDrawPositions[view.existing.winningSide as 1 | 2]
    : undefined;
  const kept = target.drawPositions.filter((candidate) => candidate !== replaced);
  const drawPositions = [...new Set([...kept, position])].sort((a, b) => a - b);
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: winner.matchUpId,
      drawPositions,
      ...(replaced ? { removedDrawPosition: replaced, placedDrawPosition: position } : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: winner.matchUpId },
  ];
}

/** BATCH 1 (A1): the winner's own position in the structure across the link joins the matchUp there */
function linkedWinnerOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  winner: NonNullable<DirectionPlan['winner']>,
): OutcomeOp[] {
  const position = route === 'winner' ? linkedWinnerPosition(view, write) : undefined;
  if (!position || !view.targets.winner) return [];
  const drawPositions = [...new Set([...view.targets.winner.drawPositions, position])].sort((a, b) => a - b);
  return [
    { op: 'setMatchUpDrawPositions', matchUpId: winner.matchUpId, drawPositions },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: winner.matchUpId },
  ];
}

/**
 * A swap's relabel in later rounds of its structure, each matchUp stamped: written before the result, as v1 announces
 * the path (`exchangePathPositions`) and then the score
 */
export function swapOps(view: OutcomeView, route: Route | undefined): OutcomeOp[] {
  const swap = view.targets.swap;
  const structureId = view.targets.source.structureId;
  if (route !== 'swap' || !swap || !structureId) return [];
  return [
    ...swap.pathMatchUpIds.flatMap((matchUpId): OutcomeOp[] => [
      { op: 'exchangeDrawPositions', matchUpId, structureId, positionA: swap.positionA, positionB: swap.positionB },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ]),
    ...(swap.relabels ?? []).map((relabel): OutcomeOp => ({ op: 'relabelPosition', ...relabel })),
  ];
}

/** the direction whose placements are written: none for a re-entered winner, who stands where the first entry put them */
export function placedDirection(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  direction?: DirectionPlan,
): DirectionPlan | undefined {
  return reentersWinner(view, route, write) || route === 'swap' || route === APPLY_VALUES ? undefined : direction;
}

/**
 * A cleared result's winner taken back out of the next matchUp, whose positions v1's writer then normalises, and its
 * loser out of the seat a link placed them on. Not a changed winner's: its winner's position is replaced in the one write
 * that places the new winner (`winnerPlacementOps`), and its loser is taken back first (`replacedLoserOps`).
 */
/**
 * A changed winner's old loser, taken back out of the seat the link placed them on before anything else is written: v1
 * removes the old direction (`removeDirectedParticipants`) before it writes the new result and directs it, so the old
 * loser's matchUp is announced first and the result and the new placements after it
 */
export function replacedLoserOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  matchUpStatus?: MatchUpStatusUnion,
  carry?: CarrySource,
): OutcomeOp[] {
  return changesWinner(view, route, write)
    ? withPendingCarry(view, carry, (rederived) => removedLoserOps(view, matchUpStatus, rederived))
    : [];
}

export function removedOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  matchUpStatus?: MatchUpStatusUnion,
  carry?: CarrySource,
): OutcomeOp[] {
  if (changesWinner(view, route, write) || !removesDirection(view, route, write)) return [];
  // A cleared final (no winner matchUp) takes back its loser's fed seat alone (C17, decision 5 of the refactor status):
  // `removalOps` emits no winner leg for it. The guard that returned nothing here until then left the fed seat
  // occupied, which is what the settle check abstained on.
  return withPendingCarry(view, carry, (rederived) => removalOps(view, matchUpStatus, rederived));
}

/**
 * S4's removal of the stored result's direction, whatever the route: the winner's position out of the next
 * matchUp, if there is one, then the loser's seat. The two reasons in front of it (`removalReason` on a cleared result,
 * `resultRemovalReason` on a result turned double exit) stay apart; this is only what they both take back. A final's
 * loser leg alone is emitted on both routes (the cleared route since C17).
 */
export function removalOps(view: OutcomeView, matchUpStatus?: MatchUpStatusUnion, rederived?: boolean): OutcomeOp[] {
  const { targets, existing } = view;
  const position = targets.sideDrawPositions[existing.winningSide as 1 | 2];
  const winner: OutcomeOp[] =
    position && targets.winner && targets.winnerMatchUpId
      ? [
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: targets.winnerMatchUpId,
            drawPositions: targets.winner.drawPositions.filter((candidate) => candidate !== position),
            removedDrawPosition: position,
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: targets.winnerMatchUpId },
        ]
      : [];
  return [...winner, ...removedLoserOps(view, matchUpStatus, rederived)];
}

/**
 * the loser's seat across the link emptied, and their matchUp's codes re-derived (`[]`) where it stored none. v1's
 * `removeDirectedLoser` re-derives them only when the call names a status (its `sourceMatchUpStatus`): a clear that names
 * none leaves them as they are. An equal empty array is still reallocated, quietly; a changed side record announces
 * the matchUp and stamps its structure. `rederived`: a withdrawal ahead of it already wrote the codes `[]` (C28), so the
 * rewrite is the quiet one.
 */
export function removedLoserOps(
  view: OutcomeView,
  matchUpStatus?: MatchUpStatusUnion,
  rederived?: boolean,
): OutcomeOp[] {
  const { loserMatchUpId, loserStructureId, loserTargetDrawPosition, loserMatchUpRecord } = view.targets;
  const participantId = storedLoserId(view);
  if (!loserMatchUpId || !loserStructureId || !loserTargetDrawPosition || !participantId) return [];
  const storedCodes = rederived ? [] : loserMatchUpRecord?.matchUpStatusCodes;
  const codes: OutcomeOp[] =
    !matchUpStatus || storedCodes?.length
      ? []
      : [
          {
            op: 'setMatchUpStatusCodes',
            matchUpId: loserMatchUpId,
            matchUpStatusCodes: [],
            ...(storedCodes ? { quiet: true as const } : {}),
          },
          ...(!storedCodes
            ? [
                { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: loserMatchUpId },
                { op: 'stampUpdatedAt' as const, entity: 'structure' as const, id: loserStructureId },
              ]
            : []),
        ];
  return [
    { op: 'clearPosition', structureId: loserStructureId, drawPosition: loserTargetDrawPosition, participantId },
    ...codes,
  ];
}

/** a plain loser arrival: the loser on the seat the link feeds */
export function arrivalOps(view: OutcomeView, loser?: DirectionPlan['loser']): OutcomeOp[] {
  const { loserStructureId, loserTargetDrawPosition } = view.targets;
  return loser?.arrives && loserStructureId && loserTargetDrawPosition
    ? [
        {
          op: 'assignPosition',
          announcesAssignments: false,
          structureId: loserStructureId,
          drawPosition: loserTargetDrawPosition,
          participantId: loser.participantId,
        },
      ]
    : [];
}

/** The structure assignment is announced only after the participant's nested arrivals have returned. */
export const arrivalReturnOps = (arrival: OutcomeOp[]): OutcomeOp[] =>
  arrival.flatMap((op) =>
    op.op === 'assignPosition' ? [{ op: 'announcePositionAssignments', structureId: op.structureId }] : [],
  );

/**
 * C18: the loser placed on a seat whose matchUp holds a carried exit awarded to it takes the award: v1's
 * `assignDrawPosition` writes the matchUp back as it stands with its codes re-derived and announces it as the
 * assignment (`applyPositionToMatchUp`, `participantArrivesAtExit`), then sends the position on into the next matchUp
 * (`advanceIntoWinnerMatchUp`), announced and stamped as any placement; from the structure's last round nobody goes
 * on. Nothing where the seat's matchUp holds no such award (the plain arrival, `arrivalOps`, is all there is).
 */
export function awardedArrivalOps(view: OutcomeView, loser?: DirectionPlan['loser']): OutcomeOp[] {
  const award = standingAwardArrival(view, loser);
  if (!award) return [];
  const { entry, drawPosition, onward } = award;
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: entry.matchUpId,
      drawPositions: positionsOf(entry),
      placedDrawPosition: drawPosition,
      rederivesCodes: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ...(onward
      ? ([
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            placedDrawPosition: drawPosition,
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
        ] as OutcomeOp[])
      : []),
  ];
}

/**
 * C20: the winner's position added to the next matchUp, whose standing award is theirs: written back as it stands with
 * its codes re-derived and announced as the assignment (`applyPositionToMatchUp`), then the position sent on
 * (`advanceIntoWinnerMatchUp`), announced and stamped as any placement; from the structure's last round nobody goes on
 */
function standingWinnerAwardOps({
  entry,
  drawPosition,
  drawPositions,
  onward,
}: NonNullable<ReturnType<typeof standingWinnerAward>>): OutcomeOp[] {
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: entry.matchUpId,
      drawPositions,
      placedDrawPosition: drawPosition,
      rederivesCodes: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ...(onward
      ? ([
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            placedDrawPosition: drawPosition,
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
        ] as OutcomeOp[])
      : []),
  ];
}

/** C19: applyPositionToMatchUp's award, source origin, placement and advanceIntoWinnerMatchUp. */
function pendingProducedArrivalOps(
  write: MatchUpWrite,
  {
    entry,
    matchUpStatus,
    drawPosition,
    side,
    onward,
    sourceMatchUpId,
  }: NonNullable<ReturnType<typeof pendingProducedArrival>>,
): OutcomeOp[] {
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: write.matchUpStatus,
    sourceMatchUpId,
    sourceSideNumber: side,
  });
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: entry.matchUpId,
      matchUpStatus,
      winningSide: side,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcedAs: 'assignMatchUpDrawPosition',
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: entry.matchUpId, provenance }] : []),
    { op: 'setMatchUpDrawPositions', matchUpId: entry.matchUpId, drawPositions: [drawPosition] },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ...(onward
      ? ([
          { op: 'setMatchUpDrawPositions', matchUpId: onward.matchUpId, drawPositions: onward.drawPositions },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
        ] as OutcomeOp[])
      : []),
  ];
}

/** C29: `producedLoserArrival`'s award, announced as the assignment, and the position sent on (C19's ops, the loser's) */
export function producedLoserArrivalOps(view: OutcomeView, loser?: DirectionPlan['loser']): OutcomeOp[] {
  const award = producedLoserArrival(view, loser);
  if (!award) return [];
  const { entry, matchUpStatus, side, drawPosition, onward } = award;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: entry.matchUpId,
      matchUpStatus,
      winningSide: side,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcedAs: 'assignMatchUpDrawPosition',
      awardsStandingExit: true,
    },
    { op: 'setMatchUpDrawPositions', matchUpId: entry.matchUpId, drawPositions: [drawPosition] },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ...(onward
      ? ([
          { op: 'setMatchUpDrawPositions', matchUpId: onward.matchUpId, drawPositions: onward.drawPositions },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
        ] as OutcomeOp[])
      : []),
  ];
}

/**
 * C30: `awardedProducedArrival`'s placement: both matchUps written back as they stand, announced as the assignment
 * (C18's ops), the award's codes re-derived
 */
export function awardedProducedArrivalOps(view: OutcomeView, loser?: DirectionPlan['loser']): OutcomeOp[] {
  const award = awardedProducedArrival(view, loser);
  if (!award) return [];
  const { entry, drawPosition, onward } = award;
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: entry.matchUpId,
      drawPositions: positionsOf(entry),
      placedDrawPosition: drawPosition,
      rederivesCodes: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ...(onward
      ? ([
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            placedDrawPosition: drawPosition,
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
        ] as OutcomeOp[])
      : []),
  ];
}

/** BATCH 1 (A2): the final's winner and loser assigned their Decider seats (`deciderSeats`) */
function deciderArrivalOps(view: OutcomeView, write: MatchUpWrite, direction?: DirectionPlan): OutcomeOp[] {
  const seats = deciderSeats(view, write, direction);
  if (!seats || !direction?.loser) return [];
  const { structureId, drawPosition, participantId } = seats.winner;
  const assign = (position: number, id: string): OutcomeOp => ({
    op: 'assignPosition',
    announcesAssignments: false,
    structureId,
    drawPosition: position,
    participantId: id,
  });
  return [assign(drawPosition, participantId), assign(seats.loserDrawPosition, direction.loser.participantId)];
}

/**
 * BATCH 1 (A2): a Decider that is not needed is written a DEAD_RUBBER by v1's settle pass (`reconcileDecider`), after
 * everything the call directs. One that is needed stands to be played, as the arrivals found it.
 */
export function deciderSettleOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  direction?: DirectionPlan,
): OutcomeOp[] {
  const seats = route === 'winner' ? deciderSeats(view, write, direction) : undefined;
  if (!seats || seats.decider.matchUpStatus === view.targets.winner?.matchUpStatus) return [];
  const { matchUpId, matchUpStatus } = seats.decider;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus,
      // v1 clears through the `toBePlayed` fixture (`removeScore`): its own keys, in its order, and its objects
      resetsScore: true,
      removesWinningSide: true,
      stampsScoredTime: false,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
}

/** the loser's plain arrival (`arrivalOps`), or a final's two arrivals in its Decider (`deciderArrivalOps`) */
export function linkedArrivalOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  direction: DirectionPlan | undefined,
  loser: DirectionPlan['loser'],
): OutcomeOp[] {
  const decider = route === 'winner' ? deciderArrivalOps(view, write, direction) : [];
  return decider.length ? decider : arrivalOps(view, loser);
}

/** BATCH 1 (A1): a winner placed across a winner link stamps the structure they land in, as v1 announces it */
export function linkedWinnerStamp(view: OutcomeView, placed: OutcomeOp[]): OutcomeOp[] {
  const id = view.targets.winner?.structureId;
  return placed.length && id && id !== view.targets.source.structureId
    ? [{ op: 'stampUpdatedAt', entity: 'structure', id }]
    : [];
}

function placementWrites(path: PlacementClaim[], sourceId?: string): OutcomeOp[] {
  const ops: OutcomeOp[] = [];
  for (const step of path) {
    if (!step.announce) continue;
    const { match, position, positions, awardedSide } = step;
    const origin: SideExitProvenance | undefined =
      awardedSide && positions.length === 1 && sourceId && step === path[0]
        ? { [awardedSide]: { previousMatchUpStatus: COMPLETED, sourceMatchUpId: sourceId } }
        : undefined;
    ops.push(
      {
        op: 'setMatchUpDrawPositions',
        matchUpId: match.matchUpId,
        drawPositions: positions,
        placedDrawPosition: position,
        ...(awardedSide && { awardedSide }),
        ...(step.codes && { awardedCodes: step.codes }),
        ...(origin && { placementOrigin: origin }),
        ...(!awardedSide && !step.added && { preservesWinningSide: true }),
      },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: match.matchUpId },
    );
  }
  return ops;
}

/** The two directed seats and their supported onward placements are one obligation. */
export function planWinnerArrivals(args: PlanArgs): OutcomeOp[] | undefined {
  const { request, view, drawDefinition, direction, write } = args;
  const { targets, inContextDrawMatchUps, existing } = view;
  const side = request.winningSide;
  if (
    args.route !== 'winner' ||
    !drawDefinition ||
    !inContextDrawMatchUps ||
    (side !== 1 && side !== 2) ||
    write?.matchUpStatus !== COMPLETED ||
    (request.matchUpStatus && request.matchUpStatus !== COMPLETED) ||
    !bareResultRequest({ ...request, score: undefined }) ||
    request.flags.propagatingExit ||
    tiebreakPointsWarnings(request.score?.sets, existing.matchUpFormat).length ||
    targets.carryLevels?.bounded ||
    existing.matchUpStatus !== TO_BE_PLAYED ||
    existing.winningSide ||
    existing.scoreHasValue ||
    existing.hasSideExitProvenance ||
    existing.carriedExit ||
    view.draw.tallied ||
    view.activeDownstream ||
    view.isTeam ||
    view.line ||
    view.group ||
    view.isDeciderMatchUp ||
    direction?.decider ||
    targets.winnerLink ||
    !direction?.winner ||
    direction.winner.participantId !== targets.sideParticipantIds[side] ||
    (targets.reservations?.[side] && targets.reservations[side].kind !== 'none') ||
    targets.byeTarget
  )
    return undefined;
  const draw = { drawDefinition, inContextDrawMatchUps };
  const source = indexed(view, request.matchUpId);
  const w = sideDrawPosition(view, side),
    l = sideDrawPosition(view, (3 - side) as 1 | 2);
  const winner = targets.sideParticipantIds[side],
    loser = targets.sideParticipantIds[(3 - side) as 1 | 2];
  if (
    !source ||
    source.matchUpType !== 'SINGLES' ||
    !winner ||
    !loser ||
    winner === loser ||
    !w ||
    !l ||
    !holdsPosition(source, winner, w) ||
    !holdsPosition(source, loser, l) ||
    claimAssignment(draw, source, w)?.participantId !== winner ||
    claimAssignment(draw, source, l)?.participantId !== loser
  )
    return undefined;
  const edges = winnerClaimEdge(draw, source)?.targetMatchUps;
  const next = edges?.winnerMatchUp;
  if (!next || next.matchUpId !== direction.winner.matchUpId || next.structureId !== source.structureId)
    return undefined;
  const win = placementPath(draw, next, winner, w, false, source.matchUpId);
  if (!win) return undefined;
  const entrant = direction.loser;
  let loss: PlacementClaim[] = [];
  if (edges.loserMatchUp || entrant || targets.loserMatchUpId) {
    const dest = edges.loserMatchUp,
      pos = edges.loserTargetDrawPosition;
    if (
      !dest ||
      dest.matchUpId !== entrant?.matchUpId ||
      dest.matchUpId !== source.loserMatchUpId ||
      dest.structureId === source.structureId ||
      pos !== targets.loserTargetDrawPosition ||
      !pos ||
      !entrant.arrives ||
      entrant.exit ||
      entrant.bye ||
      entrant.converged ||
      entrant.carriedPast ||
      entrant.withdrawn ||
      entrant.retainedCarry ||
      entrant.participantId !== loser ||
      !targets.loserTargetSeat?.free ||
      targets.seededParticipantIds?.includes(loser)
    )
      return undefined;
    const seat = claimAssignment(draw, dest, pos);
    if (!seat || seat.bye || seat.qualifier || seat.participantId) return undefined;
    const path = placementPath(draw, dest, loser, pos, true, source.matchUpId, win);
    if (!path || !accountsForAssignment(draw, path, dest, pos, loser)) return undefined;
    loss = path;
  }
  const protectedCount = [...win, ...loss].filter((step) => step.awardedSide).length;
  if (!protectedCount || protectedCount > 2) return undefined;
  const assignment = arrivalOps(view, entrant);
  return [
    ...placementWrites(win, source.matchUpId),
    ...assignment,
    ...placementWrites(loss),
    ...arrivalReturnOps(assignment),
  ];
}

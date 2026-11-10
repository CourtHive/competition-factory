import { blankScore, CLEAR_SCORE, indexed, scoreless, sideOf, structureStamps, unplaced } from './planShared';
import { arrivalOps, arrivalReturnOps, winnerPlacementOps } from './directionOps';
import { unwoundOps, unwoundView } from './unwindPath';
import { isDoubleExit } from '@Validators/isExit';
import { scheduleOps } from './schedulePlan';
import { resultOps } from './resultOps';

// constants and types
import { COMPLETED, DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUpWrite, PlanArgs, RebuildView } from '../types';
import type { SideExitProvenance } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';

/**
 * A terminal Main award and the occupied final (M1): the produced exit awarded to the freshly arriving winner, its
 * loser's retained relay award, and the reservation beside the retained carrier on the folded clear.
 */

/** A terminal produced exit keeps its foreign origin and is awarded to this freshly arriving winner. */
function terminalMainAward(
  args: Parameters<typeof unwoundView>[0] & { write?: MatchUpWrite },
  unwind: ReturnType<typeof unwoundOps>,
  after: NonNullable<ReturnType<RebuildView>>,
  winnerOps: OutcomeOp[],
) {
  const mainId = after.view.targets.winnerMatchUpId;
  const main = indexed(after.view, mainId);
  if (!main || main.winnerMatchUpId || main.loserMatchUpId || !unplaced(main) || !scoreless(main)) return undefined;
  if (main.matchUpStatus !== WALKOVER || main.winningSide || main.matchUpStatusCodes?.length) return undefined;
  const [kept, ...more] = Object.entries(main.sideExitProvenance ?? {});
  if (!kept || more.length || kept[1].previousMatchUpStatus !== DOUBLE_WALKOVER) return undefined;
  const origin = indexed(after.view, kept[1].sourceMatchUpId);
  if (
    origin?.matchUpStatus !== DOUBLE_WALKOVER ||
    origin.winnerMatchUpId !== main.matchUpId ||
    origin.structureId !== main.structureId
  )
    return undefined;
  if (origin.matchUpId === args.request.matchUpId || kept[1].matchUpStatus !== WALKOVER) return undefined;
  const placed = args.rebuild?.([...unwind.ops, ...winnerOps], 'winner');
  const position = args.write?.winningSide && after.view.targets.sideDrawPositions[args.write.winningSide as 1 | 2];
  const side = sideOf(placed && indexed(placed.view, main.matchUpId), position || undefined);
  if (!side || Number(kept[0]) !== 3 - side) return undefined;
  const result: Extract<OutcomeOp, { op: 'setMatchUpResult' }> = {
    op: 'setMatchUpResult',
    matchUpId: main.matchUpId,
    matchUpStatus: WALKOVER,
    winningSide: side,
    resetsScore: true,
    score: blankScore(),
    matchUpStatusCodes: [],
    stampsScoredTime: false,
    retainedExitPlanned: true,
  };
  const provenance: SideExitProvenance = {
    ...main.sideExitProvenance,
    [side]: { previousMatchUpStatus: COMPLETED, sourceMatchUpId: args.request.matchUpId },
  };
  return { result, provenance };
}

/** The captured occupied-final winner program: a terminal Main award, then its loser's retained relay award. */
export function terminalOccupiedWinnerOps(args: PlanArgs): OutcomeOp[] | undefined {
  const { view, request, write, drawDefinition } = args;
  if (args.route !== 'winner' || !args.rebuild || !drawDefinition || view.isTeam || view.group) return undefined;
  if (!isDoubleExit(view.existing.matchUpStatus) || write?.matchUpStatus !== COMPLETED || !write.winningSide)
    return undefined;
  const source = indexed(view, request.matchUpId);
  const original = indexed(view, source?.winnerMatchUpId);
  if (!source || !original || original.structureId !== source.structureId) return undefined;
  if (original.winnerMatchUpId || original.loserMatchUpId || !isDoubleExit(original.matchUpStatus)) return undefined;
  if (
    !unplaced(original) ||
    !scoreless(original) ||
    original.matchUpStatusCodes?.length ||
    original.schedule?.scoredTime
  )
    return undefined;
  if (
    original.winningSide ||
    request.score ||
    request.matchUpFormat ||
    request.carries?.schedule ||
    request.carries?.notes !== undefined
  )
    return undefined;
  if (view.targets.loserLink?.linkCondition) return undefined;
  const unwind = unwoundOps(view, request, args.route, drawDefinition, true);
  const markers = unwind.ops.flatMap((op) => (op.op === 'clearMatchUpBye' && op.retainedCarriedAward ? [op] : []));
  if (markers.length !== 1 || markers[0].matchUpId !== view.targets.loserMatchUpId) return undefined;
  const after = args.rebuild(unwind.ops, 'winner');
  const direction = after?.direction;
  const loser = direction?.loser;
  if (!after || !direction?.winner || direction.decider || direction.produced || direction.converged) return undefined;
  if (
    !loser?.arrives ||
    !loser.participantId ||
    loser.exit ||
    loser.converged ||
    loser.carriedPast ||
    loser.bye ||
    loser.withdrawn
  )
    return undefined;
  if (
    !after.view.targets.loserTargetSeat?.free ||
    after.view.targets.seededParticipantIds?.includes(loser.participantId)
  )
    return undefined;
  const reservation = after.view.targets.reservations?.[write.winningSide as 1 | 2];
  if (reservation?.kind === 'reserve' || reservation?.kind === 'abstain') return undefined;
  const winnerOps = winnerPlacementOps(after.view, 'winner', write, direction.winner).filter(
    (op) => op.op !== 'stampUpdatedAt',
  );
  const main = terminalMainAward(args, unwind, after, winnerOps);
  if (!main) return undefined;
  const relay = indexed(after.view, view.targets.loserMatchUpId);
  const position = after.view.targets.loserTargetDrawPosition;
  const relaySide = sideOf(relay, position);
  if (!relay || !relaySide || (relay.matchUpStatus !== WALKOVER && relay.matchUpStatus !== DEFAULTED)) return undefined;
  const arrival = arrivalOps(after.view, loser);
  const relayAward: OutcomeOp = {
    op: 'setMatchUpResult',
    matchUpId: relay.matchUpId,
    matchUpStatus: relay.matchUpStatus,
    winningSide: relaySide,
    matchUpStatusCodes: [],
    stampsScoredTime: false,
    retainedExitPlanned: true,
    announcedAs: 'assignMatchUpDrawPosition',
  };
  const project = (op: OutcomeOp): OutcomeOp => {
    if ('matchUpId' in op && op.matchUpId === main.result.matchUpId) {
      if (op.op === 'setMatchUpResult') return { ...op, ...main.result };
      if (op.op === 'setSideExitProvenance') return { ...op, provenance: main.provenance };
    }
    return op;
  };
  const unwound = unwind.ops.map(project);
  const own = resultOps(request, write, source.matchUpId);
  const final = retainedCarriedAwardOps(args, unwound, {
    ops: [...own, ...winnerOps, ...arrival, relayAward],
    participantId: loser.participantId,
  });
  if (!final) return undefined;
  return [
    ...unwound,
    ...scheduleOps(args, source.matchUpId),
    ...own,
    ...winnerOps,
    ...arrival,
    relayAward,
    ...arrivalReturnOps(arrival),
    ...unwind.reannounced.map(project),
    ...final,
    ...structureStamps([...unwound, ...arrival], source.structureId),
    { op: 'stampUpdatedAt', entity: 'structure', id: source.structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  ];
}

/** Reserve beside the retained carrier on the folded clear, preserving v1's score and deferred-writer order. */
export function retainedCarriedAwardOps(
  args: PlanArgs,
  unwound: OutcomeOp[],
  arrival?: { ops: OutcomeOp[]; participantId: string },
): OutcomeOp[] | undefined {
  const retained = unwound.flatMap((op) =>
    op.op === 'clearMatchUpBye' && op.retainedCarriedAward
      ? [{ ...op.retainedCarriedAward, reservedDrawPosition: op.drawPosition }]
      : [],
  );
  if (!retained.length) return [];
  if (retained.length !== 1 || !args.rebuild) return undefined;
  const award = retained[0];
  const reserve: OutcomeOp = {
    op: 'setMatchUpDrawPositions',
    matchUpId: award.matchUpId,
    drawPositions: [award.carrierDrawPosition, award.reservedDrawPosition].sort((a, b) => a - b),
  };
  const after = args.rebuild([...unwound, ...(arrival?.ops ?? []), reserve], arrival ? 'winner' : CLEAR_SCORE);
  const final = after && indexed(after.view, award.matchUpId);
  const side = sideOf(final, award.carrierDrawPosition);
  const carrier = final?.sides?.find((candidate) => candidate.sideNumber === side);
  const empty = final?.sides?.find((candidate) => candidate.sideNumber === 3 - (side ?? 0));
  if (!side || carrier?.participantId !== award.participantId || empty?.drawPosition !== award.reservedDrawPosition)
    return undefined;
  if (empty.participantId !== arrival?.participantId || empty.bye || empty.qualifier) return undefined;
  const [entry] = Object.values(award.provenance);
  const result: Extract<OutcomeOp, { op: 'setMatchUpResult' }> = {
    op: 'setMatchUpResult',
    matchUpId: award.matchUpId,
    matchUpStatus: award.matchUpStatus,
    winningSide: (3 - side) as 1 | 2,
    resetsScore: award.matchUpStatus === WALKOVER ? true : undefined,
    replaysCarriedExit: true,
    score: blankScore(),
    matchUpStatusCodes: [],
    stampsScoredTime: false,
    retainedExitPlanned: true,
  };
  return [
    reserve,
    { op: 'setSideExitProvenance', matchUpId: award.matchUpId, provenance: { [side]: entry } },
    result,
    ...(arrival ? [] : [{ ...result, announcedAs: 'advanceWinner' as const }]),
  ];
}

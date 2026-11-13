import { producedLoser, producedLoserMatchUpIds, producedLoserOps } from './byeChain';
import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { unwindWalk } from '../unwindWalk';
import { indexed } from './planShared';

// constants and types
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import type { WorkingView } from '../overlay';
import type { LandingView } from '../types';
import type { OutcomeOp } from '../ops';

/**
 * 1b, L2: a converged landing's own loser link under `doubleExitPropagateBye: false`, served as v1 serves it. Two callers:
 * the landing re-entered as its double exit's source (`reentry`, DEA:1594 → `reclaimSingleExitBye` DEA:86–121 and the
 * dispatch at :316) and a pending exit converged on a loser seat (`landing-converged`, `serveConvergedLoserLink`,
 * DEA:3033–3125). Each reads its targets fresh on the cursor its `prefix` leaves (the local channel: DEA:3046, or the
 * re-entry's :156); the produced exit it dispatches reads the caller's `paramsChannel` (F2, DEA:1036–1148).
 */
export type LandingFrame = {
  phase: 'reentry' | 'landing-converged';
  /** the converged matchUp whose loser link is served */
  matchUpId: string;
  /** F1: the status its caller passes (DEA:773 the inherited one; a re-entry DEA:1189's) */
  cascadeStatus: MatchUpStatusUnion;
  /** the program v1 has written when the service reads (its convergence and that convergence's winner effects) */
  prefix: OutcomeOp[];
  /** F2: the caller's hydrated snapshot; absent, the cursor at `prefix` (a re-entry's DEA:1596 refresh) */
  paramsChannel?: HydratedMatchUp[];
};

export type LandingService = { ops: OutcomeOp[]; touched: string[] };

const NONE: LandingService = { ops: [], touched: [] };

type LandingRead = NonNullable<ReturnType<LandingView>>;

/**
 * The landing's loser link, step by step as v1 takes it: no link (DEA:3055) or the same decider (:3057) serve nothing; a
 * propagated BYE on the seat gives way (`removeDirectedBye`) and the link is served again on a fresh read (:3070–3086,
 * :158); an occupant, BYE or qualifier there (:3099), or an exit this convergence already sent (:3101–3105), serve
 * nothing; otherwise `handleLoserMatchUp` (:3110) produces the exit on the loser matchUp (`producedLoser`). A re-entry's
 * FIRST_MATCHUP gate serves nothing where the landing holds no position. Undefined, the call v1's, wherever v1 takes
 * another branch (a carrier released, a fed seat, another empty exit, a reclaim before that gate, a BYE-held loser matchUp
 * at a re-entry) or where the two hydration channels read apart.
 */
export function landingLoserLink(
  frame: LandingFrame,
  landingView?: LandingView,
  reclaim?: Reclaim,
): LandingService | undefined {
  const read = landingView?.(frame.prefix, frame.matchUpId, frame.cascadeStatus);
  if (!read) return undefined;
  const { view, working } = read;
  const { targets } = view;
  const paramsChannel = frame.paramsChannel ?? working.inContextDrawMatchUps;
  const converged = indexed(view, frame.matchUpId);
  const loserMatchUp = indexed(view, targets.loserMatchUpId);
  const drawPosition = targets.loserTargetDrawPosition;
  const seat = targets.loserTargetSeat;
  const l2 = frame.phase === 'landing-converged';
  if (!loserMatchUp) return NONE;
  if (!drawPosition || !targets.loserLink) return l2 ? NONE : undefined;
  if (l2 && targets.winnerMatchUpId === loserMatchUp.matchUpId) return NONE;
  // the FIRST_MATCHUP gate a re-entry asks (DEA:282–313), after its reclaim (:146): a converged landing holding no
  // position names no first-match loser, so its loser side is not served. A reclaim before the gate is v1's
  if (!l2 && targets.loserLink.linkCondition) {
    if (targets.loserLink.linkCondition !== FIRST_MATCHUP) return undefined;
    if (seat?.bye && seat.byeFromPropagation && !loserMatchUp.hasFedDrawPosition) return undefined;
    return (converged?.drawPositions ?? []).some(Boolean) ? undefined : NONE;
  }
  if (!seat || !converged || loserMatchUp.structureId === converged.structureId) return undefined;
  if (seat.bye && seat.byeFromPropagation && !loserMatchUp.hasFedDrawPosition) {
    const seatAt = { structureId: loserMatchUp.structureId, matchUpId: loserMatchUp.matchUpId, drawPosition };
    return reclaim ? undefined : reclaimThenServe(frame, read, paramsChannel, seatAt, landingView);
  }
  // the convergence's first carrier, sent on as its loser, released (`releaseCarrier`): measured on no call, v1's
  if (seat.participantId && converged.sides?.some((side) => side.participantId === seat.participantId))
    return undefined;
  if (!seat.free) return l2 || (seat.bye && loserMatchUp.matchUpStatus === BYE) ? NONE : undefined;
  if (l2 && servedFrom(working, loserMatchUp.matchUpId, frame.matchUpId)) return NONE;
  return dispatch(frame, read, paramsChannel, loserMatchUp, reclaim);
}

/** `handleLoserMatchUp` (DEA:430–546) on a free seat, the produced exit read on the cursor */
function dispatch(
  frame: LandingFrame,
  { view, working }: LandingRead,
  paramsChannel: HydratedMatchUp[],
  loserMatchUp: HydratedMatchUp,
  reclaim?: Reclaim,
): LandingService | undefined {
  const l2 = frame.phase === 'landing-converged';
  // a re-entry dispatches a loser matchUp that is not a BYE (DEA:316); a BYE-held one records the exit, v1's
  if (!l2 && loserMatchUp.matchUpStatus === BYE) return undefined;
  // a fed seat takes a BYE, and an empty exit (the caller's predicate, DEA:3108 or :163) converges again; both are v1's.
  // A double exit there takes nothing
  if (loserMatchUp.hasFedDrawPosition) return undefined;
  const occupied = loserMatchUp.sides?.some((side) => side.participantId || (!l2 && side.participant));
  if (isExit(loserMatchUp.matchUpStatus) && !occupied) return undefined;
  if (isDoubleExit(loserMatchUp.matchUpStatus)) return NONE;
  // the channel reading as the cursor does (dev's certificate) stands after a reclaim too
  const channel =
    sameChannel(working, paramsChannel, loserMatchUp.matchUpId) ||
    (!!reclaim && reclaimedChannel(working, paramsChannel, loserMatchUp, reclaim));
  if (!channel) return undefined;
  const produced = producedLoser(view);
  if (!produced) return undefined;
  const lineage = { sourceMatchUpId: frame.matchUpId, previousMatchUpStatus: frame.cascadeStatus };
  return {
    ops: producedLoserOps({ cascadeStatus: frame.cascadeStatus, lineage }, produced),
    touched: [...new Set(producedLoserMatchUpIds(produced))],
  };
}

/**
 * Policy off: a propagated BYE on the seat gives way (`removeDirectedBye`, the unwind walk's removal), and the link is
 * served again on a fresh read with the same params channel (DEA:3070–3086; at a re-entry DEA:86–121 and :158). A
 * removal reaching beyond the seat's matchUp, or one no produced exit re-announces, is v1's (notice naming, Q5)
 */
function reclaimThenServe(
  frame: LandingFrame,
  { view, working }: LandingRead,
  paramsChannel: HydratedMatchUp[],
  { matchUpId, ...seat }: { structureId: string; matchUpId: string; drawPosition: number },
  landingView?: LandingView,
): LandingService | undefined {
  const visits = { unnamed: new Set<string>() };
  const walked = unwindWalk({
    inContextDrawMatchUps: working.inContextDrawMatchUps,
    propagatesBye: !!view.draw.propagatesByeOnDoubleExit,
    drawDefinition: working.drawDefinition,
    seats: [seat],
    visits,
  })?.[0];
  if (!walked) return undefined;
  const reclaim = walked.map((op) => namedWithdrawal(op, visits.unnamed));
  const undone = { ids: new Set(touchedBy(reclaim)), before: working.inContextDrawMatchUps };
  const after = landingLoserLink(
    { ...frame, paramsChannel, prefix: [...frame.prefix, ...reclaim] },
    landingView,
    undone,
  );
  // Certified where the produced exit's result write announces the seat's matchUp after (the notice v1 keeps), and every
  // matchUp the removal reached only with no event in hand (`removeSubsequentRoundsParticipant`, the round-1 loser
  // cascade: the tournament, no event, which no op here writes) is announced again after it, so v1's later notice is the
  // one kept (2026-11-13 L2 ruling §3)
  const announced = after?.ops.some((op) => op.op === 'setMatchUpResult' && op.matchUpId === matchUpId);
  const reannounced = [...visits.unnamed].every((id) => after?.ops.some((op) => announces(op, id)));
  if (!announced || !reannounced) return undefined;
  return after && { ops: [...reclaim, ...after.ops], touched: [...new Set([...touchedBy(reclaim), ...after.touched])] };
}

/**
 * v1's removal is handed the event and the tournament (`removeDirectedBye` at DEA:3076 and :111), so each notice its
 * removal tasks make names them: the matchUp's, its structure's assignments', and so the tournament the call marks
 * modified. A matchUp the walk reached only with no event in hand (`Sim.named`) is left as the walk writes it, for a
 * later write to announce
 */
function namedWithdrawal(op: OutcomeOp, unnamed: Set<string>): OutcomeOp {
  if ('matchUpId' in op && op.matchUpId && unnamed.has(op.matchUpId)) return op;
  if (op.op === 'setMatchUpDrawPositions') {
    const { announcesContext: _bare, ...named } = op;
    return { ...named, namesContext: true };
  }
  if (op.op === 'announcePositionAssignments') {
    const { announcesEvent: _event, announcesTournament: _tournament, ...named } = op;
    return named;
  }
  return op.op === 'clearMatchUpBye' ? { ...op, namesContext: true } : op;
}

/** L2's `alreadyServed`: the loser matchUp's stored provenance names this convergence */
function servedFrom(working: WorkingView, loserMatchUpId: string, matchUpId: string): boolean {
  const stored = working.matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === loserMatchUpId);
  const entries = Object.values(getSideExitProvenance({ matchUp: stored }) ?? {});
  return entries.some((entry) => entry?.sourceMatchUpId === matchUpId);
}

/**
 * F2: the dispatched exit reads the loser matchUp's targets, and the matchUps they name, from the caller's params channel
 * (`conditionallyAdvanceDrawPosition`, DEA:1036–1148). Certified where that channel reads them as the cursor does.
 */
function sameChannel(working: WorkingView, paramsChannel: HydratedMatchUp[], matchUpId: string): boolean {
  const read = (inContextDrawMatchUps: HydratedMatchUp[]) =>
    positionTargets({ drawDefinition: working.drawDefinition, inContextDrawMatchUps, matchUpId });
  const fresh = read(working.inContextDrawMatchUps);
  const stale = read(paramsChannel);
  if (fresh.error || stale.error) return false;
  if (fresh.targetMatchUps?.loserTargetDrawPosition !== stale.targetMatchUps?.loserTargetDrawPosition) return false;
  const named = ({ targetMatchUps }: typeof fresh) => [targetMatchUps?.winnerMatchUp, targetMatchUps?.loserMatchUp];
  const staleNamed = named(stale);
  return named(fresh).every((matchUp, index) => facts(matchUp) === facts(staleNamed[index]));
}

/** what the reclaim undid: the matchUps it wrote, and the cursor before it */
type Reclaim = { ids: Set<string>; before: HydratedMatchUp[] };

/**
 * F2 after a reclaim (2026-11-13 L2 ruling §2): v1 re-serves on a fresh read, but the dispatched exit still reads the
 * caller's params channel, which predates the reclaim (DEA:3076–3085, :3110 → :902). Certified where that channel names
 * the same matchUps the cursor does, at every level the dispatch reads them (the loser matchUp's targets, and its winner
 * target's onward target, DEA:1036–1047, drawPositionPlacement.ts:363–372), and reads each as the cursor does, or, where
 * the reclaim wrote it, as it stood before the reclaim. v1's other channel reads are kept out: the side a walkover is
 * awarded to resolves structurally (DEA:522–530), a loser matchUp holding a decided exit would read its winner on the
 * channel (DEA:1121), and a TEAM line-up reads the channel's sides (drawPositionPlacement.ts:413, :915–935)
 */
function reclaimedChannel(
  working: WorkingView,
  paramsChannel: HydratedMatchUp[],
  loserMatchUp: HydratedMatchUp,
  { ids, before }: Reclaim,
): boolean {
  const { drawDefinition } = working;
  const { matchUpId, structureId } = loserMatchUp;
  if (isExit(loserMatchUp.matchUpStatus) && loserMatchUp.winningSide) return false;
  const read = (inContextDrawMatchUps: HydratedMatchUp[], id: string) =>
    positionTargets({ drawDefinition, inContextDrawMatchUps, matchUpId: id });
  const fresh = read(working.inContextDrawMatchUps, matchUpId);
  const stale = read(paramsChannel, matchUpId);
  if (fresh.error || stale.error) return false;
  const loserTargetDrawPosition = fresh.targetMatchUps?.loserTargetDrawPosition;
  if (loserTargetDrawPosition !== stale.targetMatchUps?.loserTargetDrawPosition) return false;
  const structural =
    !!loserMatchUp.feedRound ||
    !!getDrawPositionSideNumber({
      matchUp: { ...loserMatchUp, sides: undefined },
      drawPosition: loserTargetDrawPosition,
      drawDefinition,
      structureId,
    });
  if (!structural) return false;
  const winner = fresh.targetMatchUps?.winnerMatchUp;
  const onward = winner
    ? [read(working.inContextDrawMatchUps, winner.matchUpId), read(paramsChannel, winner.matchUpId)]
    : [];
  if (onward.some((targets) => targets.error)) return false;
  const pairs: [HydratedMatchUp | undefined, HydratedMatchUp | undefined][] = [
    [winner, stale.targetMatchUps?.winnerMatchUp],
    [fresh.targetMatchUps?.loserMatchUp, stale.targetMatchUps?.loserMatchUp],
    ...(onward.length
      ? [
          [onward[0].targetMatchUps?.winnerMatchUp, onward[1].targetMatchUps?.winnerMatchUp] as [
            HydratedMatchUp | undefined,
            HydratedMatchUp | undefined,
          ],
        ]
      : []),
  ];
  if ([loserMatchUp, ...pairs.flat()].some((matchUp) => matchUp?.matchUpType === TEAM)) return false;
  return pairs.every(([cursor, channel]) => {
    if (cursor?.matchUpId !== channel?.matchUpId) return false;
    if (facts(cursor) === facts(channel)) return true;
    const undone = channel && ids.has(channel.matchUpId) && before.find((m) => m.matchUpId === channel.matchUpId);
    return !!undone && facts(undone) === facts(channel);
  });
}

const facts = (matchUp?: HydratedMatchUp) =>
  matchUp &&
  JSON.stringify([
    matchUp.matchUpId,
    matchUp.matchUpStatus,
    matchUp.drawPositions,
    matchUp.winningSide,
    matchUp.sideExitProvenance,
    matchUp.sides?.map((side) => [side.sideNumber, side.participantId, side.drawPosition, side.bye]),
  ]);

/** a write announcing the matchUp, whose notice supersedes an earlier one in the call */
const announces = (op: OutcomeOp, matchUpId: string) =>
  (op.op === 'setMatchUpResult' || op.op === 'setMatchUpDrawPositions' || op.op === 'setMatchUpBye') &&
  op.matchUpId === matchUpId;

const touchedBy = (ops: OutcomeOp[]) =>
  ops.flatMap((op) => {
    if (op.op === 'stampUpdatedAt') return op.entity === 'matchUp' ? [op.id] : [];
    return 'matchUpId' in op && op.matchUpId ? [op.matchUpId] : [];
  });

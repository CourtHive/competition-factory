import { producedLoser, producedLoserMatchUpIds, producedLoserOps } from './byeChain';
import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { unwindWalk } from '../unwindWalk';
import { indexed } from './planShared';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
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
 * nothing; otherwise `handleLoserMatchUp` (:3110) produces the exit on the loser matchUp (`producedLoser`). Undefined,
 * the call v1's, wherever v1 takes another branch (a carrier released, a fed seat, another empty exit, a FIRST_MATCHUP
 * gate at a re-entry, a BYE-held loser matchUp at a re-entry) or where the two hydration channels read apart.
 */
export function landingLoserLink(
  frame: LandingFrame,
  landingView?: LandingView,
  reclaimed = false,
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
  // the FIRST_MATCHUP gate a re-entry asks (DEA:290–313) is not certified here
  if (!l2 && targets.loserLink.linkCondition) return undefined;
  if (!seat || !converged || loserMatchUp.structureId === converged.structureId) return undefined;
  if (seat.bye && seat.byeFromPropagation && !loserMatchUp.hasFedDrawPosition) {
    const seatAt = { structureId: loserMatchUp.structureId, matchUpId: loserMatchUp.matchUpId, drawPosition };
    return reclaimed ? undefined : reclaimThenServe(frame, read, paramsChannel, seatAt, landingView);
  }
  // the convergence's first carrier, sent on as its loser, released (`releaseCarrier`): measured on no call, v1's
  if (seat.participantId && converged.sides?.some((side) => side.participantId === seat.participantId))
    return undefined;
  if (!seat.free) return l2 || (seat.bye && loserMatchUp.matchUpStatus === BYE) ? NONE : undefined;
  if (l2 && servedFrom(working, loserMatchUp.matchUpId, frame.matchUpId)) return NONE;
  return dispatch(frame, read, paramsChannel, loserMatchUp);
}

/** `handleLoserMatchUp` (DEA:430–546) on a free seat, the produced exit read on the cursor */
function dispatch(
  frame: LandingFrame,
  { view, working }: LandingRead,
  paramsChannel: HydratedMatchUp[],
  loserMatchUp: HydratedMatchUp,
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
  if (!sameChannel(working, paramsChannel, loserMatchUp.matchUpId)) return undefined;
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
  const walked = unwindWalk({
    inContextDrawMatchUps: working.inContextDrawMatchUps,
    propagatesBye: !!view.draw.doubleExitPropagatesBye,
    drawDefinition: working.drawDefinition,
    seats: [seat],
  })?.[0];
  if (!walked) return undefined;
  const reclaim = walked.map(namedWithdrawal);
  const after = landingLoserLink({ ...frame, paramsChannel, prefix: [...frame.prefix, ...reclaim] }, landingView, true);
  // Certified only where the removal writes the seat's own matchUp alone and the produced exit's result write announces
  // it after (the notice v1 keeps)
  const announced = after?.ops.some((op) => op.op === 'setMatchUpResult' && op.matchUpId === matchUpId);
  if (!announced || touchedBy(reclaim).some((id) => id !== matchUpId)) return undefined;
  return after && { ops: [...reclaim, ...after.ops], touched: [...new Set([...touchedBy(reclaim), ...after.touched])] };
}

/**
 * v1's removal is handed the event and the tournament (`removeDirectedBye` at DEA:3076 and :111), so each notice the walk
 * makes names them: the matchUp's, its structure's assignments', and so the tournament the call marks modified
 */
function namedWithdrawal(op: OutcomeOp): OutcomeOp {
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

const touchedBy = (ops: OutcomeOp[]) =>
  ops.flatMap((op) => {
    if (op.op === 'stampUpdatedAt') return op.entity === 'matchUp' ? [op.id] : [];
    return 'matchUpId' in op && op.matchUpId ? [op.matchUpId] : [];
  });

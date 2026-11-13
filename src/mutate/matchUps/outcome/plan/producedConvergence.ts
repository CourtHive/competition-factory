import { buildSideExitProvenance, collapseDoubleExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { ownByeChain, sourceSeatFrame, unfillableByeChain, walkChain } from './byeChain';
import { landingLoserLink, type LandingService } from './landingLoserLink';
import { producedTarget, producedTargetReason } from './producedTarget';
import { pendingConvergence } from './pendingConvergence';
import { SINGLE_EXITS, indexed } from './planShared';
import { isDoubleExit } from '@Validators/isExit';
import { convergedWrite } from './convergedWrite';
import { currentLinkedSeat } from '../view';

// constants and types
import type { DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView } from '../types';
import type { MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import type { ConvergedContext, ConvergedWrite } from './convergedWrite';
import type { PendingConvergence } from './pendingConvergence';
import { RETIRED } from '@Constants/matchUpStatusConstants';
import type { ProducedTarget } from './producedTarget';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ByeChain } from './byeChain';
import type { OutcomeOp } from '../ops';

/**
 * A PRODUCED exit meeting the pending exit a double exit produced in the next matchUp (`existingExit`): the
 * double exit they make, written by `convergedWrite`, and what it produces on.
 */

export type ProducedConvergence = {
  /** this matchUp's own loser seat: a BYE and its chain, placed first (`handleLoserMatchUp`) */
  own?: ByeChain;
  /** under `doubleExitPropagateBye: false`, the pending exit on that seat converged instead (`handleEmptyExitLoser`) */
  pending?: PendingConvergence;
  /** the onward matchUp's loser seat, which its produced exit leaves unfillable: a BYE and its chain */
  onwardBye?: ByeChain;
  landing: HydratedMatchUp;
  /** the side the double exit feeds, which takes its origin beside the one standing there */
  fedSide: 1 | 2;
  matchUpStatus: MatchUpStatusUnion;
  /** where the converged double exit produces in turn: none from a final */
  onward?: ProducedTarget;
  /** the arriving side's origin, merged beside the standing one */
  provenance?: SideExitProvenance;
  /** under the policy off, the landing's loser link as its re-entry serves it (L2, DEA:1594) */
  reentry?: LandingService;
};

// The produced twin of `convergenceAt`: a separate RULE 4 by the same ruling (see the comment there).
/**
 * S5: a double exit whose produced exit meets an exit standing in the next matchUp (`conditionallyAdvanceDrawPosition`'s
 * `existingExit`): the two converge there (`collapseDoubleExitStatus`: two defaults a `DOUBLE_DEFAULT`, anything else a
 * `DOUBLE_WALKOVER`), with no winner, the arriving side's origin merged beside the standing one, and that double exit
 * produces on as one entered there would (`advanceConvergedWinner`). Planned where the standing exit is a pending one a
 * double exit beside this one produced (its origin alone, on the other side; nobody there; no score, codes or loser link),
 * nothing links a loser on from this matchUp, and the exit produced onward lands clean (or the landing is a final).
 */
export function producedConvergedReason(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  direction?: DirectionPlan,
  context: ConvergedContext = {},
): ProducedConvergence | undefined {
  const { targets } = view;
  const converged = direction?.converged;
  const source = indexed(view, request.matchUpId);
  const linked = !!targets.loserLink || !!targets.loserMatchUpId;
  if (!converged || !source) return undefined;
  // with loser links, the BYEs they take (`doubleExitPropagateBye`); off, a pending exit there converges (1b)
  const pending =
    linked && !view.draw.propagatesByeOnDoubleExit
      ? pendingConvergence(view, sourceSeatFrame(view, request), request, source, context)
      : undefined;
  if (linked && !view.draw.propagatesByeOnDoubleExit && !pending) return undefined;
  // the own seat as the chain's shapes plan it, or as the view's walk of v1's recursion places it (S6 tail)
  const walkedOwn = view.targets.byeWalk?.own;
  const own = linked && !pending ? (ownByeChain(view) ?? (walkedOwn ? walkChain(walkedOwn) : undefined)) : undefined;
  if (linked && !own && !pending) return undefined;
  const target = producedTarget(view, source, write.matchUpStatus as MatchUpStatusUnion);
  const landing = target?.entry;
  if (!target || !landing || target.feed || landing.matchUpId !== converged.matchUpId) return undefined;
  if (!SINGLE_EXITS.has(landing.matchUpStatus) || landing.matchUpStatus === RETIRED || landing.winningSide)
    return undefined;
  if (landing.matchUpStatusCodes?.length || landing.score?.scoreStringSide1) return undefined;
  // the landing's own loser seat took its BYE when the first exit was produced there: the BYE `conditionallyAdvanceDrawPosition`
  // places again (DEA:1050) is nothing. Under `doubleExitPropagateBye: false` the landing re-enters as its double exit's
  // source (DEA:1594), where that BYE gives way to the exit it produces (`reclaimSingleExitBye`, L2 below)
  const landingSeat = targets.winnerLoserSeat;
  const landingLinked = !!landing.loserMatchUpId;
  if (landingLinked && landingSeat?.matchUpId !== landing.loserMatchUpId) return undefined;
  if (landingLinked && !landingSeat?.seat?.bye) return undefined;
  if ((landing.drawPositions ?? []).some(Boolean)) return undefined;
  const standingProvenance = landing.sideExitProvenance ?? {};
  const standing = standingProvenance[target.awardedSide];
  if (standingProvenance[target.fedSide] || !standing || !isDoubleExit(standing.previousMatchUpStatus))
    return undefined;
  const matchUpStatus = collapseDoubleExitStatus([write.matchUpStatus, landing.matchUpStatus]);
  if (matchUpStatus !== converged.matchUpStatus) return undefined;
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
    sourceMatchUpId: request.matchUpId,
    sourceSideNumber: target.fedSide,
  });
  const reentry = landingReentry(view, context, { landing, matchUpStatus, provenance, pending });
  if (!reentry) return undefined;
  const planned = { own, pending, landing, fedSide: target.fedSide, matchUpStatus, provenance, reentry };
  if (!landing.winnerMatchUpId) return apart(planned);
  const onward = producedTarget(view, landing, matchUpStatus);
  const onwardLinked = !!onward?.entry.loserMatchUpId;
  // the onward matchUp's loser seat takes its BYE whatever the policy (`advanceByeToLoserMatchUp`, DEA:1050–1063)
  if (!onward || !producedTargetReason(view, landing, onward, onwardLinked)) return undefined;
  const seat = targets.onwardLoserSeat;
  const onwardBye = onwardLinked ? unfillableByeChain(view, onward.entry, { seat, levels: seat?.levels }) : undefined;
  if (onwardLinked && !onwardBye) return undefined;
  if (onwardBye && !reenteredBye(view, context, planned, onward.entry, onwardBye)) return undefined;
  return apart({ ...planned, onward, onwardBye });
}

/**
 * Under the policy off the landing's re-entry (L2) writes between the entry view this chain is planned on and v1's
 * placement (DEA:1052), which reads the live record: its reclaim can clear a BYE the chain reads and does not write
 * (`byeChainProgram`'s terminal level). Certified where the chain planned on the cursor after the re-entry emits the same
 * ops; a re-entry that writes nothing leaves the entry plan as it is
 */
function reenteredBye(
  view: OutcomeView,
  context: ConvergedContext,
  planned: ConvergedWrite & { pending?: PendingConvergence; reentry: LandingService },
  onward: HydratedMatchUp,
  onwardBye: ByeChain,
): boolean {
  const { reentry, landing, matchUpStatus } = planned;
  if (!reentry.ops.length) return true;
  const seat = view.targets.onwardLoserSeat;
  const working = context.landing?.(
    [...reentryPrefix(view, context, planned), ...reentry.ops],
    landing.matchUpId,
    matchUpStatus,
  )?.working;
  const current = working && seat && currentLinkedSeat(working, working.matchUpsMap, seat);
  const entry = working?.inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === onward.matchUpId);
  if (!working || !current || !entry) return false;
  const cursor = { ...view, inContextDrawMatchUps: working.inContextDrawMatchUps };
  const replanned = unfillableByeChain(cursor, entry, current);
  const ops = (chain?: ByeChain) => chain && JSON.stringify([chain.assigns, chain.writes, chain.matchUpIds]);
  return ops(replanned) === ops(onwardBye);
}

/**
 * Under the policy off the landing re-enters as its double exit's source (DEA:1594) once its convergence is written, on
 * the convergence's status (DEA:1189), reading the refresh it was handed (DEA:1596): its loser link served there (L2).
 * Nothing where the landing links no loser on, or under the policy on
 */
function landingReentry(
  view: OutcomeView,
  context: ConvergedContext,
  written: ConvergedWrite & { pending?: PendingConvergence },
): LandingService | undefined {
  const { landing, matchUpStatus, provenance, pending } = written;
  if (!landing.loserMatchUpId || view.draw.propagatesByeOnDoubleExit) return { ops: [], touched: [] };
  const prefix = reentryPrefix(view, context, { landing, matchUpStatus, provenance, pending });
  const frame = { phase: 'reentry' as const, matchUpId: landing.matchUpId, cascadeStatus: matchUpStatus, prefix };
  return landingLoserLink(frame, context.landing);
}

/** what v1 has written when the landing re-enters: the caller's prefix, the pending convergence, the landing's own */
function reentryPrefix(
  view: OutcomeView,
  context: ConvergedContext,
  { landing, matchUpStatus, provenance, pending }: ConvergedWrite & { pending?: PendingConvergence },
): OutcomeOp[] {
  return [
    ...(context.prefix ?? []),
    ...(pending ? convergedWrite(view, pending) : []),
    ...convergedWrite(view, { landing, matchUpStatus, provenance }),
  ];
}

/** a convergence touching any matchUp twice is v1's */
function apart(planned: ProducedConvergence): ProducedConvergence | undefined {
  const touched = [
    ...(planned.own?.matchUpIds ?? []),
    ...(planned.pending?.touched ?? []),
    ...(planned.reentry?.touched ?? []),
    ...(planned.onwardBye?.matchUpIds ?? []),
    planned.landing.matchUpId,
    ...(planned.onward ? [planned.onward.entry.matchUpId] : []),
  ];
  return new Set(touched).size === touched.length ? planned : undefined;
}

/** the convergence written on the next matchUp, as v1 writes it there, and the exit it produces on */
export function producedConvergedOps(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  direction?: DirectionPlan,
  context: ConvergedContext = {},
): OutcomeOp[] | undefined {
  const planned = producedConvergedReason(view, request, write, direction, context);
  if (!planned) return undefined;
  const { own, pending, reentry } = planned;
  return [
    ...(own ? [...own.assigns, ...own.writes] : []),
    ...(pending ? convergedWrite(view, pending) : []),
    ...convergedWrite(view, { ...planned, reentered: reentry?.ops }),
  ];
}

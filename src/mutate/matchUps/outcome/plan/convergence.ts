import { blankScore, SINGLE_EXITS, carriedStatus, indexed, isSettleWrite, sideOf } from './planShared';
import { producedTarget, producedTargetOps, producedTargetReason } from './producedTarget';
import { ownByeChain, sourceSeatFrame, unfillableByeChain, walkChain } from './byeChain';
import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import { landingLoserLink, type LandingService } from './landingLoserLink';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { isDoubleExit } from '@Validators/isExit';
import { releaseWalk } from '../unwindWalk';
import {
  buildCarriedExitProvenance,
  buildSideExitProvenance,
  collapseDoubleExitStatus,
  deriveStatusCodes,
  retainPolicyCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type {
  AbstainReason,
  ByeWalk,
  DirectionPlan,
  LandingView,
  MatchUpWrite,
  OutcomeRequest,
  OutcomeView,
} from '../types';
import type { ProducedTarget, RetainedRelayReservation } from './producedTarget';
import type { DrawDefinition, MatchUpStatusUnion, Score, SideExitProvenance } from '@Types/tournamentTypes';
import { DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { SeatFrame } from './carriedContinuation';
import type { ByeChain } from './byeChain';
import type { OutcomeOp } from '../ops';

/**
 * RULE 4 of v1's `progressExitStatus` (S5, S6 tail): two exits meeting where a carrier lands, or a produced exit
 * meeting the one standing in the next matchUp, the double exit they make and what it produces on.
 */

/**
 * S5: RULE 4 of v1's `progressExitStatus`. The loser carries an exit onto the seat a carried exit standing there was
 * awarded to: the two meet and the matchUp becomes the double exit (`collapseDoubleExitStatus`), its award taken away,
 * codes as they stood and a DOUBLE_WALKOVER's score blanked, the arriving side's entry merged beside the standing one; and that double exit then
 * produces its exit onward, as a double exit entered there would (`producedTarget`). Planned where the landing holds a
 * single exit awarded to the carrier's seat, carried in on the other side and on that side alone, no score value, and
 * no loser link of its own (the first carrier, its loser, was sent nowhere), and where the produced exit lands clean.
 */
export function convergedReason(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  loser: NonNullable<DirectionPlan['loser']>,
  reservation?: RetainedRelayReservation,
): AbstainReason | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  if (write.matchUpStatusCodes?.length || !loser.arrives) return 'exit';
  if (!seat?.free || seat.opponentBye) return 'exit';
  const { loserMatchUpId, loserTargetDrawPosition } = targets;
  const convergence = convergenceAt(
    view,
    loserMatchUpId,
    loserTargetDrawPosition,
    carriedStatus(request.matchUpStatus),
    targets.landingWalk,
    reservation,
  );
  return convergence && loser.converged === convergence.matchUpStatus ? undefined : 'exit';
}

/** RULE 4 where a carrier lands: the matchUp, the carrier's side there, the double exit, and where it produces its exit */
export type Convergence = {
  matchUpId: string;
  sideNumber: 1 | 2;
  matchUpStatus: MatchUpStatusUnion;
  /** the codes v1 writes there: its projection of the matchUp's provenance before the arrival (`deriveStatusCodes`) */
  matchUpStatusCodes: string[];
  /** The pending convergence is a nested score write; an awarded convergence keeps its existing score. */
  score?: Score;
  target?: ProducedTarget;
  /** a landing that links its loser on: the BYEs the double exit places, walked as v1's recursion places them (S6 tail) */
  seats?: OutcomeOp[];
};

// Two RULE 4 rules, kept apart on purpose (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 3).
// `convergenceAt` mirrors `progressExitStatus`: a CARRIED exit arriving where a single exit is AWARDED to the
// carrier's seat, any carried origin standing opposite, written as `setMatchUpState` writes it (`deriveStatusCodes`,
// `scoredTime` stamped). `producedConvergedReason` mirrors `conditionallyAdvanceDrawPosition`'s `existingExit`: a
// PRODUCED exit arriving where a PENDING exit a double exit produced stands with no winner and no positions, written
// as `modifyMatchUpScore` writes it (codes `[]`, no `scoredTime`). The off-diagonal cells are refused by both and are
// v1's: a produced exit onto a carried award (`recordedExitAwaitingThisSeat`; FEED_IN_CHAMPIONSHIP 8, Main 2/1
// WALKOVER carried onto Consolation 2/2, then Consolation 1/2 a DOUBLE_WALKOVER: both abstain `exit`, differential
// clean) and a carried exit onto a pending produced exit (`convergeCarriedExit`). A merge parameterised by the
// arrival would branch at the award, the standing origin, the positions, the seats, the codes, the stamp and the
// score guard.
/**
 * RULE 4 at the matchUp a carrier lands in (`progressExitStatus`), at the first level (S5) or a deeper one (S6 tail): the
 * matchUp holds a single exit (not a retirement) awarded to the carrier's seat, carried in on the other side and on that
 * side alone, with no score value and no loser link of its own. The double exit (`collapseDoubleExitStatus`) produces
 * its exit into a clean next matchUp (`producedTarget`), or, in a structure's last round, nothing
 * (`doubleExitAdvancement` finds no winner target, S6 tail). Undefined otherwise.
 */
export function convergenceAt(
  view: OutcomeView,
  matchUpId: string | undefined,
  drawPosition: number | undefined,
  carried: MatchUpStatusUnion,
  walk?: { own?: ByeWalk; unfillable?: ByeWalk },
  reservation?: RetainedRelayReservation,
): Convergence | undefined {
  const landing = indexed(view, matchUpId);
  const sideNumber = sideOf(landing, drawPosition);
  if (!landing || !sideNumber || landing.winningSide !== sideNumber) return undefined;
  // a landing that links its loser on: its own seat takes the double exit's BYE (the first carrier displaced), planned
  // where the walk of v1's recursion plans it, under `doubleExitPropagateBye` (S6 tail)
  if (landing.loserMatchUpId && (!walk?.own || !view.draw.doubleExitPropagatesBye)) return undefined;
  if (!SINGLE_EXITS.has(landing.matchUpStatus) || landing.matchUpStatus === RETIRED) return undefined;
  if (landing.score?.scoreStringSide1 || landing.score?.scoreStringSide2 || landing.score?.sets?.length)
    return undefined;
  const provenance = landing.sideExitProvenance ?? {};
  if (provenance[sideNumber] || !provenance[3 - sideNumber]?.matchUpStatus) return undefined;
  const matchUpStatus = collapseDoubleExitStatus([carried, landing.matchUpStatus]);
  const ownSeat = landing.loserMatchUpId && walk?.own ? walkChain(walk.own) : undefined;
  const convergence: Convergence = {
    matchUpStatusCodes: deriveStatusCodes(landing),
    matchUpId: landing.matchUpId,
    matchUpStatus,
    sideNumber,
    ...(ownSeat ? { seats: [...ownSeat.assigns, ...ownSeat.writes] } : {}),
  };
  if (!landing.winnerMatchUpId) return convergence;
  // A reservation is built only for this same rebuilt loser convergence; walked convergences have none.
  const target = reservation ? { ...reservation.target, reservation } : producedTarget(view, landing, matchUpStatus);
  // the award's position already gone on into that matchUp: v1 takes it back out as the convergence unseats it, v1's
  const advanced = target?.entry.drawPositions?.some(
    (position) => !!position && landing.drawPositions?.includes(position),
  );
  // the produced exit's matchUp linking its loser on: that seat, which nobody will fill, takes a BYE too
  const targetLinked = !!target?.entry.loserMatchUpId;
  if (targetLinked && (!ownSeat || !walk?.unfillable)) return undefined;
  const unfillable = targetLinked && walk?.unfillable ? walkChain(walk.unfillable) : undefined;
  if (!target || advanced || !producedTargetReason(view, landing, target, targetLinked)) return undefined;
  const seats = [...(convergence.seats ?? []), ...(unfillable ? [...unfillable.assigns, ...unfillable.writes] : [])];
  return { ...convergence, target, ...(seats.length ? { seats } : {}) };
}

/** the double exit RULE 4 writes, the arriving side's entry merged beside the standing one, and what it produces on */
export function convergenceOps(
  view: OutcomeView,
  convergence: Convergence,
  carried: MatchUpStatusUnion,
  sourceMatchUpId?: string,
  previousMatchUpStatus?: MatchUpStatusUnion,
): OutcomeOp[] {
  const { matchUpId, matchUpStatus, matchUpStatusCodes, sideNumber, target } = convergence;
  const provenance = buildCarriedExitProvenance({
    exitingSideNumber: sideNumber,
    matchUpStatus: carried,
    previousMatchUpStatus,
    sourceMatchUpId,
  });
  const score = convergence.score ?? (matchUpStatus === DOUBLE_WALKOVER ? blankScore() : undefined);
  const previousLoser = indexed(view, matchUpId)?.sides?.find((side) => side.sideNumber !== sideNumber)?.participantId;
  const seats = (convergence.seats ?? []).map((op): OutcomeOp => {
    if (op.op !== 'assignBye' || !previousLoser) return op;
    const participant = indexed(view, op.matchUpId)?.sides?.find(
      (side) => side.drawPosition === op.drawPosition,
    )?.participantId;
    return participant === previousLoser ? { ...op, clearsDisplacedPosition: true } : op;
  });
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus,
      removesWinningSide: true,
      // a side whose standing exit a double exit delivered shows its outcome code (S6 tail)
      matchUpStatusCodes,
      // a DOUBLE_WALKOVER says nothing was played, so its score is blanked; a DOUBLE_DEFAULT keeps what stood
      ...(score ? { score, ...(score === blankScore() ? { resetsScore: true as const } : {}) } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    // the BYEs before the exit produced onward, as v1's `doubleExitAdvancement` places them; a displaced carrier's landing
    // is announced last, by the `reconcileScoredTimes` pass that takes its `scoredTime`
    ...unreconciled(seats),
    ...(target ? producedTargetOps(view, target, matchUpId, matchUpStatus) : []),
    ...reconciled(seats),
  ];
}

/** a walk's ops but the writes v1's `reconcileScoredTimes` pass makes, which it announces after everything else */
const unreconciled = (ops: OutcomeOp[]) => ops.filter((op) => !isSettleWrite(op));
const reconciled = (ops: OutcomeOp[]) => ops.filter((op) => isSettleWrite(op));

/** what a produced convergence reads beyond its view: the draw, the landing's view on the cursor, and the program before it */
export type ConvergedContext = { drawDefinition?: DrawDefinition; landing?: LandingView; prefix?: OutcomeOp[] };

type ProducedConvergence = {
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
    linked && !view.draw.doubleExitPropagatesBye
      ? pendingConvergence(view, sourceSeatFrame(view, request), request, source, context)
      : undefined;
  if (linked && !view.draw.doubleExitPropagatesBye && !pending) return undefined;
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
  if (!onward || !producedTargetReason(view, landing, onward, onwardLinked && view.draw.doubleExitPropagatesBye))
    return undefined;
  const seat = targets.onwardLoserSeat;
  const onwardBye = onwardLinked ? unfillableByeChain(view, onward.entry, { seat, levels: seat?.levels }) : undefined;
  if (onwardLinked && !onwardBye) return undefined;
  return apart({ ...planned, onward, onwardBye });
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
  if (!landing.loserMatchUpId || view.draw.doubleExitPropagatesBye) return { ops: [], touched: [] };
  const prefix = [
    ...(context.prefix ?? []),
    ...(pending ? convergedWrite(view, pending) : []),
    ...convergedWrite(view, { landing, matchUpStatus, provenance }),
  ];
  const frame = { phase: 'reentry' as const, matchUpId: landing.matchUpId, cascadeStatus: matchUpStatus, prefix };
  return landingLoserLink(frame, context.landing);
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

/**
 * A convergence's write and what it produces on, the one writer of both RULE 4 cells that `modifyMatchUpScore` writes
 * (ruling 3 keeps their decisions apart). The defaults are the produced arrival's; a pending exit converged under the
 * policy off (`handleEmptyExitLoser`) states its own provenance, retained codes, score removal and withdrawals.
 */
type ConvergedWrite = Pick<ProducedConvergence, 'landing' | 'matchUpStatus' | 'onward' | 'onwardBye'> & {
  /** what is merged beside the provenance standing there */
  provenance?: SideExitProvenance;
  /** v1's `retainPolicyCodes`; none by default */
  matchUpStatusCodes?: string[];
  /** `removeScore`: the score reset whatever the double exit; by default a DOUBLE_WALKOVER's alone */
  resetsScore?: boolean;
  /** the converged matchUp's own advancement taken back before it produces on (`withdrawOwnAdvancement`) */
  withdrawn?: OutcomeOp[];
  /** a re-entered landing's loser link, served before it produces on (DEA:316 before :417) */
  reentered?: OutcomeOp[];
  /** the converged matchUp's loser link, served after its produced exit (`serveConvergedLoserLink`, DEA:767–775) */
  loserLinkOps?: OutcomeOp[];
};

function convergedWrite(view: OutcomeView, planned: ConvergedWrite): OutcomeOp[] {
  const { landing, matchUpStatus, provenance, onward, onwardBye } = planned;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: landing.matchUpId,
      matchUpStatus,
      removesWinningSide: true,
      matchUpStatusCodes: planned.matchUpStatusCodes ?? [],
      stampsScoredTime: false,
      ...(planned.resetsScore || matchUpStatus === DOUBLE_WALKOVER
        ? { resetsScore: true, score: toBePlayed.score }
        : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: landing.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
    ...(planned.withdrawn ?? []),
    ...(planned.reentered ?? []),
    // the onward matchUp's unfillable seat is served before its produced exit is written (`conditionallyAdvanceDrawPosition`)
    ...(onwardBye ? [...onwardBye.assigns, ...onwardBye.writes] : []),
    ...(onward ? producedTargetOps(view, onward, landing.matchUpId, matchUpStatus) : []),
    ...(planned.loserLinkOps ?? []),
  ];
}

type PendingConvergence = ConvergedWrite & { touched: string[] };

/**
 * 1b, the off-diagonal cell (ruling 3: its own rule): under `doubleExitPropagateBye: false` a double exit's loser seat
 * meets the pending exit an earlier double exit produced on its loser matchUp, with nobody in it. v1 converges it there
 * (`handleLoserMatchUp` → `handleEmptyExitLoser`, DEA:646–781): the collapsed double exit written by `modifyMatchUpScore`
 * (`removeScore`, codes retained, no winner), the arriving side's carried origin merged beside the provenance standing
 * there, then its own produced exit (`advanceConvergedWinner`, on the collapsed status), then its loser link
 * (`serveConvergedLoserLink`). Planned where each step takes v1's plain branch; refused, each at its own line, where v1
 * takes another or where v2 does not reproduce a read.
 */
function pendingConvergence(
  view: OutcomeView,
  frame: SeatFrame,
  request: OutcomeRequest,
  source: HydratedMatchUp,
  context: ConvergedContext,
): PendingConvergence | undefined {
  const { cascadeStatus, lineage } = frame;
  const { drawDefinition } = context;
  const pending = indexed(view, frame.seat.at?.matchUpId);
  const seat = view.targets.loserTargetSeat;
  const drawPosition = frame.seat.at?.drawPosition;
  if (!pending || !seat || !drawPosition || !drawDefinition) return undefined;
  // the FIRST_MATCHUP gate (DEA:290–313) is not certified here
  if (frame.seat.linkCondition) return undefined;
  // a BYE on the seat: reclaimed (DEA:86–121) or settled (DEA:483); a fed seat takes a BYE (DEA:449)
  if (seat.bye || pending.hasFedDrawPosition) return undefined;
  // the empty exit (DEA:163): a single exit with nobody in it, produced by a double exit beside this one
  const empty = !pending.sides?.some((side) => side.participantId || side.participant);
  if ((pending.matchUpStatus !== WALKOVER && pending.matchUpStatus !== DEFAULTED) || !empty) return undefined;
  // the request's spread (F6): a format, or a stored default's process codes, are not written here
  if (request.matchUpFormat || pending.processCodes?.length) return undefined;
  // codes v1 attributes from what it retains: only none is certified
  if (retainPolicyCodes(pending).length || pending.matchUpStatusCode || pending.sideStatusCodes) return undefined;
  // a loser matchUp in the source's structure could be read by the landing's convergence
  if (pending.structureId === source.structureId) return undefined;
  // the arriving side, read structurally as v1 reads it (0 where the position is absent: no entry is built)
  const exitingSideNumber =
    getDrawPositionSideNumber({
      matchUp: { ...pending, sides: undefined },
      structureId: pending.structureId,
      drawDefinition,
      drawPosition,
    }) ?? 0;
  const matchUpStatus = collapseDoubleExitStatus([cascadeStatus, pending.matchUpStatus]);
  const converged: PendingConvergence = {
    landing: pending,
    matchUpStatus,
    provenance: {
      ...getSideExitProvenance({ matchUp: pending }),
      ...buildCarriedExitProvenance({ ...lineage, matchUpStatus: cascadeStatus, exitingSideNumber }),
    },
    matchUpStatusCodes: [],
    resetsScore: true,
    touched: [pending.matchUpId],
  };
  // a final produces nothing (`advanceConvergedWinner` finds no winner target)
  const advanced = pending.winnerMatchUpId ? convergedWinner(view, converged, drawDefinition) : converged;
  if (!advanced || !pending.loserMatchUpId) return advanced;
  // then its loser link (`serveConvergedLoserLink`, DEA:767–775), on the status this frame was handed (DEA:773), its
  // dispatch reading the frame's params channel: the call's entry, or after a decided result's removal its re-read
  const reread = view.existing.winningSide
    ? context.landing?.(context.prefix ?? [], pending.matchUpId, cascadeStatus)?.working.inContextDrawMatchUps
    : view.inContextDrawMatchUps;
  const served = reread
    ? landingLoserLink(
        {
          phase: 'landing-converged',
          matchUpId: pending.matchUpId,
          prefix: [...(context.prefix ?? []), ...convergedWrite(view, advanced)],
          paramsChannel: reread,
          cascadeStatus,
        },
        context.landing,
      )
    : undefined;
  if (!served) return undefined;
  return { ...advanced, loserLinkOps: served.ops, touched: [...advanced.touched, ...served.touched] };
}

/**
 * The converged matchUp's produced exit (`advanceConvergedWinner` → `conditionallyAdvanceDrawPosition`, on the collapsed
 * status): its own positions taken back out of the next matchUp first (DEA:976), then the exit written there pending.
 * Refused where a stale advance is taken back too (DEA:1003), where that matchUp links its loser on (the BYE on its loser
 * seat, DEA:1050–1063), or where the pending write is not clean.
 */
function convergedWinner(
  view: OutcomeView,
  converged: PendingConvergence,
  drawDefinition: DrawDefinition,
): PendingConvergence | undefined {
  const { landing, matchUpStatus } = converged;
  const target = producedTarget(view, landing, matchUpStatus);
  if (!target) return undefined;
  const { entry } = target;
  // F3: the BYE on that matchUp's own loser seat, placed whatever the policy (DEA:1050–1063)
  if (entry.loserMatchUpId) return undefined;
  // in a feed round the awarded side is the fed seat, whose position stands for the participant fed from another
  // structure: it is not the converged matchUp's own advancement, so DEA:976 leaves it (the reservation is certified below)
  const fedSeat = target.feed
    ? entry.sides?.find((side) => side.sideNumber === target.awardedSide)?.drawPosition
    : undefined;
  const held = (entry.drawPositions ?? []).filter((position): position is number => !!position && position !== fedSeat);
  const own = held.filter((position) => landing.drawPositions?.includes(position));
  if (own.length !== held.length) return undefined;
  const withdrawn = own.length
    ? releaseWalk({
        inContextDrawMatchUps: view.inContextDrawMatchUps ?? [],
        propagatesBye: !!view.draw.doubleExitPropagatesBye,
        fromRoundNumber: entry.roundNumber as number,
        structureId: entry.structureId,
        drawPositions: own,
        drawDefinition,
      })
    : [];
  if (!withdrawn) return undefined;
  // the next matchUp as the produced exit finds it, its positions taken back
  const released = own.length
    ? {
        ...entry,
        drawPositions: [],
        sides: entry.sides?.map((side) =>
          own.includes(side.drawPosition as number) ? { ...side, drawPosition: undefined } : side,
        ),
      }
    : entry;
  const onward = { ...target, entry: released as HydratedMatchUp };
  if (!producedTargetReason(view, landing, onward)) return undefined;
  const touched = [
    ...converged.touched,
    entry.matchUpId,
    ...withdrawn.flatMap((op) =>
      op.op === 'setMatchUpDrawPositions' && op.matchUpId !== entry.matchUpId ? [op.matchUpId] : [],
    ),
  ];
  return { ...converged, withdrawn, onward, touched };
}

/** a convergence's writes: the landing as the double exit, the arriving side's entry, and the exit it produces */
export function convergedOps(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  loser?: DirectionPlan['loser'],
  reservation?: RetainedRelayReservation,
) {
  const { loserMatchUpId, loserTargetDrawPosition } = view.targets;
  const carried = carriedStatus(request.matchUpStatus);
  const convergence =
    loser?.arrives && loser.converged
      ? convergenceAt(view, loserMatchUpId, loserTargetDrawPosition, carried, view.targets.landingWalk, reservation)
      : undefined;
  if (!convergence) return [];
  return convergenceOps(view, convergence, carried, request.matchUpId, write.matchUpStatus as MatchUpStatusUnion);
}

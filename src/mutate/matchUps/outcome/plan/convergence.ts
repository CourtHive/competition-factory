import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { BLANK_SCORE, SINGLE_EXITS, carriedStatus, indexed, isSettleWrite, sideOf } from './planShared';
import { producedTarget, producedTargetOps, producedTargetReason } from './producedTarget';
import { ownByeChain, unfillableByeChain, walkChain } from './byeChain';
import { isDoubleExit } from '@Validators/isExit';
import {
  buildCarriedExitProvenance,
  buildSideExitProvenance,
  collapseDoubleExitStatus,
  deriveStatusCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { AbstainReason, ByeWalk, DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView } from '../types';
import type { ProducedTarget, RetainedRelayReservation } from './producedTarget';
import { DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
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
  const score = convergence.score ?? (matchUpStatus === DOUBLE_WALKOVER ? BLANK_SCORE : undefined);
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus,
      // a side whose standing exit a double exit delivered shows its outcome code (S6 tail)
      ...(matchUpStatusCodes.length ? { matchUpStatusCodes } : {}),
      // a DOUBLE_WALKOVER says nothing was played, so its score is blanked; a DOUBLE_DEFAULT keeps what stood
      ...(score ? { score, ...(score === BLANK_SCORE ? { resetsScore: true as const } : {}) } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    // the BYEs before the exit produced onward, as v1's `doubleExitAdvancement` places them; a displaced carrier's landing
    // is announced last, by the `reconcileScoredTimes` pass that takes its `scoredTime`
    ...unreconciled(convergence.seats ?? []),
    ...(target ? producedTargetOps(view, target, matchUpId, matchUpStatus) : []),
    ...reconciled(convergence.seats ?? []),
  ];
}

/** a walk's ops but the writes v1's `reconcileScoredTimes` pass makes, which it announces after everything else */
const unreconciled = (ops: OutcomeOp[]) => ops.filter((op) => !isSettleWrite(op));
const reconciled = (ops: OutcomeOp[]) => ops.filter((op) => isSettleWrite(op));

type ProducedConvergence = {
  /** this matchUp's own loser seat: a BYE and its chain, placed first (`handleLoserMatchUp`) */
  own?: ByeChain;
  /** the onward matchUp's loser seat, which its produced exit leaves unfillable: a BYE and its chain */
  onwardBye?: ByeChain;
  landing: HydratedMatchUp;
  /** the side the double exit feeds, which takes its origin beside the one standing there */
  fedSide: 1 | 2;
  matchUpStatus: MatchUpStatusUnion;
  /** where the converged double exit produces in turn: none from a final */
  onward?: ProducedTarget;
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
): ProducedConvergence | undefined {
  const { targets } = view;
  const converged = direction?.converged;
  const source = indexed(view, request.matchUpId);
  const linked = !!targets.loserLink || !!targets.loserMatchUpId;
  // with loser links, the BYEs they take (`doubleExitPropagateBye`; off, the seats show exits: v1's)
  if (!converged || !source || (linked && !view.draw.doubleExitPropagatesBye)) return undefined;
  // the own seat as the chain's shapes plan it, or as the view's walk of v1's recursion places it (S6 tail)
  const walkedOwn = view.targets.byeWalk?.own;
  const own = linked ? (ownByeChain(view) ?? (walkedOwn ? walkChain(walkedOwn) : undefined)) : undefined;
  if (linked && !own) return undefined;
  const target = producedTarget(view, source, write.matchUpStatus as MatchUpStatusUnion);
  const landing = target?.entry;
  if (!target || !landing || target.feed || landing.matchUpId !== converged.matchUpId) return undefined;
  if (!SINGLE_EXITS.has(landing.matchUpStatus) || landing.matchUpStatus === RETIRED || landing.winningSide)
    return undefined;
  if (landing.matchUpStatusCodes?.length || landing.score?.scoreStringSide1) return undefined;
  // the landing's own loser seat took its BYE when the first exit was produced there: nothing more is written to it.
  // Under `doubleExitPropagateBye: false` that BYE gives way to the convergence's produced exit (`serveConvergedLoserLink`)
  const landingSeat = targets.winnerLoserSeat;
  const landingLinked = !!landing.loserMatchUpId;
  if (landingLinked && (!view.draw.doubleExitPropagatesBye || landingSeat?.matchUpId !== landing.loserMatchUpId))
    return undefined;
  if (landingLinked && !landingSeat?.seat?.bye) return undefined;
  if ((landing.drawPositions ?? []).some(Boolean)) return undefined;
  const provenance = landing.sideExitProvenance ?? {};
  const standing = provenance[target.awardedSide];
  if (provenance[target.fedSide] || !standing || !isDoubleExit(standing.previousMatchUpStatus)) return undefined;
  const matchUpStatus = collapseDoubleExitStatus([write.matchUpStatus, landing.matchUpStatus]);
  if (matchUpStatus !== converged.matchUpStatus) return undefined;
  const planned = { own, landing, fedSide: target.fedSide, matchUpStatus };
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

/** a convergence touching any matchUp twice is v1's */
function apart(planned: ProducedConvergence): ProducedConvergence | undefined {
  const touched = [
    ...(planned.own?.matchUpIds ?? []),
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
) {
  const planned = producedConvergedReason(view, request, write, direction);
  if (!planned) return [];
  const { own, landing, fedSide, matchUpStatus, onward, onwardBye } = planned;
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
    sourceMatchUpId: request.matchUpId,
    sourceSideNumber: fedSide,
  });
  const ops: OutcomeOp[] = [
    ...(own ? [...own.assigns, ...own.writes] : []),
    {
      op: 'setMatchUpResult',
      matchUpId: landing.matchUpId,
      matchUpStatus,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(matchUpStatus === DOUBLE_WALKOVER ? { resetsScore: true, score: toBePlayed.score } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: landing.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
    // the onward matchUp's unfillable seat is served before its produced exit is written (`conditionallyAdvanceDrawPosition`)
    ...(onwardBye ? [...onwardBye.assigns, ...onwardBye.writes] : []),
    ...(onward ? producedTargetOps(view, onward, landing.matchUpId, matchUpStatus) : []),
  ];
  return ops;
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

import { relabelCarryReason, withdrawnReason } from './carriedExit';
import { isDoubleExit } from '@Validators/isExit';
import {
  DIRECTED_STATUSES,
  LINE_SCORE,
  LOCAL_ROUTES,
  LOCAL_STATUSES,
  cleanWinnerTarget,
  pendingProducedArrival,
  plainByeArrival,
  directedBothSides,
  directsElsewhere,
  standingAwardArrival,
  storedLoserId,
} from './planShared';

// constants and types
import type { AbstainReason, DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView, Route } from '../types';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * The detectors of the plain shapes (S3, S4): a first direction, a plain loser arrival, a FIRST_MATCHUP reservation or
 * kept-out loser, a cleared result taken back, the same winner re-entered, a changed winner, a swap, and values applied
 * beneath an active downstream.
 */

export function localReason({ route, write }: { route?: Route; write?: MatchUpWrite }): AbstainReason | undefined {
  if (!route || !write || !LOCAL_ROUTES.has(route)) return 'route';
  if (!LOCAL_STATUSES.has(write.matchUpStatus)) return 'route';
  return undefined;
}

/**
 * A loser fed across a link joins the first direction only as a plain arrival: placed on a free seat, carrying
 * nothing, into a matchUp holding no result, exit or BYE beside it. The FMLC feed into round 2 is included: the seat
 * `positionTargets` reports is the one `directLoser` takes (no FIRST_MATCHUP test file in the suite differs, 2026-10-26).
 */
export function plainLoserReason(view: OutcomeView, direction: DirectionPlan): AbstainReason | undefined {
  const { targets } = view;
  const loser = direction.loser;
  if (!loser && !targets.loserMatchUpId) return undefined;
  if (loser?.bye && !loser.arrives) return keptOutReason(view, loser.bye);
  // a carried exit reaches here only as `exitReason` admits it (`carriedReason`), a convergence (`convergedReason`)
  if (loser?.arrives && loser.converged) return undefined;
  if (!loser?.arrives || loser.converged || loser.carriedPast || loser.bye || loser.withdrawn) return 'loser';
  if (targets.byeTarget) return 'loser';
  if (!targets.loserStructureId || !targets.loserTargetDrawPosition || !targets.loserTargetSeat?.free) return 'loser';
  // v1's `propagateLoserSeed` writes a seeded loser's seed into the structure they are placed in: not an op yet
  if (loser.participantId && targets.seededParticipantIds?.includes(loser.participantId)) return 'loser';
  // a carried exit standing there, awarded to the seat the loser takes: they take it and go on (C18)
  if (targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit)
    return standingAwardArrival(view, loser) ? undefined : 'cascade';
  // opposite a BYE the loser goes on at once: planned when the matchUp they go on into is clean (`loserThroughBye`), or a
  // carried exit's loser goes on through the BYE-held matchUps past it (`loserByePassage`, S6 tail)
  if (
    targets.loserTargetSeat.opponentBye &&
    !targets.loserThroughBye &&
    !(loser.exit && targets.loserByePassage) &&
    !plainByeArrival(view, loser)
  )
    return 'cascade';
  return undefined;
}

// One of the four FIRST_MATCHUP reservation readers kept apart by ruling 9 (see `standingReservationSeat` in
// `standingReservation.ts`): any BYE on the fed seat is nothing to place, as v1's `assignDrawPositionBye` no-ops on
// any BYE.
/**
 * A loser an FMLC feed keeps out (they have won before) leaves a BYE on the seat they would have taken, as v1's
 * `directLoser` places it. Planned on the seat the link feeds when it is already that BYE (a reservation placed it) or is
 * free in a matchUp nobody else is in and that holds no result or exit; anything else is v1's.
 */
function keptOutReason(
  view: OutcomeView,
  bye: { structureId: string; drawPosition: number },
): AbstainReason | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  if (targets.loserStructureId !== bye.structureId || targets.loserTargetDrawPosition !== bye.drawPosition || !seat)
    return 'loser';
  if (seat.bye) return undefined;
  if (!seat.free || seat.opponentHeld || targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit)
    return 'cascade';
  return undefined;
}

/**
 * A FIRST_MATCHUP reservation is planned only as a seat filled with a BYE in a matchUp nobody else is in: a reservation
 * the view could not plan, or one this call's own loser would meet (placed in the same consolation matchUp), is v1's.
 */
function reservationReason(view: OutcomeView, winningSide: 1 | 2): boolean {
  const reservation = view.targets.reservations?.[winningSide];
  if (reservation?.kind === 'abstain') return true;
  if (reservation?.kind !== 'reserve') return false;
  const { loserStructureId, loserTargetDrawPosition } = view.targets;
  return (
    loserStructureId === reservation.structureId &&
    !!loserTargetDrawPosition &&
    (reservation.drawPositions.includes(loserTargetDrawPosition) ||
      loserTargetDrawPosition === reservation.drawPosition)
  );
}

// Three "a direction taken back" rules are kept apart on purpose (Mentat
// assessment/2026-11-07-outcome-refactor-debates.md, ruling 10). This one and `resultRemovalReason` (`plan.ts`) will
// share the op builder but not their walls: this route walls `tallied` as `tallied && !group` with a dual exempt from
// `link`, the other as `group || tallied` with no exemption, and the two name `link` and `tallied` in opposite order,
// so one reason would move the `abstain:<reason>` tally. `pendingAwardRemoval` (`unwindPath.ts`) is v1's
// `removeDoubleExit` through `removeDirectedWinner` with no record: it edits `winningSide` on a matchUp holding an
// award, which both removals here refuse (`cascade`), announces with no tournament, and leaves a propagated BYE on
// the fed seat where these empty a participant. Verified: a COMPLETED feeder cleared under a standing award
// (SINGLE_ELIMINATION 8) and a loser's seat emptied under a carried award (FEED_IN_CHAMPIONSHIP 8, policy off) both
// abstain `cascade` here; v1 drops the first award and keeps the second's `winningSide` over the empty seat.
/**
 * A cleared result's direction taken back, planned only where all it directed is the winner's position in a clean next
 * matchUp of the same structure, and the loser, if a link took them, on the seat it fed in a matchUp they have not
 * played (`removedLoserReason`): nothing across a winner link, no FIRST_MATCHUP reservation the draw may hold, and the
 * next matchUp `TO_BE_PLAYED` with no BYE, exit, carry or result. Anything else is v1's (S4).
 */
export function removalReason(view: OutcomeView, direction?: DirectionPlan): AbstainReason | undefined {
  const { targets, existing } = view;
  if (direction) return 'loser';
  const loserReason = removedLoserReason(view);
  if (loserReason) return loserReason;
  // a BYE-only target beside a playoff link (FMLC with a playoff): v1 takes back the BYE it placed there (`removeDirectedBye`)
  if (targets.byeTarget) return 'loser';
  const target = targets.winner;
  if (!target) return targets.winnerLink ? 'link' : undefined;
  return cleanWinnerTarget(view, target, existing.winningSide as 1 | 2);
}

/**
 * A loser a cleared result had placed across a link, taken back out (v1's `removeDirectedLoser`): planned only where they
 * still hold the seat the link fed, in a matchUp they have not played, with nobody gone on through a BYE beside them, no
 * exit or provenance there, and no codes but none or an empty list (which v1 re-derives as `[]`). Not a FIRST_MATCHUP
 * link, whose removal may take a BYE back too.
 */
function removedLoserReason(view: OutcomeView): AbstainReason | undefined {
  const { targets } = view;
  if (!targets.loserMatchUpId && !targets.loserLink) return undefined;
  if (!targets.loserMatchUpId || targets.loserLink?.linkCondition) return 'loser';
  const loserId = storedLoserId(view);
  const seat = targets.loserTargetSeat;
  if (!loserId || !targets.loserStructureId || !targets.loserTargetDrawPosition || seat?.participantId !== loserId)
    return 'loser';
  if (seat.opponentBye || targets.loserMatchUpStatus !== TO_BE_PLAYED) return 'cascade';
  if (targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit) return 'cascade';
  const record = targets.loserMatchUpRecord;
  if (!record || record.provenance || record.matchUpStatusCodes?.length) return 'provenance';
  return undefined;
}

/**
 * The same winner entered again where nothing downstream is active. v1 runs its direction once more
 * (`attemptToSetWinningSide` → `directParticipants`), and each placement finds its participant where the first entry put
 * them. Planned only where that is all there is: the winner held in a clean next matchUp of the same structure (or a
 * final), and the loser, if the link takes one, on the seat it feeds, in a matchUp holding no result or exit. Anything
 * else is v1's (S4).
 */
export function reenteredReason(
  view: OutcomeView,
  write?: MatchUpWrite,
  direction?: DirectionPlan,
): AbstainReason | undefined {
  const { targets } = view;
  // S6: a single exit that carried nothing is re-entered as a played result is. A status that changes is refreshed on
  // the arrivals the first entry sent on (v1's `refreshArrivals`), and an arrival records it only beside a double
  // exit's produced exit, where the target carries an exit (`cascade` below)
  if (!directedBothSides(view, write)) return 'route';
  if (directsElsewhere(direction)) return 'route';
  const loser = direction?.loser;
  if (loser || targets.loserMatchUpId) {
    const seat = targets.loserTargetSeat;
    if (!loser?.arrives || loser.bye || loser.carriedPast || loser.converged) return 'loser';
    if (!seat || seat.participantId !== loser.participantId || seat.opponentBye) return 'loser';
    if (loser.withdrawn) {
      const withdrawn = withdrawnReason(view, loser.withdrawn);
      if (withdrawn) return withdrawn;
    } else if ((targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit) && !targets.loserMatchUpCarryHeld)
      return 'cascade'; // but this matchUp's own carry, standing alone, which `relabelCarryReason` vets (S6 tail)
    const carry = loser.exit && write ? relabelCarryReason(view, write) : undefined;
    if (carry) return carry;
  }
  const target = targets.winner;
  if (!target) return targets.winnerLink || direction?.winner ? 'link' : undefined;
  return cleanWinnerTarget(view, target, write.winningSide as 1 | 2);
}

/**
 * A played result's winner changed while nothing downstream is active (the `winner` route, the other side). v1 takes
 * back what the old result directed (`removeDirectedParticipants`) and directs the new one (`directParticipants`), so it
 * is planned where both halves are clean: the old direction as a removal would take it back (`removalReason`), and the
 * new winner into the same next matchUp, the new loser onto the seat the old one leaves, carrying nothing. Anything else
 * is v1's (S4). S6: either result may be a single exit that carries nothing on (`correctedSingleExit`).
 */
export function changedWinnerReason(
  view: OutcomeView,
  write?: MatchUpWrite,
  direction?: DirectionPlan,
): AbstainReason | undefined {
  const { targets } = view;
  if (!directedBothSides(view, write)) return 'route';
  if (directsElsewhere(direction)) return 'route';
  const removal = removalReason(view);
  if (removal) return removal;
  if (targets.winner ? !direction?.winner : direction?.winner) return 'route';
  if (!targets.loserMatchUpId) return undefined;
  const loser = direction?.loser;
  if (!loser?.arrives || loser.exit || loser.bye || loser.carriedPast || loser.withdrawn || loser.converged)
    return 'loser';
  // v1's `propagateLoserSeed` writes a seeded loser's seed into the structure they are placed in: not an op yet
  if (!loser.participantId || targets.seededParticipantIds?.includes(loser.participantId)) return 'loser';
  return undefined;
}

/**
 * A swap (`allowChangePropagation` with the other side winning) is a relabel, v1's `swapWinnerLoser`: in the source
 * structure the two positions are exchanged in every later round that holds either, a decided matchUp's winner carried
 * across the re-sort, and nothing is placed or removed. Planned where that is all there is: a played result before and
 * after, a structure with no link out of it (so nothing downstream is relabelled and no FIRST_MATCHUP feed reconciled),
 * and no exit or exit provenance on the path. Anything else is v1's (S4).
 */
export function swapReason(view: OutcomeView, write?: MatchUpWrite): AbstainReason | undefined {
  const swap = view.targets.swap;
  if (!write?.winningSide || !DIRECTED_STATUSES.has(write.matchUpStatus)) return 'route';
  if (!DIRECTED_STATUSES.has(view.existing.matchUpStatus)) return 'route';
  if (!swap) return 'route';
  if (swap.linkedOut && !swap.relabels) return 'link';
  if (swap.pathCarriesExit) return 'cascade';
  return undefined;
}

/**
 * The values written beneath an active downstream: a played result, nothing directed; or a single exit (S6 tail), the
 * loser's carry settled where they stand (`relabelledExit`), nobody placed
 */
export function applyValuesReason({
  write,
  direction,
}: {
  write?: MatchUpWrite;
  direction?: DirectionPlan;
}): AbstainReason | undefined {
  if (!write || !DIRECTED_STATUSES.has(write.matchUpStatus)) return 'route';
  if (direction?.winner || direction?.produced || direction?.converged || direction?.decider) return 'route';
  return undefined;
}

/** a first entry naming a winner, whose direction is the winner's position in the next matchUp and nothing else */
export function directionReason(args: {
  request: OutcomeRequest;
  view: OutcomeView;
  route?: Route;
  write?: MatchUpWrite;
  direction?: DirectionPlan;
}): AbstainReason | undefined {
  const { view, route, write, direction } = args;
  const { targets } = view;
  // a single exit reaches here only as `exitReason` admits it: directed as a played result
  // a TEAM line that un-decides its dual (`line-score`) directs nothing of its own either: the dual's removal is its
  // dual call's (`undecidingLineOps`, S7)
  if (route === LINE_SCORE && view.line && !direction) return undefined;
  if (route !== 'winner' || !write || !DIRECTED_STATUSES.has(write.matchUpStatus) || !write.winningSide) return 'route';
  // a final: the winner has nowhere to go (no winner target or winner link, so no winner direction); only a loser
  // link may take the loser
  const final = !targets.winner && !targets.winnerLink && !!direction && !direction.winner;
  // an ad hoc matchUp directs nothing: its winner goes nowhere and it has no loser link (planDirection plans none)
  if (view.draw.isAdHoc && view.group?.adHoc && !direction && !targets.winner && !targets.loserMatchUpId)
    return undefined;
  // nor does a lucky draw's pre-feed round: v1 advances no one from it (`directParticipants`), the advancement is chosen
  // later (`luckyDrawAdvancement`)
  if (targets.luckyPreFeed && !direction && !targets.loserMatchUpId) return undefined;
  // nor does a TEAM line: its result reaches the draw through its dual's tally, which `teamReason` vetted (S7). Its
  // targets are its dual's (a line takes the dual's positions), and `planDirection` directs no line
  if (view.line && !direction) return undefined;
  if (!direction?.winner && !final) return 'route';
  // S6: a double exit given a winner unwinds first (`givenWinnerReason`): the next matchUp held only its produced exit,
  // and is to be played again when the winner arrives; the loser's seat, freed of the double exit's BYE, was vetted there
  const unwound = isDoubleExit(view.existing.matchUpStatus);
  const loserReason = unwound ? undefined : plainLoserReason(view, direction);
  if (loserReason) return loserReason;
  if (direction.decider || direction.produced || direction.converged) return 'route';
  if (final) return undefined;
  const target = targets.winner;
  if (!target || target.structureId !== targets.source.structureId) return 'link';
  if (reservationReason(view, write.winningSide as 1 | 2)) return 'cascade';
  // C19: the produced exit pending in this winner's target is awarded as the winner arrives.
  if (!unwound && pendingProducedArrival(view, write)) return undefined;
  // a target holding a BYE sends the winner on past it: planned when where they go is clean (`winnerThroughBye`)
  const through = target.hasBye ? targets.winnerThroughBye?.[write.winningSide as 1 | 2] : undefined;
  // an unwound call's next matchUp is on the unwind's path, written back to be played before the winner arrives: a
  // result it holds (an award the unwind releases) is taken back with it
  if ((target.hasBye && !through) || (target.holdsResult && !unwound)) return 'cascade';
  if (!unwound && (target.carriesExit || target.carriedStatuses.length)) return 'cascade';
  // a target generated with no status (LUCKY_DRAW, adaptive) is written TO_BE_PLAYED by v1 as the winner arrives
  if (target.matchUpStatus !== TO_BE_PLAYED && !through && !unwound) return 'route';
  if (!targets.sideDrawPositions[write.winningSide as 1 | 2]) return 'route';
  return undefined;
}

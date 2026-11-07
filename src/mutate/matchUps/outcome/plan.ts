import { convergedOps, convergedReason, convergenceAt, convergenceOps } from './plan/convergence';
import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import { producedAwardWriteOps, producedExitOps, producedReason } from './plan/producedExit';
import { getSideStatusCode } from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { getCapturedClock, writeLegacyEnabled } from '@Global/state/globalState';
import { notesReason, scheduleOps, scheduleReason } from './plan/schedulePlan';
import { ensuredDualSides } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { firstRoundFeedersWon } from '@Query/matchUp/firstRoundFeedersWon';
import { autoCalcWrite, resultOps, writtenScore } from './plan/resultOps';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { groupTally, writtenLine } from './plan/tallyOps';
import { withFinishingOrder } from './finishingOrderOps';
import { producedTarget } from './plan/producedTarget';
import { doubleExitSeatOps } from './plan/byeChain';
import { unwindWalk } from './unwindWalk';
import {
  APPLY_VALUES,
  BLANK_SCORE,
  CLEAR_SCORE,
  DIRECTED_STATUSES,
  DOUBLE_EXIT,
  LINE_SCORE,
  LOCAL_ROUTES,
  LOCAL_STATUSES,
  REMOVE_DIRECTED,
  RESULT_TO_DOUBLE_EXIT,
  SINGLE_EXITS,
  carriedStatus,
  changesWinner,
  hasRetainedRelay,
  heldInTarget,
  indexed,
  onwardFrom,
  pairedFeeder,
  positionsOf,
  reentersWinner,
  relabelsWhereWinnerStands,
  removesDirection,
  satisfiedDoubleExit,
  scoreless,
  seatBye,
  seatKey,
  sideOf,
  storedLoserId,
  structureStamps,
  undecided,
  unplaced,
  unwoundClean,
} from './plan/planShared';
import {
  buildCarriedExitProvenance,
  buildSideExitProvenance,
  collapseDoubleExitStatus,
  deriveStatusCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { DrawDefinition, MatchUpStatusUnion, Score, SideExitProvenance, Tournament } from '@Types/tournamentTypes';
import { FIRST_MATCH_LOSER_CONSOLATION, FIRST_MATCHUP, LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import type { ProducedTarget, RetainedRelayReservation } from './plan/producedTarget';
import type { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import { LINEUPS } from '@Constants/extensionConstants';
import type { Convergence } from './plan/convergence';
import type { LineUp } from '@Types/factoryTypes';
import type { OutcomeOp } from './ops';
import type {
  AbstainReason,
  ByePassage,
  CarryLevel,
  DirectionPlan,
  DualCall,
  ExitReasonArgs,
  MatchUpWrite,
  OutcomePlan,
  OutcomeRequest,
  OutcomeView,
  PlanArgs,
  RebuildView,
  Route,
  ThroughBye,
  WinnerLoserSeat,
  WithdrawnCarry,
} from './types';
import {
  BYE,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * The outcome pipeline, v2: `planOutcome`, the plan as ops behind a fail-closed allowlist (executor plan § 3.7, S1).
 *
 * A plan is COMPLETE only when every write the call makes is an op v2 holds. Otherwise `planOutcome` ABSTAINS, naming
 * why, and the call stays v1's whole (F1 (a), fail-closed). S1 writes nothing: a complete plan is shadow-applied in
 * `differential` and compared with what v1 wrote (`shadow.ts`). The allowlist grows by slice; each reason below is a
 * shape a later slice takes on, and the abstention tally (`abstain:<reason>`) is the work list.
 *
 * S1 holds two shapes, both without an exit, without anything the score write clears or attributes, and without a
 * tally:
 *  - the LOCAL write: the matchUp's own result is the only write, with no winner before or after;
 *  - the FIRST DIRECTION: a played result naming a winner where none stood, whose only consequence is the winner's
 *    drawPosition in the next matchUp of the same structure (no loser link, nothing waiting there to send them on).
 */

function localReason({ route, write }: { route?: Route; write?: MatchUpWrite }): AbstainReason | undefined {
  if (!route || !write || !LOCAL_ROUTES.has(route)) return 'route';
  if (!LOCAL_STATUSES.has(write.matchUpStatus)) return 'route';
  return undefined;
}

/**
 * A loser fed across a link joins the first direction only as a plain arrival: placed on a free seat, carrying
 * nothing, into a matchUp holding no result, exit or BYE beside it. The FMLC feed into round 2 is included: the seat
 * `positionTargets` reports is the one `directLoser` takes (no FIRST_MATCHUP test file in the suite differs, 2026-10-26).
 */
function plainLoserReason(view: OutcomeView, direction: DirectionPlan): AbstainReason | undefined {
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
  if (targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit) return 'cascade';
  // opposite a BYE the loser goes on at once: planned when the matchUp they go on into is clean (`loserThroughBye`), or a
  // carried exit's loser goes on through the BYE-held matchUps past it (`loserByePassage`, S6 tail)
  if (targets.loserTargetSeat.opponentBye && !targets.loserThroughBye && !(loser.exit && targets.loserByePassage))
    return 'cascade';
  return undefined;
}

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

/**
 * A cleared result's direction taken back, planned only where all it directed is the winner's position in a clean next
 * matchUp of the same structure, and the loser, if a link took them, on the seat it fed in a matchUp they have not
 * played (`removedLoserReason`): nothing across a winner link, no FIRST_MATCHUP reservation the draw may hold, and the
 * next matchUp `TO_BE_PLAYED` with no BYE, exit, carry or result. Anything else is v1's (S4).
 */
function removalReason(view: OutcomeView, direction?: DirectionPlan): AbstainReason | undefined {
  const { targets, existing } = view;
  if (direction) return 'loser';
  const loserReason = removedLoserReason(view);
  if (loserReason) return loserReason;
  // a BYE-only target beside a playoff link (FMLC with a playoff): v1 takes back the BYE it placed there (`removeDirectedBye`)
  if (targets.byeTarget) return 'loser';
  const target = targets.winner;
  if (!target) return targets.winnerLink ? 'link' : undefined;
  if (target.structureId !== targets.source.structureId) return 'link';
  if (target.hasBye || target.carriesExit || target.carriedStatuses.length || target.holdsResult) return 'cascade';
  if (target.matchUpStatus !== TO_BE_PLAYED) return 'route';
  if (!heldInTarget(view, existing.winningSide as 1 | 2)) return 'route';
  return undefined;
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
function reenteredReason(
  view: OutcomeView,
  write?: MatchUpWrite,
  direction?: DirectionPlan,
): AbstainReason | undefined {
  const { targets } = view;
  if (!write?.winningSide || !DIRECTED_STATUSES.has(write.matchUpStatus)) return 'route';
  // S6: a single exit that carried nothing is re-entered as a played result is. A status that changes is refreshed on
  // the arrivals the first entry sent on (v1's `refreshArrivals`), and an arrival records it only beside a double
  // exit's produced exit, where the target carries an exit (`cascade` below)
  if (!DIRECTED_STATUSES.has(view.existing.matchUpStatus)) return 'route';
  if (direction?.decider || direction?.produced || direction?.converged) return 'route';
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
  if (target.structureId !== targets.source.structureId) return 'link';
  if (target.hasBye || target.carriesExit || target.carriedStatuses.length || target.holdsResult) return 'cascade';
  if (target.matchUpStatus !== TO_BE_PLAYED) return 'route';
  if (!heldInTarget(view, write.winningSide as 1 | 2)) return 'route';
  return undefined;
}

/**
 * A played result's winner changed while nothing downstream is active (the `winner` route, the other side). v1 takes
 * back what the old result directed (`removeDirectedParticipants`) and directs the new one (`directParticipants`), so it
 * is planned where both halves are clean: the old direction as a removal would take it back (`removalReason`), and the
 * new winner into the same next matchUp, the new loser onto the seat the old one leaves, carrying nothing. Anything else
 * is v1's (S4). S6: either result may be a single exit that carries nothing on (`correctedSingleExit`).
 */
function changedWinnerReason(
  view: OutcomeView,
  write?: MatchUpWrite,
  direction?: DirectionPlan,
): AbstainReason | undefined {
  const { targets, existing } = view;
  if (!write?.winningSide || !DIRECTED_STATUSES.has(write.matchUpStatus)) return 'route';
  if (!DIRECTED_STATUSES.has(existing.matchUpStatus)) return 'route';
  if (direction?.decider || direction?.produced || direction?.converged) return 'route';
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
function swapReason(view: OutcomeView, write?: MatchUpWrite): AbstainReason | undefined {
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
function applyValuesReason({
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
function directionReason(args: {
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

/**
 * S5: an exit is planned only as a single WALKOVER, DEFAULTED or RETIRED entered with a winner on a matchUp that holds
 * no result, whose loser carries nothing on: `propagateExitStatus` off, or on with nothing to carry (no loser link, or a
 * retirement the policy does not propagate). v1 then directs it as a played result (`directParticipants`): the winner
 * goes on, the loser crosses their link plainly, and the arrival records no provenance in a target outside the exit
 * cascade (`assignMatchUpDrawPosition`'s `participatesInExitCascade` gate). The direction's own checks follow
 * (`directionReason`). A DEFAULTED under a scoring policy's `incompleteAssignmentsOnDefault` writes `processCodes`
 * (`modifyMatchUpScore`), not an op. Anything else with an exit before or after is v1's.
 */
function exitReason(args: ExitReasonArgs): AbstainReason | undefined {
  const { request, view, route, write, direction } = args;
  const { existing } = view;
  if (!isAnyExit(request.matchUpStatus) && !isAnyExit(existing.matchUpStatus) && !isAnyExit(write?.matchUpStatus))
    return undefined;
  if (route === DOUBLE_EXIT) return producedReason(view, request, direction, write);
  if (satisfiedDoubleExit(view, request, route)) return undefined;
  if (route === 'winner' && isDoubleExit(existing.matchUpStatus)) return givenWinnerReason(args);
  if (route === CLEAR_SCORE && isDoubleExit(existing.matchUpStatus))
    return write?.matchUpStatus === TO_BE_PLAYED &&
      !direction &&
      unwoundPath(view, request.matchUpId, args.drawDefinition, true, true)
      ? undefined
      : 'exit';
  if (clearedSingleExit(view, route, write)) return undefined;
  if (correctedSingleExit(args)) return undefined;
  if (route === APPLY_VALUES || route === 'swap') return relabelledExit(args) ? undefined : 'exit';
  // a TEAM line's own single exit (S7): the line directs nothing of the draw's; v1 writes it as a line result, and what
  // it does to the dual is the dual's own call (`decidingLineOps`, `undecidingLineOps`)
  if (view.line) return lineExitReason(view, write);
  if (route !== 'winner' || !write?.winningSide || !SINGLE_EXITS.has(write.matchUpStatus)) return 'exit';
  if (request.matchUpStatus !== write.matchUpStatus) return 'exit';
  if (existing.matchUpStatus !== TO_BE_PLAYED || existing.winningSide) return 'exit';
  if (write.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes) return 'exit';
  const loser = direction?.loser;
  if (direction?.produced || direction?.converged || direction?.decider) return 'exit';
  if (loser?.carriedPast || loser?.withdrawn) return 'exit';
  if (loser?.converged) return convergedReason(view, request, write, loser);
  if (loser?.exit) return carriedReason(view, write);
  return undefined;
}

/**
 * S7: a TEAM line's own single exit (WALKOVER, DEFAULTED, RETIRED), deciding its dual (`winner`) or un-deciding a dual
 * decided before (`line-score`: its lines, with this one, project no winner). The line is written as v1 writes a line
 * result, with the exit's status and its winner; nothing of the draw is directed by a line, and the dual's part is the
 * dual's own call. Only a fresh line's single exit reaches here: a line's exit cleared or corrected is read before
 * (`clearedSingleExit`, `correctedSingleExit`), and `teamReason` keeps v1's every line not to be played. Stays v1's: a
 * DEFAULTED under a scoring policy's process codes (v1 writes the codes on the line).
 */
function lineExitReason(view: OutcomeView, write?: MatchUpWrite): AbstainReason | undefined {
  return write?.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes ? 'exit' : undefined;
}

/**
 * S6: a double exit given a winner (the `winner` route, a single exit or a played result). v1 first unwinds the double
 * exit as a clear does (`removeDoubleExit`: the produced exit taken back and the path to the final written back to be
 * played, `unwoundPath`, and the BYEs it placed on loser seats withdrawn), then writes the result and directs it as a
 * played result, the winner into the next matchUp the unwind left to be played (`unwoundOps`, then the direction).
 * Planned where the unwind leaves no convergence re-derived: the produced exit pending, or awarded and released as the
 * clear releases it (S7), and the loser, where a link takes them, placed on the seat the unwind has just freed
 * (`unwoundLoserReason`). The direction's own checks follow
 * (`directionReason`, which reads the next matchUp as the unwind leaves it).
 */
function givenWinnerReason(args: ExitReasonArgs): AbstainReason | undefined {
  const { request, view, write, direction } = args;
  if (!write?.winningSide || !DIRECTED_STATUSES.has(write.matchUpStatus)) return 'exit';
  if (request.matchUpStatus && request.matchUpStatus !== write.matchUpStatus) return 'exit';
  if (write.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes) return 'exit';
  if (direction?.produced || direction?.converged || direction?.decider) return 'exit';
  if (standaloneBareWinnerOps(args) || standaloneCarriedWinnerOps(args)) return undefined;
  const standing = standingReservationPrograms(args);
  const levels = unwoundPath(view, request.matchUpId, args.drawDefinition, false, false, standing);
  // a convergence the unwind dissolves: the winner then lands beside the re-derived pending exit and is awarded it, v1's
  if (!levels || levels.some(({ rederived }) => rederived)) return terminalOccupiedWinnerOps(args) ? undefined : 'exit';
  // The actual own seat program is empty: v1's reservation check never withdraws this BYE.
  if (standing) return undefined;
  // no loser link out of the call's matchUp (CURTIS_CONSOLATION's first round of 8): the unwind's seat writes are the
  // produced exit's seat's alone, applied as the clear applies them, and the winner is directed as any (S7)
  if (!view.targets.loserMatchUpId && !view.targets.loserLink && !direction?.loser) return undefined;
  // a loser placed opposite a standing BYE goes on through it: planned only where the matchUp they go on into is read as
  // the unwind leaves it (`unwoundThrough`: cleared, the passage's landing, the last round, or a chain of BYEs to it)
  const { loserTargetSeat, loserThroughBye, loserByePassage } = view.targets;
  // the loser carrying their own exit onto the seat the unwind frees: the carry planned on the draw as the unwind leaves
  // it (`unwoundCarryReason`)
  if (direction?.loser?.exit) return unwoundCarryReason(args, direction.loser);
  if (direction?.loser?.converged) return unwoundConvergedReason(args);
  const unwound = levels.flatMap(({ seatOps }) => seatOps);
  if (hasRetainedRelay(unwound)) {
    const after = unwoundView(args, { releasedLandings: true });
    if (after?.direction?.loser?.converged) return unwoundConvergedReason(args);
  }
  if (
    direction?.loser?.arrives &&
    loserTargetSeat?.opponentBye &&
    !loserThroughBye &&
    !loserByePassage?.through &&
    !unwoundThrough(view, unwound)
  )
    return 'exit';
  return unwoundLoserReason(
    view,
    levels[0],
    direction?.loser,
    direction?.loser?.bye ? unwoundView(args)?.view : undefined,
  );
}

/**
 * The loser of a double exit given a winner, where a link takes them: v1's unwind withdraws the BYE the double exit
 * placed on the seat that link feeds (`unwoundSeatOps`), and the direction then places the loser there, a plain
 * arrival opposite whoever the unwind leaves (no BYE: `unwoundSeatOps` plans none beside it). Planned where the loser
 * arrives carrying nothing, unseeded, behind a link with no condition. The seat as stored still holds the BYE, so
 * `plainLoserReason`'s seat checks do not apply (`directionReason`).
 */
function unwoundLoserReason(
  view: OutcomeView,
  own: UnwoundLevel,
  loser?: DirectionPlan['loser'],
  after?: OutcomeView,
): AbstainReason | undefined {
  const { targets } = view;
  if (unwoundKeptOutOps(view, own.seatOps, loser, after)) return undefined;
  if (!loser?.arrives || loser.exit || loser.converged || loser.carriedPast || loser.bye || loser.withdrawn)
    return 'exit';
  if (!targets.loserStructureId || !targets.loserTargetDrawPosition) return 'exit';
  const freed = own.seatOps.some(
    (op) =>
      op.op === 'withdrawBye' &&
      op.structureId === targets.loserStructureId &&
      op.drawPosition === targets.loserTargetDrawPosition,
  );
  // A conditioned loser link here is FIRST_MATCHUP; round two's direction proved zero qualifying wins. The own
  // unwind must still certify the marked BYE withdrawal or the policy-off branch below. Other rounds remain v1's.
  if (targets.loserLink?.linkCondition && targets.loserMatchUpRoundNumber !== 2) return 'exit';
  // under `doubleExitPropagateBye: false` the seat held no BYE: the unwind wrote its matchUp back to be played instead
  // (`unwoundBranch`), and the loser arrives there as plainly (S6 tail)
  // (or, the seat opposite a generated BYE, rewrote that BYE matchUp as it took back the carry sent past it: `unwoundPassage`)
  const branched =
    !view.draw.doubleExitPropagatesBye &&
    own.seatOps.some((op) => op.op === 'setMatchUpResult' && op.matchUpId === targets.loserMatchUpId);
  if (!branched && (!freed || !targets.loserTargetSeat?.bye)) return 'exit';
  if (targets.seededParticipantIds?.includes(loser.participantId)) return 'loser';
  return undefined;
}

/** v1's standing FIRST_MATCHUP reservation is an actual empty own-seat program, only for this winner route. */
function standingReservationPrograms({
  view,
  request,
  route,
}: Pick<PlanArgs, 'view' | 'request' | 'route'>): Map<number, OutcomeOp[]> | undefined {
  if (
    route !== 'winner' ||
    (request.winningSide !== 1 && request.winningSide !== 2) ||
    view.isTeam ||
    view.group ||
    view.drawType !== FIRST_MATCH_LOSER_CONSOLATION
  )
    return undefined;
  const source = indexed(view, request.matchUpId);
  const seats = view.targets.unwindLoserSeats;
  const own = seats?.[0];
  if (
    !source ||
    source.roundNumber !== 2 ||
    !isDoubleExit(source.matchUpStatus) ||
    source.winningSide ||
    Object.keys(source.sideExitProvenance ?? {}).length ||
    own?.matchUpId !== source.matchUpId ||
    !own.loserSeat ||
    seats?.slice(1).some((level) => level.loserSeat)
  )
    return undefined;
  if (!standingReservationFeeders(view, source) || !standingReservationSeat(view, source, own.loserSeat))
    return undefined;
  return new Map([[0, []]]);
}

/** Exact two live first-round winners, then the unmodified canonical reservation predicate. */
function standingReservationFeeders(view: OutcomeView, source: HydratedMatchUp): boolean {
  const drawPositions = positionsOf(source);
  const sides = source.sides?.filter((side) => !!side.participantId && !side.bye && !side.qualifier) ?? [];
  if (drawPositions.length !== 2 || new Set(drawPositions).size !== 2 || source.sides?.length !== 2) return false;
  if (
    ![1, 2].every((number) => sides.filter((side) => side.sideNumber === number).length === 1) ||
    !drawPositions.every((position) => sides.filter((side) => side.drawPosition === position).length === 1)
  )
    return false;
  const matchUps = (view.inContextDrawMatchUps ?? []).filter((matchUp) => matchUp.structureId === source.structureId);
  const feeders = matchUps.filter(
    (matchUp) => matchUp.roundNumber === 1 && positionsOf(matchUp).some((position) => drawPositions.includes(position)),
  );
  if (!firstRoundFeedersWon({ matchUps, drawPositions })) return false;
  return sides.every((side) => {
    const feeding = feeders.filter((feeder) => positionsOf(feeder).includes(side.drawPosition as number));
    if (feeding.length !== 1) return false;
    const feeder = feeding[0];
    const winner = feeder.sides?.find((candidate) => candidate.sideNumber === feeder.winningSide);
    return (
      feeder.winnerMatchUpId === source.matchUpId &&
      winner?.drawPosition === side.drawPosition &&
      winner?.participantId === side.participantId
    );
  });
}

/** The original untouched reservation and its already-standing advance, across a distinct structure. */
function standingReservationSeat(view: OutcomeView, source: HydratedMatchUp, seat: WinnerLoserSeat): boolean {
  const home = indexed(view, seat.matchUpId);
  const { targets } = view;
  if (
    targets.loserLink?.linkCondition !== FIRST_MATCHUP ||
    targets.loserMatchUpRoundNumber !== 2 ||
    source.loserMatchUpId !== seat.matchUpId ||
    targets.loserMatchUpId !== seat.matchUpId ||
    targets.loserTargetDrawPosition !== seat.drawPosition ||
    targets.loserStructureId !== seat.structureId ||
    !seat.seat?.bye ||
    !seat.seat.byeFromPropagation ||
    seat.seat.opponentBye
  )
    return false;
  if (
    !home ||
    home.structureId !== seat.structureId ||
    home.structureId === source.structureId ||
    home.matchUpStatus !== BYE ||
    home.winningSide ||
    !scoreless(home) ||
    home.matchUpStatusCodes?.length ||
    Object.keys(home.sideExitProvenance ?? {}).length ||
    home.loserMatchUpId
  )
    return false;
  const positions = positionsOf(home);
  if (!positions.includes(seat.drawPosition) || Math.min(...positions) !== seat.drawPosition || positions.length > 2)
    return false;
  const opposite = positions.filter((position) => position !== seat.drawPosition);
  const held = home.sides?.find((side) => side.drawPosition === opposite[0]);
  if (opposite.length && (!held?.participantId || held.bye || held.qualifier)) return false;
  const next = indexed(view, home.winnerMatchUpId);
  return (
    !!next &&
    next.structureId === home.structureId &&
    next.roundNumber === 3 &&
    !next.winningSide &&
    next.matchUpStatus === TO_BE_PLAYED &&
    unwoundClean(next, new Set()) &&
    !next.loserMatchUpId &&
    JSON.stringify(positionsOf(next)) === JSON.stringify(opposite)
  );
}

/** A FIRST_MATCHUP loser kept out by a qualifying win restores the BYE its own unwind withdrew. */
function unwoundKeptOutOps(
  view: OutcomeView,
  program: OutcomeOp[],
  loser?: DirectionPlan['loser'],
  after?: OutcomeView,
): OutcomeOp[] | undefined {
  const { targets } = view;
  const bye = loser?.bye;
  if (targets.priorWinsBefore[1] > 0 && targets.priorWinsBefore[2] > 0) return undefined;
  // planLoser's sole BYE constructor already proves !arrives and FIRST_MATCHUP into round two.
  if (!bye) return undefined;
  if (bye.structureId !== targets.loserStructureId || bye.drawPosition !== targets.loserTargetDrawPosition)
    return undefined;
  const home = indexed(view, targets.loserMatchUpId);
  if (
    !home ||
    home.matchUpStatus !== BYE ||
    home.winningSide ||
    !scoreless(home) ||
    home.matchUpStatusCodes?.length ||
    Object.keys(home.sideExitProvenance ?? {}).length ||
    home.loserMatchUpId
  )
    return undefined;
  const freed = program.some(
    (op) => op.op === 'withdrawBye' && op.structureId === bye.structureId && op.drawPosition === bye.drawPosition,
  );
  const clear = program.some(
    (op) =>
      op.op === 'clearMatchUpBye' &&
      op.matchUpId === home.matchUpId &&
      op.drawPosition === bye.drawPosition &&
      !op.rederived,
  );
  if (!freed || !clear || !after) return undefined;
  const folded = indexed(after, home.matchUpId);
  const seat = after.targets.loserTargetSeat;
  if (
    !folded ||
    folded.matchUpStatus !== TO_BE_PLAYED ||
    folded.winningSide ||
    !unwoundClean(folded, new Set()) ||
    !seat?.free ||
    seat.byeFromPropagation ||
    JSON.stringify(positionsOf(folded)) !== JSON.stringify(positionsOf(home))
  )
    return undefined;
  const seated = seatBye({ ...bye, matchUpId: home.matchUpId });
  const opposite = positionsOf(home).filter((position) => position !== bye.drawPosition);
  if (!opposite.length) return seated;
  const next = indexed(view, home.winnerMatchUpId);
  const opponent = home.sides?.find((side) => side.drawPosition === opposite[0]);
  if (!opponent?.participantId || opponent.bye || opponent.qualifier) return undefined;
  if (
    opposite.length !== 1 ||
    !next ||
    next.structureId !== home.structureId ||
    next.matchUpStatus !== TO_BE_PLAYED ||
    next.winningSide ||
    !scoreless(next) ||
    Object.keys(next.sideExitProvenance ?? {}).length ||
    next.matchUpStatusCodes?.length
  )
    return undefined;
  const released = program.some(
    (op) =>
      op.op === 'setMatchUpDrawPositions' &&
      op.matchUpId === next.matchUpId &&
      op.releasedDrawPosition === opposite[0] &&
      op.drawPositions.length === 0,
  );
  if (!released || positionsOf(next).length !== 1 || positionsOf(next)[0] !== opposite[0]) return undefined;
  const landing = indexed(after, next.matchUpId);
  const held = folded.sides?.find((side) => side.drawPosition === opposite[0]);
  if (
    !landing ||
    landing.matchUpStatus !== TO_BE_PLAYED ||
    !unwoundClean(landing, new Set()) ||
    positionsOf(landing).length ||
    held?.participantId !== opponent.participantId ||
    held.bye ||
    held.qualifier
  )
    return undefined;
  return [
    ...seated,
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: positionsOf(next),
      advancesThroughBye: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

/**
 * S7: a double exit given a single exit whose loser carries it across their link (`propagateExitStatus`), onto the seat
 * the unwind has just freed of the double exit's BYE (or, under `doubleExitPropagateBye: false`, in the matchUp the
 * unwind wrote back to be played). v1 directs the loser against the draw as its unwind leaves it, and the carry lands
 * there as a fresh carry lands (`progressExitStatus`: RULES 1 to 3, then each further level). So the unwind's ops are
 * folded into a working view, read again as an outcome view with the direction re-planned (`rebuild`), and the carry is
 * planned on that view on a fresh carry's terms (`plainLoserReason`: the seat free, so a seat the unwind did not free
 * still holds its BYE and refuses, a seeded loser; `carriedReason`: the landing); `planOps` writes it from the same view
 * (`unwoundView`). Stays v1's: a loser behind a link condition, a carry the re-planned direction reads as anything but a
 * fresh carry (converged with a re-derived exit), and whatever a fresh carry's own checks keep v1's.
 */
function unwoundCarryReason(
  args: ExitReasonArgs,
  loser: NonNullable<DirectionPlan['loser']>,
): AbstainReason | undefined {
  const { view, write } = args;
  const { targets } = view;
  if (!loser.arrives || !write) return 'exit';
  if (targets.loserLink?.linkCondition || !targets.loserStructureId || !targets.loserTargetDrawPosition) return 'exit';
  const after = unwoundView(args);
  if (!after?.direction?.loser?.exit) return 'exit';
  return plainLoserReason(after.view, after.direction) ?? carriedReason(after.view, write);
}

/**
 * S7: the loser's carry meets the carry the unwind brought home. Read RULE 4 against the rebuilt view: the BYE is
 * gone, its matchUp re-derived to the standing carry, and the relay it produces into is left as the unwind wrote it.
 * Everything a fresh convergence refuses stays v1's, including an occupied seat or an unclean produced target.
 */
function unwoundConvergedReason(args: ExitReasonArgs): AbstainReason | undefined {
  const { view, request, write } = args;
  if (view.targets.loserLink?.linkCondition) return 'exit';
  const after = unwoundView(args, { releasedLandings: true });
  const loser = after?.direction?.loser;
  if (!after || !loser?.converged) return 'exit';
  const superseded = supersededOwnRelayConvergence(args, after);
  return superseded
    ? undefined
    : convergedReason(after.view, request, write as MatchUpWrite, loser, retainedRelayReservation(args, after));
}

/** The old produced origin passes through this landing and occupies the same side of its next matchUp. */
function supersededRelayOrigin(view: OutcomeView, home: HydratedMatchUp, target: ProducedTarget) {
  const origins = Object.entries(home.sideExitProvenance ?? {});
  if (origins.length !== 1) return undefined;
  const [side, origin] = origins[0];
  const foreign = indexed(view, origin.sourceMatchUpId);
  if (!foreign || !isDoubleExit(foreign.matchUpStatus) || Object.keys(foreign.sideExitProvenance ?? {}).length)
    return undefined;
  const produced = producedTarget(view, foreign, foreign.matchUpStatus);
  if (produced?.entry.matchUpId !== home.matchUpId || String(produced.fedSide) !== side) return undefined;
  if (origin.matchUpStatus !== produced.matchUpStatus || origin.previousMatchUpStatus !== foreign.matchUpStatus)
    return undefined;
  const entry = indexed(view, target.entry.matchUpId);
  if (!entry || Object.keys(entry.sideExitProvenance ?? {}).length !== 1) return undefined;
  if (JSON.stringify(entry.sideExitProvenance?.[target.fedSide]) !== JSON.stringify(origin)) return undefined;
  return { origin, side };
}

/** Original own propagated BYE, actually withdrawn, then a genuine convergence superseding its stale relay. */
function supersededOwnRelayConvergence(
  args: ExitReasonArgs,
  after: NonNullable<ReturnType<RebuildView>>,
): Convergence | undefined {
  const { view, request, write } = args;
  if (view.isTeam || view.group) return undefined;
  if (
    !write?.winningSide ||
    write.matchUpStatusCodes?.length ||
    !after.direction?.loser?.arrives ||
    !SINGLE_EXITS.has(request.matchUpStatus ?? '') ||
    request.matchUpStatus === RETIRED
  )
    return undefined;
  const seat = view.targets.loserTargetSeat;
  const home = indexed(view, view.targets.loserMatchUpId);
  const landing = indexed(after.view, home?.matchUpId);
  const position = view.targets.loserTargetDrawPosition;
  if (!seat?.bye || !seat.byeFromPropagation || home?.matchUpStatus !== BYE || !landing || !position) return undefined;
  const own = unwoundOps(view, request, 'winner', args.drawDefinition).seatPrograms[0];
  if (
    !own?.some((op) => op.op === 'withdrawBye' && op.structureId === home.structureId && op.drawPosition === position)
  )
    return undefined;
  const clear = own.find(
    (op) =>
      op.op === 'clearMatchUpBye' &&
      op.matchUpId === home.matchUpId &&
      op.drawPosition === position &&
      op.rederived?.matchUpStatus === landing.matchUpStatus,
  );
  const sideNumber = sideOf(landing, position);
  if (
    !clear ||
    !sideNumber ||
    landing.winningSide ||
    landing.loserMatchUpId ||
    !scoreless(landing) ||
    landing.matchUpStatusCodes?.length ||
    landing.sideStatusCodes ||
    !after.view.targets.loserTargetSeat?.free ||
    after.view.targets.loserTargetSeat.opponentBye
  )
    return undefined;
  const matchUpStatus = collapseDoubleExitStatus([carriedStatus(request.matchUpStatus), landing.matchUpStatus]);
  if (after.direction?.loser?.converged !== matchUpStatus) return undefined;
  const target = producedTarget(after.view, landing, matchUpStatus);
  if (!target || target.feed) return undefined;
  const retained = supersededRelayOrigin(view, home, target);
  if (!retained || JSON.stringify(landing.sideExitProvenance) !== JSON.stringify(home.sideExitProvenance))
    return undefined;
  if (retained.side !== String(3 - sideNumber)) return undefined;
  const original = indexed(view, target.entry.matchUpId);
  const entry = target.entry;
  if (
    !original ||
    JSON.stringify(original.sideExitProvenance) !== JSON.stringify(entry.sideExitProvenance) ||
    (['winningSide', 'score', 'matchUpStatusCodes', 'sideStatusCodes', 'schedule'] as const).some(
      (key) => JSON.stringify(original[key]) !== JSON.stringify(entry[key]),
    ) ||
    original.matchUpStatus !== entry.matchUpStatus ||
    JSON.stringify(original.drawPositions) !== JSON.stringify(entry.drawPositions)
  )
    return undefined;
  if (
    entry.matchUpStatus !== retained.origin.matchUpStatus ||
    entry.winningSide ||
    !unplaced(entry) ||
    !scoreless(entry)
  )
    return undefined;
  if (
    entry.matchUpStatusCodes?.length ||
    entry.sideStatusCodes ||
    entry.loserMatchUpId ||
    entry.sides?.some((side) => side.bye || side.qualifier || side.participantId)
  )
    return undefined;
  const paired = after.view.inContextDrawMatchUps?.find(
    (matchUp) =>
      matchUp.structureId === landing.structureId &&
      matchUp.roundNumber === landing.roundNumber &&
      matchUp.roundPosition === (landing.roundPosition! % 2 ? landing.roundPosition! + 1 : landing.roundPosition! - 1),
  );
  if (
    !paired ||
    paired.winnerMatchUpId !== entry.matchUpId ||
    paired.matchUpStatus !== TO_BE_PLAYED ||
    !unwoundClean(paired, new Set())
  )
    return undefined;
  return {
    matchUpId: landing.matchUpId,
    sideNumber,
    matchUpStatus,
    matchUpStatusCodes: deriveStatusCodes(landing),
    score: BLANK_SCORE,
    target,
  };
}

/** The shared removeDoubleExit program has no actual source clear/result in it. */
function standaloneIndirectRemoval(args: PlanArgs) {
  const { view, request, write, drawDefinition } = args;
  const structureId = view.targets.source.structureId;
  if (!structureId || args.route !== 'winner' || !args.rebuild || !drawDefinition || view.isTeam || view.group)
    return undefined;
  if (!isDoubleExit(view.existing.matchUpStatus) || !write?.winningSide) return undefined;
  if (request.score || request.matchUpFormat || request.carries?.schedule || request.carries?.notes !== undefined)
    return undefined;
  const unwind = unwoundOps(view, request, CLEAR_SCORE, drawDefinition);
  if (unwind.ops.some((op) => op.op === 'setMatchUpDrawPositions' && op.withdrawsPendingAward)) return undefined;
  const own = unwind.seatPrograms[0];
  const clear = own?.find(
    (op): op is Extract<OutcomeOp, { op: 'clearMatchUpBye' }> =>
      op.op === 'clearMatchUpBye' &&
      op.matchUpId === view.targets.loserMatchUpId &&
      !!indirectRelayReset(view, op, own),
  );
  const reset = clear && indirectRelayReset(view, clear, own);
  if (!clear || !reset) return undefined;
  const after = args.rebuild(unwind.ops, 'winner');
  const direction = after?.direction;
  if (!after || !direction?.winner || direction.produced || direction.converged || direction.decider) return undefined;
  return { unwind, clear, reset, after, structureId };
}

/** The bare winner's ordinary arrivals after its certified shared removal. */
function standaloneBareWinnerOps(args: PlanArgs): OutcomeOp[] | undefined {
  const { request, write, view, drawDefinition } = args;
  if (write?.matchUpStatus !== COMPLETED || !write.winningSide || request.matchUpStatus || !drawDefinition)
    return undefined;
  const removal = standaloneIndirectRemoval(args);
  if (!removal) return undefined;
  const { unwind, clear, reset, after, structureId } = removal;
  const direction = after.direction as DirectionPlan;
  const loser = direction.loser;
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
  if (!standaloneArrivalStands(after.view, args, direction)) return undefined;
  const placement = standaloneBareArrival(after.view, clear, reset, loser);
  if (!placement) return undefined;
  return [
    ...unwind.ops,
    ...resultOps(request, write, request.matchUpId as string),
    ...winnerPlacementOps(after.view, 'winner', write, direction.winner),
    ...placement,
    ...unwind.reannounced,
    ...producedRelayAfterOps(view, unwind.ops, undefined, unwind.seatPrograms),
    ...structureStamps([...unwind.ops, ...placement], structureId),
    { op: 'stampUpdatedAt', entity: 'structure', id: structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  ];
}

/** A free canonical arrival, without an unmodelled seed, conditioned link, BYE or reservation. */
function standaloneArrivalStands(view: OutcomeView, args: PlanArgs, direction: DirectionPlan): boolean {
  const target = view.targets;
  if (!target.loserTargetSeat?.free || target.loserLink?.linkCondition || target.loserTargetSeat.opponentBye)
    return false;
  if (target.seededParticipantIds?.includes(direction.loser?.participantId as string)) return false;
  const reservation = target.reservations?.[args.write?.winningSide as 1 | 2];
  if (reservation?.kind === 'reserve' || reservation?.kind === 'abstain') return false;
  return !directionReason({ ...args, view, direction });
}

/** A real carried exit meets the exact pending foreign origin; it was never temporarily awarded. */
function standaloneCarriedWinnerOps(args: PlanArgs): OutcomeOp[] | undefined {
  const { request, write, view, drawDefinition } = args;
  if (
    (request.matchUpStatus !== WALKOVER && request.matchUpStatus !== DEFAULTED) ||
    write?.matchUpStatus !== request.matchUpStatus ||
    !drawDefinition
  )
    return undefined;
  if (write.matchUpStatusCodes?.length || request.matchUpStatusCodes?.length) return undefined;
  const removal = standaloneIndirectRemoval(args);
  if (!removal) return undefined;
  const { unwind, clear, reset, after, structureId } = removal;
  const direction = after.direction as DirectionPlan;
  const loser = direction.loser;
  if (!loser?.arrives || !loser.participantId || !loser.converged) return undefined;
  if (!standaloneArrivalStands(after.view, args, direction)) return undefined;
  const convergence = standalonePendingConvergence(
    after.view,
    clear,
    reset,
    loser.converged,
    request.matchUpStatus,
    request.matchUpId,
  );
  if (!convergence) return undefined;
  const produced = standaloneFreshProducedAward(after.view, convergence.relay, convergence.status, reset);
  if (!produced) return undefined;
  const relayOps = convergenceOps(
    after.view,
    convergence.plan,
    request.matchUpStatus,
    request.matchUpId,
    request.matchUpStatus,
  ).map((op): OutcomeOp =>
    op.op === 'setMatchUpResult' && op.matchUpId === clear.matchUpId ? { ...op, score: BLANK_SCORE } : op,
  );
  const arrival = arrivalOps(after.view, loser);
  return [
    ...unwind.ops,
    ...resultOps(request, write, request.matchUpId as string),
    ...winnerPlacementOps(after.view, 'winner', write, direction.winner),
    ...arrival,
    ...relayOps,
    ...produced,
    ...unwind.reannounced,
    ...producedRelayAfterOps(view, unwind.ops, undefined, unwind.seatPrograms),
    ...structureStamps([...unwind.ops, ...arrival, ...relayOps, ...produced], structureId),
    { op: 'stampUpdatedAt', entity: 'structure', id: structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  ];
}

/** Pending RULE 4, tied to the same certified original relay and actual onward reset. */
function standalonePendingConvergence(
  view: OutcomeView,
  clear: Extract<OutcomeOp, { op: 'clearMatchUpBye' }>,
  reset: Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }>,
  expected: MatchUpStatusUnion,
  carried: MatchUpStatusUnion,
  sourceId?: string,
) {
  const relay = indexed(view, clear.matchUpId);
  const position = view.targets.loserTargetDrawPosition;
  const side = sideOf(relay, position);
  if (!relay || !side || position !== clear.drawPosition || relay.winnerMatchUpId !== reset.matchUpId) return undefined;
  if (
    relay.winningSide ||
    relay.score ||
    relay.loserMatchUpId ||
    relay.matchUpStatus !== clear.rederived?.matchUpStatus
  )
    return undefined;
  const provenance = relay.sideExitProvenance ?? {};
  if (Object.keys(provenance).length !== 1 || provenance[side] || !carriedExitStatus(provenance[3 - side]))
    return undefined;
  const status = collapseDoubleExitStatus([carried, relay.matchUpStatus]);
  if (status !== expected) return undefined;
  const source = indexed(view, sourceId);
  if (!source) return undefined;
  if (
    [1, 2].some(
      (sideNumber) =>
        getSideStatusCode({ matchUp: source, sideNumber }) || getSideStatusCode({ matchUp: relay, sideNumber }),
    )
  )
    return undefined;
  const plan: Convergence = {
    matchUpId: relay.matchUpId,
    matchUpStatus: status,
    sideNumber: side,
    matchUpStatusCodes: deriveStatusCodes(relay),
  };
  return { relay, status, plan };
}

/** A fresh product is awarded to its real canonical paired winner, then that participant advances. */
function standaloneFreshProducedAward(
  view: OutcomeView,
  source: HydratedMatchUp,
  status: MatchUpStatusUnion,
  reset: Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }>,
): OutcomeOp[] | undefined {
  const target = producedTarget(view, source, status);
  if (!target || target.feed || target.entry.matchUpId !== reset.matchUpId) return undefined;
  const entry = target.entry;
  if (
    entry.matchUpStatus !== TO_BE_PLAYED ||
    entry.winningSide ||
    entry.loserMatchUpId ||
    !unwoundClean(entry, new Set())
  )
    return undefined;
  if (JSON.stringify(positionsOf(entry)) !== JSON.stringify(reset.drawPositions)) return undefined;
  const awarded = entry.sides?.find((side) => side.sideNumber === target.awardedSide);
  if (!awarded?.participantId || !awarded.drawPosition || positionsOf(entry).length !== 1 || awarded.bye)
    return undefined;
  const paired = pairedFeeder(view, source);
  if (
    !paired ||
    paired.winnerMatchUpId !== entry.matchUpId ||
    (paired.matchUpStatus !== WALKOVER && paired.matchUpStatus !== DEFAULTED)
  )
    return undefined;
  const winner = paired.sides?.find((side) => side.sideNumber === paired.winningSide);
  if (winner?.participantId !== awarded.participantId || winner.drawPosition !== awarded.drawPosition) return undefined;
  if (!scoreless(paired) || paired.matchUpStatusCodes?.length) return undefined;
  const onward = onwardFrom(view, entry, awarded.drawPosition);
  if (!onward) return undefined;
  const provenance = buildSideExitProvenance({
    sourceMatchUpId: source.matchUpId,
    sourceMatchUpStatus: status,
    sourceSideNumber: target.fedSide,
    pairedMatchUpId: paired.matchUpId,
    pairedMatchUpStatus: paired.matchUpStatus,
  });
  return producedAwardWriteOps(entry.matchUpId, target.matchUpStatus, target.awardedSide, provenance, onward);
}

/** Award the foreign exit on assignment, then advance into the certified released seat. */
function standaloneBareArrival(
  view: OutcomeView,
  clear: Extract<OutcomeOp, { op: 'clearMatchUpBye' }>,
  reset: Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }>,
  loser: NonNullable<DirectionPlan['loser']>,
): OutcomeOp[] | undefined {
  const relay = indexed(view, clear.matchUpId);
  const next = indexed(view, reset.matchUpId);
  const position = view.targets.loserTargetDrawPosition;
  const side = sideOf(relay, position);
  if (!relay || !next || !position || !side || position !== clear.drawPosition) return undefined;
  const status = clear.rederived?.matchUpStatus;
  if (!status || relay.winningSide || relay.score || relay.matchUpStatus !== status) return undefined;
  if (next.matchUpStatus !== TO_BE_PLAYED || !unwoundClean(next, new Set())) return undefined;
  if (positionsOf(next).includes(position) || JSON.stringify(positionsOf(next)) !== JSON.stringify(reset.drawPositions))
    return undefined;
  return [
    ...arrivalOps(view, loser),
    {
      op: 'setMatchUpResult',
      matchUpId: relay.matchUpId,
      matchUpStatus: status,
      winningSide: side,
      stampsScoredTime: false,
      retainedExitPlanned: true,
      announcedAs: 'assignMatchUpDrawPosition',
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: relay.matchUpId },
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: [...reset.drawPositions, position].sort((a, b) => a - b),
      placedDrawPosition: position,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

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
    score: BLANK_SCORE,
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
function terminalOccupiedWinnerOps(args: PlanArgs): OutcomeOp[] | undefined {
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
    ...unwind.reannounced.map(project),
    ...final,
    ...structureStamps([...unwound, ...arrival], source.structureId),
    { op: 'stampUpdatedAt', entity: 'structure', id: source.structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  ];
}

/** the view with a double exit's unwind folded in, and the direction planned on it (`rebuild`); undefined where none */
function unwoundView(
  args: {
    drawDefinition?: DrawDefinition;
    request: OutcomeRequest;
    view: OutcomeView;
    route?: Route;
    rebuild?: RebuildView;
  },
  { releasedLandings = false }: { releasedLandings?: boolean } = {},
): ReturnType<RebuildView> {
  if (args.route !== 'winner' || !args.rebuild) return undefined;
  const { ops, reannounced } = unwoundOps(args.view, args.request, args.route, args.drawDefinition);
  // A convergence produces into a released landing: its emptied award is written back to be played before the
  // direction's ops (`planOps`). Other deferred writes, including standing-BYE advancements, stay out of this fold.
  const released = releasedLandings ? earlyReleasedLandings(reannounced) : [];
  return args.rebuild([...ops, ...released], args.route);
}

/** Only the released-landing writes belong before a fresh direction; other deferred writers remain late. */
const earlyReleasedLandings = (ops: OutcomeOp[]) =>
  ops.filter((op) => op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes');

/** The exact original relay and its foreign origin, checked again as the unwind leaves them. */
function retainedRelayShape(view: OutcomeView, after: OutcomeView, ops: OutcomeOp[]) {
  const clears = ops.filter(
    (op): op is Extract<OutcomeOp, { op: 'clearMatchUpBye' }> =>
      op.op === 'clearMatchUpBye' && !!op.retainedOnwardMatchUpId,
  );
  if (clears.length !== 1 || !hasRetainedRelay(ops)) return undefined;
  const clear = clears[0];
  const home = indexed(view, clear.matchUpId);
  if (!home) return undefined;
  const copy = convergedRelayCopy(view, home, clear.drawPosition);
  if (!copy || copy.next.matchUpId !== clear.retainedOnwardMatchUpId) return undefined;
  const own = indexed(view, view.targets.loserMatchUpId);
  if (own?.winnerMatchUpId !== home.matchUpId) return undefined;
  const relay = indexed(after, home.matchUpId);
  const onward = indexed(after, copy.next.matchUpId);
  const successor = indexed(after, copy.successor.matchUpId);
  if (!relay || relay.matchUpStatus !== TO_BE_PLAYED || !unwoundClean(relay, new Set())) return undefined;
  if (positionsOf(relay).length !== 1 || positionsOf(relay)[0] !== clear.drawPosition) return undefined;
  if (!onward || onward.winningSide || !scoreless(onward) || onward.matchUpStatusCodes?.length) return undefined;
  if (onward.matchUpStatus !== copy.kept.matchUpStatus || positionsOf(onward).length !== 1) return undefined;
  if (!successor || successor.matchUpStatus !== TO_BE_PLAYED || !unwoundClean(successor, new Set())) return undefined;
  if (!unplaced(successor)) return undefined;
  return { own, relay, onward, clear, copy };
}

/** Certify a reservation beside this unwind's retained foreign exit, using the working view's new side geometry. */
function retainedRelayReservation(
  args: Parameters<typeof unwoundView>[0],
  after: NonNullable<ReturnType<RebuildView>>,
): RetainedRelayReservation | undefined {
  if (args.route !== 'winner' || !args.rebuild || !after.direction?.loser?.converged) return undefined;
  const { ops, reannounced } = unwoundOps(args.view, args.request, args.route, args.drawDefinition);
  const shape = retainedRelayShape(args.view, after.view, ops);
  if (!shape) return undefined;
  const { onward, clear, copy } = shape;
  const own = indexed(after.view, after.view.targets.loserMatchUpId);
  const target = own && producedTarget(after.view, own, after.direction.loser.converged);
  const awarded = target?.entry.sides?.find((side) => side.sideNumber === target.awardedSide);
  if (!target?.feed || awarded?.drawPosition !== clear.drawPosition) return undefined;
  const held = positionsOf(onward)[0];
  if (held === clear.drawPosition) return undefined;
  const drawPositions = [held, clear.drawPosition].sort((a, b) => a - b);
  const reserved: OutcomeOp = { op: 'setMatchUpDrawPositions', matchUpId: onward.matchUpId, drawPositions };
  const geometry = args.rebuild([...ops, ...earlyReleasedLandings(reannounced), reserved], args.route);
  const side = sideOf(geometry && indexed(geometry.view, onward.matchUpId), held);
  if (!side) return undefined;
  const [foreign] = Object.values(copy.kept.provenance);
  return {
    target,
    onward: { matchUpId: onward.matchUpId, drawPositions, provenance: { [side]: foreign } },
  };
}

/** Re-plan the fresh carry only for the certified retained-relay composition. */
function retainedRelayDirection(
  args: Parameters<typeof unwoundView>[0] & { direction?: DirectionPlan },
  ops: OutcomeOp[],
) {
  if (!hasRetainedRelay(ops)) return args.direction;
  const after = unwoundView(args, { releasedLandings: true });
  return after && retainedRelayReservation(args, after) ? after.direction : args.direction;
}

/**
 * S6: a single exit cleared back to be played. Where it carried nothing on, v1 takes it back as it takes back a played
 * result (`removeDirectedParticipants`): the winner out of the next matchUp and the loser out of the seat their link
 * fed, with the same writes and notices. So it is the removal shape (`removalReason`), whose checks keep anything the
 * exit carried v1's: provenance or a carried status in the loser's target, a BYE gone through beside it, and this
 * matchUp's own side provenance (`provenance`).
 */
function clearedSingleExit(view: OutcomeView, route?: Route, write?: MatchUpWrite): boolean {
  const { existing } = view;
  // a dual decided by its own exit, un-decided by a line (`undecidingLineOps`, S7): v1's tally writes the dual as its
  // lines leave it, in progress or to be played, the winner removed (`updateTieMatchUpScore`); only a dual's tally
  // writes IN_PROGRESS here
  const cleared = write?.matchUpStatus === TO_BE_PLAYED || write?.matchUpStatus === IN_PROGRESS;
  return (
    route === REMOVE_DIRECTED &&
    SINGLE_EXITS.has(existing.matchUpStatus) &&
    !!existing.winningSide &&
    cleared &&
    !write?.winningSide
  );
}

/**
 * S6: a stored single exit or played result corrected on the winner's route to a single exit or a played result, one
 * side of it an exit, where neither carries anything on: re-entered, relabelled (a WALKOVER as a DEFAULTED, an exit as
 * a played result and the reverse) or given to the other side. v1 directs a single exit that carries nothing as it
 * directs a played result (probed: the same writes and notices), so it takes S4's re-entered and changed-winner shapes
 * (`reenteredReason`, `changedWinnerReason`), whose checks keep v1's what the stored exit carried: provenance or a
 * carried status in a target, a BYE beside the loser, and this matchUp's own side provenance (`provenance`). A loser
 * the new exit would carry across their link is v1's here; a DEFAULTED under `incompleteAssignmentsOnDefault` too.
 */
function correctedSingleExit(args: ExitReasonArgs): boolean {
  const { request, view, route, write, direction } = args;
  const { existing } = view;
  if (route !== 'winner' || !existing.winningSide || !write?.winningSide) return false;
  if (!DIRECTED_STATUSES.has(existing.matchUpStatus) || !DIRECTED_STATUSES.has(write.matchUpStatus)) return false;
  if (request.matchUpStatus && request.matchUpStatus !== write.matchUpStatus) return false;
  if (write.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes) return false;
  if (direction?.produced || direction?.converged || direction?.decider) return false;
  const loser = direction?.loser;
  // the same winner relabelled an exit its loser carries across their link: the carry lands where they stand
  // (`relabelCarryReason`)
  const relabelCarry = !!loser?.exit && write.winningSide === existing.winningSide;
  // ...or relabelled a played result, the carry withdrawn off the loser's matchUp (F2, `withdrawnReason`)
  const withdrawal =
    !!loser?.withdrawn &&
    !loser.withdrawn.loserWins &&
    !SINGLE_EXITS.has(write.matchUpStatus) &&
    write.winningSide === existing.winningSide;
  return !(
    (loser?.exit && !relabelCarry) ||
    (loser?.withdrawn && !withdrawal) ||
    loser?.carriedPast ||
    loser?.converged
  );
}

/**
 * S6 tail: a single exit relabelled where its winner already stands (the `apply-values` route: the same winner, downstream
 * active): a stored exit or played result re-entered as an exit or a played result, one side of it an exit. v1 writes the
 * matchUp as it writes a played result there (`applyMatchUpValues`) and directs nothing again; under `propagateExitStatus`
 * the carry follows the label where the loser stands (`relabelWithoutDirection`): to an exit it is carried onto the
 * loser's matchUp as a fresh carry lands (`relabelCarryReason`, `carriedOps`); away from one it is withdrawn, the awardee's
 * position released from the matchUp they went on into (`withdrawnReason`, `withdrawnOps`); the same exit again leaves
 * the carry as it is, and the other exit rewrites it in place (`heldCarryStands`, read as the exit it is). Stay v1's: a
 * carry the awardee or the carrier has played on from, a carry that converged or was carried past, a loser kept out, and a
 * DEFAULTED under `incompleteAssignmentsOnDefault`. `applyValuesReason` then vets the write itself.
 */
function relabelledExit(args: ExitReasonArgs): boolean {
  const { request, view, write, direction } = args;
  const { existing } = view;
  if (!write?.winningSide || !existing.winningSide) return false;
  if (args.route === 'swap' ? write.winningSide === existing.winningSide : write.winningSide !== existing.winningSide)
    return false;
  if (!DIRECTED_STATUSES.has(existing.matchUpStatus) || !DIRECTED_STATUSES.has(write.matchUpStatus)) return false;
  if (request.matchUpStatus && request.matchUpStatus !== write.matchUpStatus) return false;
  if (write.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes) return false;
  if (direction?.produced || direction?.converged || direction?.decider) return false;
  // a swap's direction names the new winner, whose path the relabel exchanges (`swapOps`); a relabel places nobody
  if (direction?.winner && args.route !== 'swap') return false;
  // a status that changes is refreshed on the arrivals the first entry sent on (v1's `refreshArrivals`): v1's
  if (arrivalsRefreshed(view, request.matchUpId, write.matchUpStatus)) return false;
  const loser = direction?.loser;
  // no link: the write alone
  if (!loser) return true;
  if (loser.carriedPast || loser.converged || loser.bye || !loser.arrives) return false;
  if (loser.exit) return !relabelCarryReason(view, write);
  if (loser.withdrawn)
    return (
      !loser.withdrawn.loserWins && !SINGLE_EXITS.has(write.matchUpStatus) && !withdrawnReason(view, loser.withdrawn)
    );
  // nothing carried or withdrawn: the write alone, where no propagation is asked, or the loser's matchUp holds nothing
  // (a carry recorded past a BYE, or an exit standing there, is settled by v1 where the direction planned neither)
  const { targets } = view;
  if (!request.flags.propagateExitStatus) return true;
  return (
    targets.loserMatchUpStatus === TO_BE_PLAYED &&
    !targets.loserMatchUpHasResult &&
    !targets.loserMatchUpCarriesExit &&
    !targets.loserMatchUpCarriesSourceExit &&
    !targets.loserTargetSeat?.opponentBye &&
    !targets.loserMatchUpRecord?.provenance
  );
}

/** an arrival entry naming this matchUp (how a side got where it is) records a status the relabel would change */
function arrivalsRefreshed(
  view: OutcomeView,
  matchUpId: string | undefined,
  matchUpStatus?: MatchUpStatusUnion,
): boolean {
  if (!matchUpId) return false;
  return (view.inContextDrawMatchUps ?? []).some((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some(
      (entry) =>
        entry?.sourceMatchUpId === matchUpId &&
        !carriedExitStatus(entry) &&
        !!entry.previousMatchUpStatus &&
        entry.previousMatchUpStatus !== matchUpStatus,
    ),
  );
}

/**
 * S5: an exit carried across the loser link (`propagateExitStatus`), planned where it lands on a clean seat with nobody
 * opposite, or a participant who goes on into a clean next matchUp (RULE 3). v1's `progressExitStatus` then takes RULE 2: the loser's matchUp is written the carried status (a retirement
 * as a WALKOVER), awarded to the empty side, its codes derived from provenance (`[]`, no reason recorded), and the
 * carrier's side given the carried entry. Its winner is nobody, so nothing advances (`directParticipants`'
 * `winnerSlotEmpty`). Abstained: a BYE opposite (RULE 1), a participant opposite with nowhere clean to go on to, a matchUp holding a result, an exit, codes
 * or provenance (RULE 4 and the convergences), client codes on the call (the reason would ride with the side), and a
 * matchUp that links its own loser on: the carrier would carry the exit again (`propagateExitFrom`'s loop, which F9
 * bounds; v2 plans no loop, so it plans one level and abstains where there would be another).
 */
function carriedReason(view: OutcomeView, write: MatchUpWrite): AbstainReason | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  if (write.matchUpStatusCodes?.length) return 'exit';
  if (!seat?.free) return 'exit';
  const record = targets.loserMatchUpRecord;
  if (!record || record.provenance || record.matchUpStatusCodes?.length) return 'exit';
  // RULE 1: a BYE opposite, which the carrier passes into a clean next matchUp (`loserThroughBye`), where the exit lands,
  // or on through the BYE-held matchUps beyond it, to a clean one or the structure's last round (`loserByePassage`)
  if (seat.opponentBye) {
    if (targets.loserMatchUpStatus !== BYE || (!targets.loserThroughBye && !targets.loserByePassage)) return 'exit';
  } else if (
    targets.loserMatchUpStatus !== TO_BE_PLAYED ||
    targets.loserMatchUpHasResult ||
    targets.loserMatchUpCarriesExit
  )
    return 'exit';
  const landing = carriedLanding(view);
  // a landing that links its loser on carries the exit again: planned level by level (`deeperLandings`)
  if (!landing || (landing.carriesOn && !deeperLandings(view, landing, carriedStatus(write.matchUpStatus))))
    return 'exit';
  // RULE 3: somebody stands opposite, wins the carried exit and goes on, planned into a clean next matchUp
  if (landing.opponentHeld && !landing.onward) return 'exit';
  return undefined;
}

/**
 * S6: the same winner relabelled an exit its loser carries across their link (`propagateExitStatus`: a played result
 * re-entered as a WALKOVER or DEFAULTED). v1 directs nothing again (the loser already stands on the seat the link fed,
 * the winner in the next matchUp) and carries the exit to the loser where they stand, as a fresh entry does: the
 * loser's matchUp written the carried status, awarded to the side opposite, with the carry's provenance (`carriedOps`).
 * Planned on the same terms as a fresh carry, the seat held by the loser instead of free: their matchUp to be played,
 * with no result, exit, codes or provenance, nobody gone on past a BYE beside them, and a clean landing.
 */
function relabelCarryReason(view: OutcomeView, write: MatchUpWrite): AbstainReason | undefined {
  const { targets } = view;
  if (write.matchUpStatusCodes?.length) return 'exit';
  const record = targets.loserMatchUpRecord;
  if (!record || record.matchUpStatusCodes?.length) return 'exit';
  // the carry this matchUp made there, standing alone: rewritten in place, or left as it is (S6 tail)
  const held = targets.loserMatchUpCarryHeld;
  if (!held && (record.provenance || targets.loserMatchUpStatus !== TO_BE_PLAYED)) return 'exit';
  const landing = carriedLanding(view);
  if (!landing || (landing.carriesOn && !deeperLandings(view, landing, carriedStatus(write.matchUpStatus))))
    return 'exit';
  if (landing.opponentHeld && !landing.onward) return 'exit';
  return undefined;
}

/**
 * S6 (F2): an exit its loser carried, relabelled a played result for the same winner. v1 takes the carry back off the
 * loser's matchUp: to be played again, no winner, its carry provenance gone and its score as it was, and its
 * `scoredTime` taken by the `reconcileScoredTimes` pass, under whose name the matchUp is announced. Planned where the
 * carry is all that matchUp holds: this matchUp's provenance alone, nobody awarded it and gone on, and no loser link out
 * of it (the carrier carried nothing further). A withdrawal the carry converged in (`loserWins`) is v1's.
 */
function withdrawnReason(view: OutcomeView, withdrawn: WithdrawnCarry): AbstainReason | undefined {
  const { targets } = view;
  const entry = indexed(view, targets.loserMatchUpId);
  if (withdrawn.loserWins || withdrawn.matchUpStatus !== TO_BE_PLAYED || !entry) return 'exit';
  if (!targets.loserMatchUpCarriesSourceExit || entry.loserMatchUpId) return 'exit';
  const provenance = Object.values(entry.sideExitProvenance ?? {}).filter(Boolean);
  if (provenance.length !== 1 || entry.matchUpStatusCodes?.some((code) => typeof code !== 'string')) return 'exit';
  const awarded = entry.sides?.find((side) => side.sideNumber === entry.winningSide);
  if (awarded?.bye) return 'exit';
  // the awardee went on: their position comes back out of the next matchUp, planned where they stand there alone or
  // beside one other, nothing played (`releasedAward`); gone further, or somewhere else, v1's
  if (awarded?.participantId && !releasedAward(view, entry, awarded.drawPosition)) return 'exit';
  return undefined;
}

/**
 * The matchUp a participant awarded a carried exit went on into, as the withdrawal leaves it (v1's
 * `releaseAdvancedDrawPosition`): their position taken back out of a clean next matchUp of the same structure that holds
 * it (to be played, no winner, score, provenance or BYE). Undefined where they went nowhere (nothing to release), false
 * where the next matchUp is not that.
 */
function releasedAward(
  view: OutcomeView,
  entry: HydratedMatchUp,
  drawPosition?: number,
): { matchUpId: string; drawPositions: number[] } | false | undefined {
  const next = indexed(view, entry.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  if (!next || !drawPosition) return undefined;
  if (!held.includes(drawPosition)) return undefined;
  const clean =
    next.structureId === entry.structureId &&
    next.matchUpStatus === TO_BE_PLAYED &&
    !next.winningSide &&
    scoreless(next) &&
    !next.matchUpStatusCodes?.length &&
    !Object.keys(next.sideExitProvenance ?? {}).length &&
    !next.sides?.some((side) => side.bye);
  return clean
    ? { matchUpId: next.matchUpId, drawPositions: held.filter((position) => position !== drawPosition) }
    : false;
}

function withdrawnOps(view: OutcomeView): OutcomeOp[] {
  const { loserMatchUpId, loserStructureId, source } = view.targets;
  const entry = indexed(view, loserMatchUpId);
  if (!loserMatchUpId || !entry) return [];
  // the awardee's position released first: v1 announces the matchUp they came out of before the loser's (its own write
  // is the settle pass's, the call's last)
  const awarded = entry.sides?.find((side) => side.sideNumber === entry.winningSide);
  const release = awarded?.participantId ? releasedAward(view, entry, awarded.drawPosition) : undefined;
  return [
    ...(release
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: release.matchUpId,
            drawPositions: release.drawPositions,
            releasedDrawPosition: awarded?.drawPosition,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: release.matchUpId },
        ]
      : []),
    {
      op: 'setMatchUpResult',
      matchUpId: loserMatchUpId,
      matchUpStatus: TO_BE_PLAYED,
      announcedAs: 'reconcileScoredTimes',
    },
    { op: 'setSideExitProvenance', matchUpId: loserMatchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: loserMatchUpId },
    ...(loserStructureId && loserStructureId !== source.structureId
      ? [{ op: 'stampUpdatedAt' as const, entity: 'structure' as const, id: loserStructureId }]
      : []),
  ];
}

type CarriedLanding = {
  /** the matchUp the carried exit is written on: the loser's, or past a BYE the one the carrier goes on into */
  matchUpId: string;
  sideNumber: 1 | 2;
  /** the matchUp links its loser on: the carrier would carry the exit again */
  carriesOn: boolean;
  /** somebody stands opposite the carrier there */
  opponentHeld: boolean;
  /** RULE 3: the opponent standing there, their position joining the next matchUp, which holds these after */
  onward?: { matchUpId: string; drawPositions: number[] };
  /** RULE 1: the BYE matchUps the carrier passed, in order, each recording the carry beside its BYE on the carrier's side */
  relays?: { matchUpId: string; sideNumber: 1 | 2 }[];
  /** past the BYEs, the matchUp the carrier's position joins, with the positions it holds after */
  beyond?: ThroughBye;
  /** RULE 1 in the structure's last round: the carry is recorded beside the BYEs and stops; nothing is written beyond */
  ends?: boolean;
  /** how many of v1's `propagateExitFrom` iterations this landing takes: one per BYE passed, one for the write */
  passes: number;
  /** RULE 4 at a deeper level: the exit meets one standing there, and the double exit is written instead (S6 tail) */
  converged?: Convergence;
};

/**
 * Where the carried exit lands, as the index holds it: the loser's matchUp, or, past a BYE (RULE 1), the matchUp the
 * carrier goes on into (`findAdvancementMatchUp`: the one holding their position), which must hold no codes or
 * provenance of its own. Then the side the carrier is on, whether that matchUp links its loser on, and, where a
 * participant stands opposite (RULE 3), the next matchUp they go on into. v1's nested write directs that winner
 * (`directParticipants` → `directWinner`), so it is planned only into a matchUp of the same structure that is
 * `TO_BE_PLAYED` with no result, BYE or provenance, and a seat to take: there the arrival records no provenance (it is
 * outside the exit cascade) and nothing more follows.
 */
function carriedLanding(view: OutcomeView): CarriedLanding | undefined {
  const { loserMatchUpId, loserTargetDrawPosition, loserTargetSeat, loserThroughBye, loserByePassage } = view.targets;
  if (!loserTargetSeat?.opponentBye) return landingAt(view, loserMatchUpId, loserTargetDrawPosition);
  return passedLanding(view, loserMatchUpId, loserTargetDrawPosition, loserThroughBye, loserByePassage);
}

/**
 * RULE 1: the carrier on `drawPosition` opposite a BYE in `byeMatchUpId` passes it, and any BYE-held matchUps past it
 * (`ByePassage`), each recording the carry beside its BYE, into the clean matchUp beyond, where the exit lands; or, the
 * passage ending in the structure's last round, the carry stops there (S6 tail)
 */
function passedLanding(
  view: OutcomeView,
  byeMatchUpId: string | undefined,
  drawPosition: number | undefined,
  through?: ThroughBye,
  passage?: ByePassage,
): CarriedLanding | undefined {
  const relays: { matchUpId: string; sideNumber: 1 | 2 }[] = [];
  // the carrier's position stands in each BYE matchUp passed (`byePassage` read it there)
  for (const matchUpId of [byeMatchUpId, ...(passage?.byes ?? [])]) {
    const sideNumber = sideOf(indexed(view, matchUpId), drawPosition);
    if (matchUpId && sideNumber) relays.push({ matchUpId, sideNumber });
  }
  const beyond = through ?? passage?.through;
  const last = relays[relays.length - 1];
  if (!beyond)
    return passage
      ? { ...last, carriesOn: false, opponentHeld: false, relays, ends: true, passes: relays.length }
      : undefined;
  const landing = landingAt(view, beyond.matchUpId, drawPosition, { beyondBye: true });
  return landing ? { ...landing, relays, beyond, passes: relays.length + 1 } : undefined;
}

/** a carried exit's landing at a matchUp, the carrier on `drawPosition`: their side, who is opposite, and what follows */
function landingAt(
  view: OutcomeView,
  matchUpId: string | undefined,
  drawPosition: number | undefined,
  { beyondBye }: { beyondBye?: boolean } = {},
): CarriedLanding | undefined {
  const entry = indexed(view, matchUpId);
  const sideNumber = sideOf(entry, drawPosition);
  if (!entry || !sideNumber) return undefined;
  if (beyondBye && (entry.matchUpStatusCodes?.length || Object.keys(entry.sideExitProvenance ?? {}).length))
    return undefined;
  const opponent = entry.sides?.find((side) => side.sideNumber === 3 - sideNumber);
  const landing: CarriedLanding = {
    opponentHeld: !!opponent?.participantId || !!opponent?.bye,
    carriesOn: !!entry.loserMatchUpId,
    matchUpId: entry.matchUpId,
    passes: 1,
    sideNumber,
  };
  if (!opponent?.participantId || opponent.bye || !opponent.drawPosition) return landing;
  const standing = view.targets.loserMatchUpCarryHeld && entry.matchUpId === view.targets.loserMatchUpId;
  const onward = onwardFrom(view, entry, opponent.drawPosition, { standing });
  return onward ? { ...landing, onward } : landing;
}

/**
 * The levels a carried exit goes on to past its first landing (`propagateExitFrom`'s loop): the carrier loses each
 * landing and crosses its loser link, and the exit lands again by RULE 2 or 3, or past a BYE opposite by RULE 1 in the
 * clean matchUp beyond it. Planned where every level is clean, as the first must be: a free seat behind no link
 * condition, in a matchUp to be played holding no result, exit, codes or provenance (or a BYE the carrier passes), until a
 * landing links nothing on. Undefined otherwise, and where the walk reached
 * v1's bound with a level to go (F9: v1 refuses there; v2 abstains, so it never plans the bound).
 */
function deeperLandings(
  view: OutcomeView,
  first: CarriedLanding,
  carried: MatchUpStatusUnion,
): DeeperLanding[] | undefined {
  // v1's loop takes one iteration per BYE passed and one per landing written, and refuses with a level still to go at its
  // bound (F9): v2 abstains there, so it never plans the bound
  let passes = first.passes;
  if (!first.carriesOn) return passes > SETTLE_PASS_LIMITS.exitLevels ? undefined : [];
  const chain = view.targets.carryLevels;
  if (!chain || chain.bounded || chain.levels[0]?.fromMatchUpId !== first.matchUpId) return undefined;
  const deeper: DeeperLanding[] = [];
  for (const level of chain.levels) {
    const landing = levelLanding(view, level, carried);
    if (!landing || (landing.opponentHeld && !landing.onward)) return undefined;
    passes += landing.passes;
    deeper.push({ level, landing });
    if (!landing.carriesOn) return passes > SETTLE_PASS_LIMITS.exitLevels ? undefined : deeper;
  }
  return undefined;
}

type DeeperLanding = { level: CarryLevel; landing: CarriedLanding };

/** where the exit lands at one further level of the walk, as the first level's landing is read; undefined where v1's */
function levelLanding(view: OutcomeView, level: CarryLevel, carried: MatchUpStatusUnion): CarriedLanding | undefined {
  if (level.linkCondition || !level.seat?.free) return undefined;
  const { matchUpId, drawPosition, record } = level;
  // RULE 1 at this level: a BYE opposite, which the carrier passes into a clean matchUp beyond, where the exit lands, or
  // on through the BYE-held matchUps past it (`passage`)
  if (level.seat.opponentBye) {
    if (level.matchUpStatus !== BYE || (!level.through && !level.passage)) return undefined;
    if (!record || record.provenance || record.matchUpStatusCodes?.length) return undefined;
    return passedLanding(view, matchUpId, drawPosition, level.through, level.passage);
  }
  // RULE 4 at this level: a carried exit standing there was awarded to the carrier's seat; the two converge (S6 tail)
  const converged = convergenceAt(view, matchUpId, drawPosition, carried, level.walk);
  if (converged) {
    if (!record || record.matchUpStatusCodes?.length) return undefined;
    return { ...converged, carriesOn: false, opponentHeld: false, passes: 1, converged };
  }
  if (level.matchUpStatus !== TO_BE_PLAYED || level.hasResult || level.carriesExit) return undefined;
  if (!record || record.provenance || record.matchUpStatusCodes?.length) return undefined;
  return landingAt(view, matchUpId, drawPosition);
}

/**
 * The carried exit's write on the loser's matchUp, as v1's `progressExitStatus` makes it (RULES 2 and 3): the status,
 * the award to the side opposite the carrier (nobody yet, or the participant standing there, who then goes on), the codes it derives (`[]`), the score a WALKOVER blanks, then the carrier's
 * entry merged into its provenance (`buildCarriedExitProvenance`, v1's own builder). Announced as the score write it is.
 */
function carriedOps(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  loser?: DirectionPlan['loser'],
): { relay: OutcomeOp[]; landing: OutcomeOp[] } {
  const landing = carriedLanding(view);
  const deeper = landing && loser?.exit ? deeperLandings(view, landing, loser.exit) : undefined;
  if (!loser?.exit || !landing || !deeper) return { relay: [], landing: [] };
  const exit = loser.exit;
  // the entry a side carrying the exit is given: its origin the matchUp the carrier lost, and what that matchUp was
  const carried = (exitingSideNumber: 1 | 2, sourceMatchUpId?: string, previousMatchUpStatus?: MatchUpStatusUnion) =>
    buildCarriedExitProvenance({ previousMatchUpStatus, sourceMatchUpId, matchUpStatus: exit, exitingSideNumber });
  const provenanceOps = (
    matchUpId: string,
    provenance?: ReturnType<typeof carried>,
    announcedAs?: 'progressExitStatus',
  ): OutcomeOp[] =>
    provenance
      ? [{ op: 'mergeSideExitProvenance', matchUpId, provenance, ...(announcedAs ? { announcedAs } : {}) }]
      : [];
  const source = { matchUpId: request.matchUpId, status: write.matchUpStatus as MatchUpStatusUnion };
  // RULE 1: each BYE matchUp passed stays a BYE and records the carry beside its BYE, announced by itself
  const relayed = (at: CarriedLanding, sourceMatchUpId?: string, previousMatchUpStatus?: MatchUpStatusUnion) =>
    (at.relays ?? []).flatMap(({ matchUpId, sideNumber }): OutcomeOp[] => [
      ...provenanceOps(matchUpId, carried(sideNumber, sourceMatchUpId, previousMatchUpStatus), 'progressExitStatus'),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ]);
  const relay = relayed(landing, source.matchUpId, source.status);
  const landed = (
    at: CarriedLanding,
    sourceMatchUpId?: string,
    previousMatchUpStatus?: MatchUpStatusUnion,
  ): OutcomeOp[] => {
    if (at.converged) return convergenceOps(view, at.converged, exit, sourceMatchUpId, previousMatchUpStatus);
    if (at.ends) return [];
    return [
      {
        op: 'setMatchUpResult',
        matchUpId: at.matchUpId,
        matchUpStatus: exit,
        winningSide: (3 - at.sideNumber) as 1 | 2,
        matchUpStatusCodes: [],
        ...(exit === WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
      },
      ...provenanceOps(at.matchUpId, carried(at.sideNumber, sourceMatchUpId, previousMatchUpStatus)),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: at.matchUpId },
      // RULE 3: the opponent awarded the exit goes on, their position joining the next matchUp
      ...(at.onward
        ? [
            {
              op: 'setMatchUpDrawPositions' as const,
              matchUpId: at.onward.matchUpId,
              drawPositions: at.onward.drawPositions,
            },
            { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: at.onward.matchUpId },
          ]
        : []),
    ];
  };
  // each further level: the carrier placed across the landing's loser link, the exit carried from the landing they lost;
  // past a BYE there the BYE matchUp records the carry beside its BYE and the carrier goes on, as at the first level
  const levels = deeper.flatMap(({ level, landing: at }): OutcomeOp[] => [
    {
      op: 'assignPosition',
      structureId: level.structureId,
      drawPosition: level.drawPosition,
      participantId: loser.participantId,
    },
    ...relayed(at, level.fromMatchUpId, exit),
    ...(at.beyond
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: at.beyond.matchUpId,
            drawPositions: at.beyond.drawPositions,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: at.beyond.matchUpId },
        ]
      : []),
    ...landed(at, level.fromMatchUpId, exit),
  ]);
  return { relay, landing: [...landed(landing, source.matchUpId, source.status), ...levels] };
}

/** The ordinary award certified by the produced-exit reader, retained for a standalone clear. */
type ProducedAward = {
  target: ProducedTarget;
  paired: HydratedMatchUp;
  drawPosition: number;
  participantId: string;
};

/** a matchUp on a cleared double exit's path, with the writes v1's unwind makes at the seat its loser link feeds */
type UnwoundLevel = {
  matchUpId: string;
  seatOps: OutcomeOp[];
  /** the drawPosition the level before sent on into this matchUp (an award, a fed seat's reservation), taken back out */
  released?: number;
  /** a convergence this unwind dissolves, re-derived to the kept origin's pending exit (S6 tail) */
  rederived?: Rederived;
  pendingRemoval?: PendingRemoval;
};

/** what a dissolved convergence is written back to: the kept origin's exit, pending, with that origin alone */
type PendingRemoval = { drawPosition: number; provenance: SideExitProvenance };

type Rederived = { matchUpStatus: MatchUpStatusUnion; provenance: SideExitProvenance };

/**
 * S6 tail: the double exit's produced exit met its paired matchUp's in the next matchUp, which stands a double exit by
 * convergence (two origins, this matchUp's among them) producing on in turn. v1's unwind re-derives that matchUp to the
 * kept origin's pending exit (`getUnwoundState` under `pairedPreviousDoubleExit`: the status its retained provenance
 * derives, no winner, the score kept, codes re-derived), and its id joins the withdrawn origins, so what it produced
 * onward is taken back as any produced exit is: the next matchUp reset where that origin was its only one, re-derived in
 * turn where another stands beside it. The chain from the produced exit's matchUp to the first matchUp reset, or to a
 * final re-derived, each holding nothing but its origins: no winner, position, score or code. Undefined for anything
 * else.
 */
function convergedChain(
  view: OutcomeView,
  source: HydratedMatchUp,
  target: Pick<ProducedTarget, 'entry'>,
): { matchUpId: string; rederived?: Rederived }[] | undefined {
  const chain: { matchUpId: string; rederived?: Rederived }[] = [];
  let previous: HydratedMatchUp | undefined = source;
  let matchUp: HydratedMatchUp | undefined = target.entry;
  while (matchUp && previous && chain.length <= (view.inContextDrawMatchUps?.length ?? 0)) {
    // a matchUp holding anyone records their arrival beside the exits (an awardee's entry carries no status), which the
    // kept side's read below refuses: the chain's matchUps hold nothing but their origins
    if (matchUp.matchUpStatusCodes?.length) return undefined;
    const provenance = matchUp.sideExitProvenance ?? {};
    const sides = ([1, 2] as const).filter((side) => provenance[side]);
    const previousId = previous.matchUpId;
    const withdrawnSide = sides.find((side) => provenance[side]?.sourceMatchUpId === previousId);
    if (!withdrawnSide || !carriedExitStatus(provenance[withdrawnSide])) return undefined;
    const [keptSide, ...keptMore] = sides.filter((side) => side !== withdrawnSide);
    if (!keptSide) {
      // the chain ends at the pending exit this unwind alone produced (its one origin, nothing else), written back to be
      // played (`unwoundOps`)
      chain.push({ matchUpId: matchUp.matchUpId });
      return chain.some((level) => level.rederived) ? chain : undefined;
    }
    // two sides: one origin withdrawn leaves one kept, whose carried exit the matchUp (a double exit by convergence)
    // re-derives to
    const keptEntry = keptMore.length ? undefined : provenance[keptSide];
    const matchUpStatus = carriedExitStatus(keptEntry);
    if (!keptEntry || !matchUpStatus) return undefined;
    chain.push({ matchUpId: matchUp.matchUpId, rederived: { matchUpStatus, provenance: { [keptSide]: keptEntry } } });
    previous = matchUp;
    matchUp = indexed(view, matchUp.winnerMatchUpId);
  }
  // a final re-derived produces nothing onward
  return !matchUp && chain.some((level) => level.rederived) ? chain : undefined;
}

/**
 * S6: a double exit cleared (the `clear-score` route): v1's `removeDoubleExit`, then the clear's own write. Planned where
 * all the double exit sent on is its produced exit, still pending, in a structure whose only links out are loser links
 * with no condition: the next matchUp holds that exit alone (no winner, positions, score or codes, and this matchUp's
 * origin, on the side it fed, as its only provenance), and every matchUp beyond it on the winner's path to the final is
 * to be played with no positions, result, codes or provenance. v1 walks that path to the final
 * (`conditionallyRemoveDrawPosition` → `removeDoubleExit`, level by level) and writes each matchUp back to be played:
 * codes `[]`, its score blanked, the produced exit's origin withdrawn. At each level it also withdraws the BYE at the seat
 * the loser link feeds (`removeDirectedBye`, under `doubleExitPropagateBye`): the seats the double exit's BYEs took
 * (`unwoundSeatOps`). Returns the path, the call's matchUp first; undefined where anything else stands (a feed round, a
 * winner or conditioned link, an award, a convergence, anything played beyond, a BYE that went on further).
 */
/** A clear removes the previous awardee while the independent pending exit remains; not a dissolved convergence. */
function pendingAwardRemoval(
  view: OutcomeView,
  previous: HydratedMatchUp,
  at: HydratedMatchUp,
): PendingRemoval | undefined {
  if (view.draw.doubleExitPropagatesBye || previous.structureId !== at.structureId || !at.winningSide) return undefined;
  if (!scoreless(previous) || !scoreless(at) || previous.matchUpStatusCodes?.length || at.matchUpStatusCodes?.length)
    return undefined;
  const held = positionsOf(at);
  const winner = at.sides?.find((side) => side.sideNumber === at.winningSide);
  if (held.length !== 1 || !winner?.participantId || winner.drawPosition !== held[0]) return undefined;
  if (!positionsOf(previous).includes(held[0]) || previous.winnerMatchUpId !== at.matchUpId) return undefined;
  const entries = Object.entries(at.sideExitProvenance ?? {});
  const arrival = entries.find(([, entry]) => entry.sourceMatchUpId === previous.matchUpId);
  const kept = entries.find(([, entry]) => entry.sourceMatchUpId !== previous.matchUpId);
  if (entries.length !== 2 || !arrival || !kept || arrival[1].matchUpStatus) return undefined;
  if (arrival[1].previousMatchUpStatus !== previous.matchUpStatus || arrival[0] !== String(at.winningSide))
    return undefined;
  const foreign = indexed(view, kept[1].sourceMatchUpId);
  const status = carriedExitStatus(kept[1]);
  if (!foreign || !isDoubleExit(foreign.matchUpStatus) || foreign.winningSide || !status) return undefined;
  if (foreign.matchUpStatus !== kept[1].previousMatchUpStatus || foreign.winnerMatchUpId !== at.matchUpId)
    return undefined;
  if (!scoreless(foreign) || foreign.matchUpStatusCodes?.length || Object.keys(foreign.sideExitProvenance ?? {}).length)
    return undefined;
  if (at.matchUpStatus !== status || kept[0] !== String(3 - at.winningSide)) return undefined;
  if (foreign.structureId !== at.structureId || !pendingAwardSeatStands(view, at)) return undefined;
  return { drawPosition: held[0], provenance: { [Number(kept[0])]: kept[1] } };
}

/** The award becoming pending still sends nobody to its already unfillable loser seat. */
function pendingAwardSeatStands(view: OutcomeView, source: HydratedMatchUp): boolean {
  const seat = view.targets.unwindLoserSeats?.find((level) => level.matchUpId === source.matchUpId)?.loserSeat;
  if (!seat || seat.linkCondition || !seat.seat?.bye || !seat.seat.byeFromPropagation) return false;
  const target = indexed(view, seat.matchUpId);
  if (!target || target.matchUpId !== source.loserMatchUpId || target.structureId !== seat.structureId) return false;
  if (target.matchUpStatus !== BYE || target.winningSide || target.loserMatchUpId || !scoreless(target)) return false;
  if (target.matchUpStatusCodes?.length || Object.keys(target.sideExitProvenance ?? {}).length) return false;
  const positions = positionsOf(target);
  if (positions.length !== 1 || positions[0] !== seat.drawPosition) return false;
  if (target.sides?.some((side) => side.participantId || side.qualifier)) return false;
  const next = indexed(view, target.winnerMatchUpId);
  return (
    !!next &&
    next.structureId === target.structureId &&
    !next.winningSide &&
    !next.winnerMatchUpId &&
    !next.loserMatchUpId &&
    !positionsOf(next).length &&
    unwoundClean(next, new Set())
  );
}

/** An empty double-produced reservation reached this feed relay through exactly one standing BYE. Clear only. */
function indirectProducedRelaySeatOps(
  view: OutcomeView,
  seat: WinnerLoserSeat,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  if (view.draw.doubleExitPropagatesBye || bye.matchUpStatus !== BYE || bye.winningSide || !bye.feedRound)
    return undefined;
  if (bye.loserMatchUpId || !scoreless(bye) || bye.matchUpStatusCodes?.length || positionsOf(bye).length !== 2)
    return undefined;
  const [kept, ...more] = Object.values(bye.sideExitProvenance ?? {});
  const binding = seat.foreignProducedSeat;
  if (!kept || more.length || !binding || binding.linkCondition || binding.sourceMatchUpId !== kept.sourceMatchUpId)
    return undefined;
  const source = indexed(view, binding.sourceMatchUpId);
  const inter = indexed(view, binding.matchUpId);
  const status = carriedExitStatus(kept);
  if (!source || !inter || !status || !isDoubleExit(source.matchUpStatus) || source.winningSide) return undefined;
  if (source.matchUpStatus !== kept.previousMatchUpStatus || !scoreless(source) || source.matchUpStatusCodes?.length)
    return undefined;
  if (source.winnerMatchUpId === bye.matchUpId || source.loserMatchUpId !== inter.matchUpId) return undefined;
  if (
    binding.structureId !== bye.structureId ||
    inter.structureId !== bye.structureId ||
    inter.winnerMatchUpId !== bye.matchUpId
  )
    return undefined;
  if (
    inter.loserMatchUpId ||
    inter.matchUpStatus !== BYE ||
    inter.winningSide ||
    !scoreless(inter) ||
    inter.matchUpStatusCodes?.length
  )
    return undefined;
  const reservation = binding.drawPosition;
  if (positionsOf(inter).length !== 2 || !positionsOf(inter).includes(reservation)) return undefined;
  if (inter.sides?.some((side) => side.participantId || side.qualifier)) return undefined;
  if (Object.keys(source.sideExitProvenance ?? {}).length) return undefined;
  if (inter.sideExitProvenance?.[sideOf(inter, reservation) ?? 0]?.sourceMatchUpId !== source.matchUpId)
    return undefined;
  const carrier = inter.sides?.find((side) => side.drawPosition === reservation);
  const standing = inter.sides?.find((side) => side.drawPosition !== reservation && side.bye);
  if (!carrier || carrier.participantId || carrier.bye || carrier.qualifier || !standing?.drawPosition)
    return undefined;
  if (withdrawn.has(seatKey({ structureId: inter.structureId, drawPosition: standing.drawPosition }))) return undefined;
  const interEntries = Object.values(inter.sideExitProvenance ?? {});
  if (interEntries.length !== 1 || JSON.stringify(interEntries[0]) !== JSON.stringify(kept)) return undefined;
  if (reservation === drawPosition || !positionsOf(bye).includes(reservation)) return undefined;
  const relayCarrier = bye.sides?.find((side) => side.drawPosition === reservation);
  if (!relayCarrier || relayCarrier.participantId || relayCarrier.bye || relayCarrier.qualifier) return undefined;
  if (bye.sideExitProvenance?.[sideOf(bye, reservation) ?? 0] !== kept) return undefined;
  const next = indexed(view, bye.winnerMatchUpId);
  if (
    !next ||
    next.structureId !== bye.structureId ||
    next.loserMatchUpId ||
    next.matchUpStatus !== status ||
    !next.winningSide
  )
    return undefined;
  if (!scoreless(next) || next.matchUpStatusCodes?.length || positionsOf(next).length !== 2) return undefined;
  const winner = next.sides?.find((side) => side.sideNumber === next.winningSide);
  if (!winner?.participantId || !winner.drawPosition || winner.drawPosition === reservation) return undefined;
  const nextEntries = Object.values(next.sideExitProvenance ?? {});
  if (nextEntries.length !== 1 || JSON.stringify(nextEntries[0]) !== JSON.stringify(kept)) return undefined;
  if (next.sideExitProvenance?.[sideOf(next, reservation) ?? 0]?.sourceMatchUpId !== source.matchUpId) return undefined;
  const successor = indexed(view, next.winnerMatchUpId);
  if (
    !successor ||
    successor.structureId !== bye.structureId ||
    successor.loserMatchUpId ||
    successor.winningSide ||
    !unwoundClean(successor, withdrawn)
  )
    return undefined;
  if (!positionsOf(successor).includes(winner.drawPosition) || positionsOf(successor).length !== 2) return undefined;
  const beyond = indexed(view, successor.winnerMatchUpId);
  if (beyond && (beyond.structureId !== bye.structureId || positionsOf(beyond).includes(winner.drawPosition)))
    return undefined;
  return [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId: bye.matchUpId, drawPosition, rederived: { matchUpStatus: status } },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: bye.matchUpId },
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: successor.matchUpId,
      drawPositions: positionsOf(successor).filter((position) => position !== winner.drawPosition),
      releasedDrawPosition: winner.drawPosition,
      announcesContext: false,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: successor.matchUpId },
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: [winner.drawPosition],
      withdrawnByePosition: drawPosition,
      withdrawsProducedExit: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

type ProducedUnwind = {
  path: string[];
  rederived: Map<string, Rederived>;
  takenBack: Map<string, number>;
  pendingRemovals: Map<string, PendingRemoval>;
  award?: ProducedAward;
};

function unwoundPath(
  view: OutcomeView,
  matchUpId?: string,
  drawDefinition?: DrawDefinition,
  clearing = false,
  clearOnly = false,
  seatPrograms?: Map<number, OutcomeOp[]>,
): UnwoundLevel[] | undefined {
  const source = indexed(view, matchUpId);
  const structureId = source?.structureId;
  if (!source || !structureId) return undefined;
  const linksOut = (drawDefinition?.links ?? []).filter((link) => link.source?.structureId === structureId);
  // the links out that the unwind reads: loser links, plain or FIRST_MATCHUP (the double exit placed its BYE behind one
  // regardless, `advanceByeToLoserMatchUp`); a WINNER link out (DOUBLE_ELIMINATION's Main to its Decider) matters only
  // once the final has sent across it, which the undecided path below excludes (S6 tail)
  const unread = (link: (typeof linksOut)[number]) =>
    link.linkType === LOSER ? !!link.linkCondition && link.linkCondition !== FIRST_MATCHUP : link.linkType !== WINNER;
  if (linksOut.some(unread)) return undefined;
  // under `doubleExitPropagateBye: false` the seats the loser links feed show no BYE: v1 visits them as matchUps and
  // walks on from them (`unwoundBranch`, S6 tail)
  const branched = linksOut.some((link) => link.linkType === LOSER) && !view.draw.doubleExitPropagatesBye;
  const seats = view.targets.unwindLoserSeats ?? [];
  // a structure's final (or the one matchUp of a one-round structure) produced nothing: the path is the call's matchUp
  // alone, its own seat visited as any first level's (S6 tail, family 6). A final whose winner link leads on
  // (DOUBLE_ELIMINATION's Decider) has a next matchUp, and is read as any path
  const produced: ProducedUnwind | undefined = source.winnerMatchUpId
    ? unwoundProducedPath(view, source, structureId, clearOnly)
    : {
        path: [source.matchUpId],
        rederived: new Map<string, Rederived>(),
        takenBack: new Map<string, number>(),
        pendingRemovals: new Map<string, PendingRemoval>(),
      };
  if (!produced) return undefined;
  const { path, rederived, takenBack, pendingRemovals, award } = produced;
  if (seatPrograms && (rederived.size || pendingRemovals.size)) return undefined;
  // the BYEs this unwind withdraws (its own seat's and its produced exit's), which a seat's onward matchUp is read without:
  // v1 withdraws the deeper one first, so the own seat's onward matchUp has lost the unfillable seat's BYE by the time it
  // is visited (FIRST_MATCH_LOSER_CONSOLATION: both BYEs meet in the consolation's second round). Past a convergence
  // re-derived the unfillable seat is a level further on, and no owned shape reads it there (FMLC's dissolved
  // convergence is v1's): the first two levels suffice
  const reset = 1 + rederived.size;
  const withdrawn = new Set(
    seats.slice(0, 2).flatMap(({ loserSeat }, index) => {
      const program = seatPrograms?.get(index);
      if (program) return program.flatMap((op) => (op.op === 'withdrawBye' ? [seatKey(op)] : []));
      return loserSeat?.seat?.byeFromPropagation ? [seatKey(loserSeat)] : [];
    }),
  );
  const context = {
    path,
    seats,
    rederived,
    takenBack,
    reset,
    withdrawn,
    branched,
    sourceId: source.matchUpId,
    clearing,
    clearOnly,
    pendingRemovals,
    award,
  };
  const plain = unwoundLevels(view, context, seatPrograms);
  if (plain) return plain;
  if (seatPrograms) return undefined;
  // where the plain reading of a placed seat refuses, v1's removal is walked for both placed seats together
  const walk = walkedSeatOps(view, path, seats, { reset, rederived, branched, drawDefinition });
  return walk ? unwoundLevels(view, context, walk) : undefined;
}

type UnwoundContext = {
  path: string[];
  seats: NonNullable<OutcomeView['targets']['unwindLoserSeats']>;
  rederived: Map<string, Rederived>;
  takenBack: Map<string, number>;
  reset: number;
  withdrawn: Set<string>;
  branched: boolean;
  /** the double exit's matchUpId: the source of the carry its own seat relays under `doubleExitPropagateBye: false` */
  sourceId: string;
  clearing: boolean;
  clearOnly: boolean;
  pendingRemovals: Map<string, PendingRemoval>;
  award?: ProducedAward;
};

/**
 * Under `doubleExitPropagateBye: false`, what the deeper seats' withdrawals leave for the own seat's passage to read
 * (`unwoundPassage`, S7): the BYE matchUps they wrote back to be played (`cleared`), and the matchUps whose pending exit
 * went with the position taken out (`reset`), as v1's chain finds them once the unfillable seat's BYE has gone
 */
type UnwindRelay = { sourceId: string; cleared: Set<string>; reset: Set<string>; retained: Map<string, string> };

/**
 * The levels of an unwind (`unwoundPath`): each matchUp on the path with the writes at the seat its loser link feeds, the
 * placed seats read plainly (`unwoundLevelSeatOps`) or, given a walk, as the walk removes them (`walkedSeatOps`). Under
 * `doubleExitPropagateBye: false` the deeper seats are read first, as v1 withdraws them first: the own seat's passage
 * then reads the matchUps those withdrawals wrote (`UnwindRelay`)
 */
function unwoundLevels(
  view: OutcomeView,
  context: UnwoundContext,
  walk?: Map<number, OutcomeOp[]>,
): UnwoundLevel[] | undefined {
  const {
    path,
    seats,
    rederived,
    takenBack,
    reset,
    withdrawn,
    branched,
    sourceId,
    clearing,
    clearOnly,
    pendingRemovals,
  } = context;
  // a position the own seat's withdrawal releases out of a matchUp a deeper seat's BYE also sends to (a double BYE's next
  // matchUp, a BYE until then, had sent it on): that matchUp is read without it, and written once, by the release
  const released = new Set<number>();
  const relay: UnwindRelay = { sourceId, cleared: new Set(), reset: new Set(), retained: new Map() };
  const indices = path.map((_, index) => index);
  const order = branched && indices.length > 1 ? [...indices.slice(1), 0] : indices;
  const seatOpsAt = new Map<number, OutcomeOp[]>();
  for (const index of order) {
    const level = seats[index];
    if (level?.matchUpId !== path[index]) return undefined;
    if (pendingRemovals.has(path[index])) {
      seatOpsAt.set(index, []);
      continue;
    }
    const kept = rederived.get(path[index]);
    // the double exit's own seat and its produced exit's took the BYEs it placed; a seat further on holds nothing yet
    const at = { first: index === 0, placed: index === 0 || index === reset, kept: !!kept };
    const plain = () =>
      level.loserSeat
        ? unwoundLevelSeatOps(view, level, at, withdrawn, branched, released, relay, clearing, clearOnly)
        : [];
    const seatOps = walk?.get(index) ?? plain();
    if (!seatOps) return undefined;
    collectUnwound(seatOps, released, relay);
    seatOpsAt.set(index, seatOps);
  }
  if (!unwoundProgramsStand(view, context, seatOpsAt)) return undefined;
  return path.map((id, index) => {
    const taken = takenBack.get(id);
    const kept = rederived.get(id);
    return {
      matchUpId: id,
      seatOps: seatOpsAt.get(index) ?? [],
      ...(taken ? { released: taken } : {}),
      ...(kept ? { rederived: kept } : {}),
      ...(pendingRemovals.has(id) ? { pendingRemoval: pendingRemovals.get(id) } : {}),
    };
  });
}

/** The pending foreign award remains coupled; an ordinary award needs its own complete certificate. */
function unwoundProgramsStand(view: OutcomeView, context: UnwoundContext, programs: Map<number, OutcomeOp[]>): boolean {
  const indirect = [...programs].filter(([, program]) =>
    program.some((op) => op.op === 'clearMatchUpBye' && indirectRelayReset(view, op, program)),
  );
  if (context.pendingRemovals.size) return !!indirect.length;
  if (!indirect.length) return true;
  const [own, ...other] = indirect;
  return !other.length && own[0] === 0 && standaloneIndirectClear(view, context, own[1]);
}

/** A plain produced award and its clean final, with exactly the source's certified indirect seat program. */
function standaloneIndirectClear(view: OutcomeView, context: UnwoundContext, program: OutcomeOp[]): boolean {
  const { path, sourceId, award, seats, takenBack } = context;
  // The sole two-position indirect program already requires a policy-off clear at its constructor.
  if (!award || award.target.feed || path.length !== 3) return false;
  const source = indexed(view, sourceId);
  const final = indexed(view, path[2]);
  if (!source || !final || final.structureId !== source.structureId || final.winnerMatchUpId || final.loserMatchUpId)
    return false;
  if (takenBack.get(final.matchUpId) !== award.drawPosition) return false;
  if (!ordinaryAwardStands(source, award)) return false;
  const seat = seats[0]?.loserSeat;
  const clear = program.find(
    (op): op is Extract<OutcomeOp, { op: 'clearMatchUpBye' }> =>
      op.op === 'clearMatchUpBye' && op.matchUpId === seat?.matchUpId && op.drawPosition === seat.drawPosition,
  );
  return !!clear && !!indirectRelayReset(view, clear, program);
}

/** Live source and paired result agree with the two literal origins retained by the ordinary award reader. */
function ordinaryAwardStands(source: HydratedMatchUp, award: ProducedAward): boolean {
  const { target, paired, drawPosition, participantId } = award;
  if (
    !isDoubleExit(source.matchUpStatus) ||
    source.winningSide ||
    !scoreless(source) ||
    source.matchUpStatusCodes?.length
  )
    return false;
  if (
    Object.keys(source.sideExitProvenance ?? {}).length ||
    source.sides?.filter((side) => side.participantId).length !== 2
  )
    return false;
  if (paired.winnerMatchUpId !== target.entry.matchUpId) return false;
  if (paired.matchUpStatus !== WALKOVER && paired.matchUpStatus !== DEFAULTED) return false;
  if (!scoreless(paired) || paired.matchUpStatusCodes?.length || Object.keys(paired.sideExitProvenance ?? {}).length)
    return false;
  const produced = target.entry.sideExitProvenance?.[target.fedSide];
  const arrival = target.entry.sideExitProvenance?.[target.awardedSide];
  const winner = paired.sides?.find((side) => side.sideNumber === paired.winningSide);
  return (
    produced?.matchUpStatus === target.matchUpStatus &&
    produced.previousMatchUpStatus === source.matchUpStatus &&
    arrival?.matchUpStatus === undefined &&
    arrival?.previousMatchUpStatus === paired.matchUpStatus &&
    winner?.drawPosition === drawPosition &&
    winner.participantId === participantId
  );
}

/** The same validated level owns both this two-position relay clear and its exact onward reset. */
function indirectRelayReset(
  view: OutcomeView,
  clear: Extract<OutcomeOp, { op: 'clearMatchUpBye' }>,
  program: OutcomeOp[],
): Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }> | undefined {
  if (!program.includes(clear)) return undefined;
  const home = indexed(view, clear.matchUpId);
  if (!home || positionsOf(home).length !== 2) return undefined;
  return program.find(
    (op): op is Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }> =>
      op.op === 'setMatchUpDrawPositions' &&
      op.matchUpId === home.winnerMatchUpId &&
      !!op.withdrawsProducedExit &&
      op.withdrawnByePosition === clear.drawPosition,
  );
}

/** what a level's seat ops leave for the levels read after them: the positions released, the matchUps cleared or reset */
function collectUnwound(seatOps: OutcomeOp[], released: Set<number>, relay: UnwindRelay): void {
  for (const op of seatOps) {
    if (op.op === 'clearMatchUpBye') {
      relay.cleared.add(op.matchUpId);
      if (op.retainedOnwardMatchUpId) {
        relay.retained.set(op.matchUpId, op.retainedOnwardMatchUpId);
        relay.reset.add(op.retainedOnwardMatchUpId);
      }
    }
    if (op.op !== 'setMatchUpDrawPositions') continue;
    if (op.releasedDrawPosition) released.add(op.releasedDrawPosition);
    if (op.clearsPendingExit) relay.reset.add(op.matchUpId);
  }
}

/**
 * The placed seats of an unwind (the double exit's own loser seat, and the seat its produced exit left unfillable) as v1
 * removes their BYEs (`unwindWalk`): the deeper seat first, on the draw that removal leaves, then the own seat. Keyed by
 * the level each seat belongs to. Under `doubleExitPropagateBye: false` the own seat holds the carry, not a BYE, and is
 * read plainly (`unwoundBranch`, `unwoundPassage`): the walk takes the seats that do hold a propagated BYE (the
 * unfillable seat's, S7). Undefined where a seat the walk takes holds no propagated BYE, where no seat is walked, or where
 * the walk abstains.
 */
function walkedSeatOps(
  view: OutcomeView,
  path: string[],
  seats: NonNullable<OutcomeView['targets']['unwindLoserSeats']>,
  {
    reset,
    rederived,
    branched,
    drawDefinition,
  }: {
    reset: number;
    rederived: Map<string, Rederived>;
    branched: boolean;
    drawDefinition?: DrawDefinition;
  },
): Map<number, OutcomeOp[]> | undefined {
  if (!drawDefinition || !view.inContextDrawMatchUps) return undefined;
  const placed = [reset, 0].filter(
    (index, i, all) => all.indexOf(index) === i && index < path.length && !rederived.has(path[index]),
  );
  const walkedSeats: { index: number; structureId: string; drawPosition: number }[] = [];
  for (const index of placed) {
    const loserSeat = seats[index]?.loserSeat;
    if (!loserSeat || (branched && !loserSeat.seat?.bye)) continue;
    if (!loserSeat.seat?.bye || !loserSeat.seat.byeFromPropagation || !loserSeat.structureId) return undefined;
    walkedSeats.push({ index, structureId: loserSeat.structureId, drawPosition: loserSeat.drawPosition });
  }
  if (!walkedSeats.length) return undefined;
  const segments = unwindWalk({
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    propagatesBye: !!view.draw.doubleExitPropagatesBye,
    seats: walkedSeats,
    drawDefinition,
  });
  // the walk writes nothing the unwind's own path writes (`unwoundOps` writes those back to be played)
  const touched = segments?.flat().flatMap((op) => ('matchUpId' in op ? [op.matchUpId] : []));
  if (!segments || touched?.some((matchUpId) => path.includes(matchUpId))) return undefined;
  return new Map(walkedSeats.map(({ index }, i) => [index, segments[i]]));
}

/**
 * What a double exit's produced exit sent on, as the unwind takes it back (`unwoundPath`): the next matchUp holding the
 * produced exit (pending, or awarded to the paired matchUp's winner), or the convergences it made (`convergedChain`), then
 * the winner path beyond (`unwoundWinnerPath`). Undefined where anything else stands (a feed round, an award gone further).
 */
function unwoundProducedPath(
  view: OutcomeView,
  source: HydratedMatchUp,
  structureId: string,
  clearOnly = false,
): ProducedUnwind | undefined {
  const target = producedTarget(view, source, source.matchUpStatus as MatchUpStatusUnion);
  if (!target) return undefined;
  const { entry } = target;
  // the produced exit met its paired matchUp's there: a convergence this unwind dissolves (`convergedChain`, S6 tail)
  const converged = entry.matchUpStatus === target.matchUpStatus ? undefined : convergedChain(view, source, target);
  if (entry.matchUpStatus !== target.matchUpStatus && !converged) return undefined;
  const awardee = converged ? undefined : awardedReason(view, source, target);
  if (awardee === false) return undefined;
  // in a feed round the produced exit lands beside the fed seat (S6 tail, family 7): pending, it stands with that seat's
  // structural position, which went ahead as the reservation (awarded to the loser fed there, its arrival names no paired
  // matchUp and `awardedReason` refuses it; a feed matchUp has one feeder, so no convergence forms there)
  const start = [source.matchUpId, ...(converged?.map((level) => level.matchUpId) ?? [entry.matchUpId])];
  const pendingRemovals = new Map<string, PendingRemoval>();
  const walked = unwoundWinnerPath(view, structureId, start, clearOnly ? pendingRemovals : undefined);
  if (!walked) return undefined;
  const rederived = new Map(
    converged?.flatMap((level): [string, Rederived][] => (level.rederived ? [[level.matchUpId, level.rederived]] : [])),
  );
  return {
    path: walked.path,
    rederived,
    takenBack: walked.takenBack,
    pendingRemovals,
    ...(awardee ? { award: awardee } : {}),
  };
}

/**
 * The winner path a cleared double exit's unwind writes back, from the produced exit's matchUp to the structure's final
 * and one matchUp across the final's winner link (`unwoundPath`): each to be played with nothing decided or carried. The
 * position the level before sent ahead (the awardee's, a feed round's fed seat reserved on) comes back out of the matchUp
 * holding it (v1's `removeDirectedWinner`, `takenBack`); any other position there stands (a feed round's own fed seat, an
 * opponent arrived from the other half), as v1 leaves it. Undefined where anything else stands.
 */
function unwoundWinnerPath(
  view: OutcomeView,
  structureId: string,
  start: string[],
  pendingRemovals?: Map<string, PendingRemoval>,
): { path: string[]; takenBack: Map<string, number> } | undefined {
  const path = [...start];
  const takenBack = new Map<string, number>();
  let previous = indexed(view, path[path.length - 1]);
  let next = indexed(view, previous?.winnerMatchUpId);
  while (next && previous) {
    const before: HydratedMatchUp = previous;
    // the final's winner link leads into another structure (DOUBLE_ELIMINATION's Decider): v1's walk crosses it, takes
    // back a participant the final sent across (`removeLinkedWinner`: nobody, the final being undecided, which the
    // level before refused otherwise) and writes the matchUp back to be played as it writes the path; its structural
    // positions stand. The view holds one level past the final (`unwindLoserSeats`), so a walk going further abstains
    const crossed = next.structureId !== structureId;
    const pending =
      pendingRemovals && pendingRemovals.size === 0 && path.length === 2
        ? pendingAwardRemoval(view, before, next)
        : undefined;
    if (pending) {
      pendingRemovals?.set(next.matchUpId, pending);
      path.push(next.matchUpId);
      previous = next;
      next = indexed(view, next.winnerMatchUpId);
      continue;
    }
    if (next.matchUpStatus !== TO_BE_PLAYED || next.winningSide || !scoreless(next)) return undefined;
    if (Object.keys(next.sideExitProvenance ?? {}).length || path.includes(next.matchUpId)) return undefined;
    if (crossed && next.matchUpStatusCodes?.length) return undefined;
    if (!crossed) {
      if (next.matchUpStatusCodes?.length || next.sides?.some((side) => side.bye)) return undefined;
      // one position goes on from a matchUp; another standing here came from elsewhere and stays
      const sent = positionsOf(next).filter((position) => positionsOf(before).includes(position));
      if (sent.length) takenBack.set(next.matchUpId, sent[0]);
    }
    path.push(next.matchUpId);
    previous = next;
    next = indexed(view, next.winnerMatchUpId);
  }
  return { path, takenBack };
}

/**
 * The produced exit as it stands: pending (undefined), with this matchUp's origin, on the side it fed, its only
 * provenance and nothing placed; or awarded to the winner of the matchUp beside this one, who stands there alone with
 * their arrival recorded beside that origin (their drawPosition). False for anything else (a convergence, a score, codes).
 */
function awardedReason(
  view: OutcomeView,
  source: HydratedMatchUp,
  target: ProducedTarget,
): ProducedAward | false | undefined {
  const { entry, fedSide, awardedSide } = target;
  const provenance = entry.sideExitProvenance ?? {};
  const origins = Object.keys(provenance);
  if (provenance[fedSide]?.sourceMatchUpId !== source.matchUpId) return false;
  if (!entry.winningSide) {
    if (origins.length !== 1) return false;
    if (!target.feed) return undecided(entry, true) ? undefined : false;
    // a feed round: the fed seat's structural position stands beside the pending exit (anyone on it would have won the
    // exit, the exit's own side holds no position, and a BYE there makes the matchUp a BYE, refused before this, S6 tail)
    return scoreless(entry) && !entry.matchUpStatusCodes?.length ? undefined : false;
  }
  const awarded = entry.sides?.find((side) => side.sideNumber === awardedSide);
  const arrival = provenance[awardedSide];
  const paired = pairedFeeder(view);
  const held = (entry.drawPositions ?? []).filter(Boolean);
  if (entry.winningSide !== awardedSide || !awarded?.participantId || !awarded.drawPosition) return false;
  // the awardee's arrival entry: none of a status where they won the paired matchUp, or the BYE-origin pair the produced
  // exit wrote opposite itself where they came through the paired matchUp's BYE (S6 tail, family 5: the one entry of
  // BYE status, naming the BYE matchUp, which the paired read below asks)
  const throughBye = arrival?.matchUpStatus === BYE;
  if (origins.length !== 2 || (arrival?.matchUpStatus && !throughBye) || !paired) return false;
  if (arrival?.sourceMatchUpId !== paired.matchUpId) return false;
  if (held.length !== 1 || !scoreless(entry) || entry.matchUpStatusCodes?.length) return false;
  if (entry.sides?.some((side) => side.bye)) return false;
  return { target, paired, drawPosition: awarded.drawPosition, participantId: awarded.participantId };
}

/**
 * A participant's carried exit standing beside the BYE in the structure's last round (S7): the one provenance entry, on
 * the side opposite the BYE's, a carried exit a participant brought (not a double exit's produced one), the matchUp a
 * BYE with no winner, score or codes, and no next matchUp (the carrier passed nothing on). Once the BYE goes, v1
 * re-derives the matchUp to that exit, awarded to the side without it, as `updateMatchUpStatusAfterRemoval` does;
 * a BYE matchUp with a next matchUp sent the carrier on, and taking them back is v1's. Returns the re-derived state.
 */
function carriedBesideBye(
  byeMatchUp: HydratedMatchUp,
  drawPosition: number,
): { matchUpStatus: MatchUpStatusUnion; winningSide: 1 | 2 } | undefined {
  return byeMatchUp.winnerMatchUpId ? undefined : carriedOpposite(byeMatchUp, drawPosition);
}

/**
 * A participant's carried exit on the side opposite `drawPosition` in a BYE matchUp holding nothing else of a result
 * (`carriedBesideBye`, `carrierSentOn`): the exit's status, and the side holding `drawPosition`, which wins it
 */
function carriedOpposite(
  byeMatchUp: HydratedMatchUp,
  drawPosition: number,
): { matchUpStatus: MatchUpStatusUnion; winningSide: 1 | 2 } | undefined {
  if (byeMatchUp.matchUpStatus !== BYE || byeMatchUp.winningSide) return undefined;
  if (!scoreless(byeMatchUp) || byeMatchUp.matchUpStatusCodes?.length) return undefined;
  const byeSide = byeMatchUp.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  if (byeSide !== 1 && byeSide !== 2) return undefined;
  const entries = Object.entries(byeMatchUp.sideExitProvenance ?? {});
  const [kept, ...more] = entries;
  if (!kept || more.length || Number(kept[0]) !== 3 - byeSide) return undefined;
  const matchUpStatus = carriedExitStatus(kept[1]);
  if (!matchUpStatus || isDoubleExit(kept[1]?.previousMatchUpStatus)) return undefined;
  return { matchUpStatus, winningSide: byeSide };
}

/**
 * The carrier a withdrawn BYE had sent on (S7): a participant's carried exit beside the BYE, whose BYE matchUp has a
 * next matchUp. The BYE advanced the carrier on, past each matchUp another standing BYE holds (a relay: the carry
 * recorded beside that BYE, RULE 1), to the landing where the carry stands pending over an empty seat (RULE 2: the
 * carried status, the side opposite the carrier winning, scoreless, no codes, the carry its one entry), the award having
 * sent nobody on but the participant beside the carrier, if one stands there. When the BYE goes, v1 re-derives the BYE matchUp to the carry
 * (`updateMatchUpStatusAfterRemoval`), releases the carrier out of every round the BYE moved them through
 * (`releaseAdvancedDrawPosition`: the position, the carry with it, `withdrawRelayedExit`; `bringCarryHome` finds the
 * carry recorded beside the BYE already), the relays still BYEs, the landing to be played, its `scoredTime` taken by the
 * pass that announces it (`reconcileScoredTimes`); a participant the award had sent on (RULE 3) is taken back out of the
 * matchUp beyond, to be played with nothing else of a result. A carrier the BYE matchUp or a relay would link on as its
 * loser, an awardee sent further, another entry, a result, a relay's BYE this unwind withdraws: v1's.
 */
function carrierSentOn(
  view: OutcomeView,
  byeMatchUp: HydratedMatchUp,
  drawPosition: number,
  withdrawn: Set<string>,
): CarrierSentOn | undefined {
  const rederived = carriedOpposite(byeMatchUp, drawPosition);
  const side = byeMatchUp.sides?.find((candidate) => candidate.drawPosition !== drawPosition);
  if (!rederived || !side?.participantId || !side.drawPosition || byeMatchUp.loserMatchUpId) return undefined;
  const carrier = side.drawPosition;
  const [entry] = Object.values(byeMatchUp.sideExitProvenance ?? {});
  const sideOfCarrier = (at: HydratedMatchUp) =>
    at.sides?.find((candidate) => candidate.drawPosition === carrier)?.sideNumber;
  // the carry as each matchUp the carrier passed through records it: its one entry, on the carrier's side, the same exit
  // from the same source, nothing else of a result there, in this structure, no loser link out
  const carries = (at: HydratedMatchUp): boolean => {
    const [carried, ...more] = Object.entries(at.sideExitProvenance ?? {});
    if (!carried || more.length || Number(carried[0]) !== sideOfCarrier(at)) return false;
    if (carried[1]?.sourceMatchUpId !== entry?.sourceMatchUpId) return false;
    if (carriedExitStatus(carried[1]) !== rederived.matchUpStatus) return false;
    return (
      scoreless(at) && !at.matchUpStatusCodes?.length && at.structureId === byeMatchUp.structureId && !at.loserMatchUpId
    );
  };
  const relays: HydratedMatchUp[] = [];
  let at = indexed(view, byeMatchUp.winnerMatchUpId);
  while (at && at.matchUpStatus === BYE && relays.length < 8) {
    if (!carries(at) || at.winningSide) return undefined;
    const standing = at.sides?.find((candidate) => candidate.bye);
    if (
      !standing?.drawPosition ||
      withdrawn.has(seatKey({ structureId: at.structureId, drawPosition: standing.drawPosition }))
    )
      return undefined;
    relays.push(at);
    at = indexed(view, at.winnerMatchUpId);
  }
  const carrierSide = at ? sideOfCarrier(at) : undefined;
  if (!at || (carrierSide !== 1 && carrierSide !== 2) || !carries(at)) return undefined;
  if (at.matchUpStatus !== rederived.matchUpStatus || at.winningSide !== 3 - carrierSide) return undefined;
  const awardee = at.sides?.find((candidate) => candidate.sideNumber !== carrierSide);
  if (awardee?.bye) return undefined;
  const beyond = indexed(view, at.winnerMatchUpId);
  // the award sent the participant beside the carrier on (RULE 3): v1 takes them back out of the matchUp beyond, which
  // holds nothing else of a result and sent them no further (`releaseAdvancedDrawPosition`); an empty seat sent nobody
  const sent = awardee?.participantId && beyond && positionsOf(beyond).includes(awardee.drawPosition ?? 0);
  if (
    beyond &&
    positionsOf(at).some(
      (position) => (!sent || position !== awardee.drawPosition) && positionsOf(beyond).includes(position),
    )
  )
    return undefined;
  if (awardee?.participantId && !sent && beyond) return undefined;
  if (!sent) return { rederived, carrier, relays, landing: at };
  if (beyond.matchUpStatus !== TO_BE_PLAYED || beyond.winningSide || !scoreless(beyond)) return undefined;
  if (beyond.matchUpStatusCodes?.length || Object.keys(beyond.sideExitProvenance ?? {}).length) return undefined;
  const further = indexed(view, beyond.winnerMatchUpId);
  if (further && positionsOf(further).includes(awardee.drawPosition ?? 0)) return undefined;
  return {
    rederived,
    carrier,
    relays,
    landing: at,
    released: { matchUp: beyond, drawPosition: awardee.drawPosition ?? 0 },
  };
}

type CarrierSentOn = {
  rederived: { matchUpStatus: MatchUpStatusUnion; winningSide: 1 | 2 };
  carrier: number;
  relays: HydratedMatchUp[];
  landing: HydratedMatchUp;
  /** the matchUp beyond the landing, holding the participant the award sent on: that position taken back out of it */
  released?: { matchUp: HydratedMatchUp; drawPosition: number };
};

/**
 * The carrier released out of every round the withdrawn BYE moved them through (`carrierSentOn`): the landing loses the
 * position and the carry and is to be played (`releaseAdvancedDrawPosition`, announced last by the settle pass that takes
 * its `scoredTime`); the awardee it sent on comes back out of the matchUp beyond; each relay, a BYE still, loses the
 * position and the carry, written as v1's position clear announces it after the release (`removeDrawPosition-<n>`, the
 * withdrawn BYE's)
 */
function carrierHomeOps({ carrier, relays, landing, released }: CarrierSentOn, drawPosition: number): OutcomeOp[] {
  const taken = (at: HydratedMatchUp) => positionsOf(at).filter((position) => position !== carrier);
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: landing.matchUpId,
      drawPositions: taken(landing),
      releasedDrawPosition: carrier,
    },
    {
      op: 'setMatchUpResult',
      matchUpId: landing.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
      announcedAs: 'reconcileScoredTimes',
    },
    { op: 'setSideExitProvenance', matchUpId: landing.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
    // the awardee taken back out of the matchUp beyond: announced as the release, with neither event nor tournament
    ...(released
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: released.matchUp.matchUpId,
            drawPositions: positionsOf(released.matchUp).filter((position) => position !== released.drawPosition),
            releasedDrawPosition: released.drawPosition,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: released.matchUp.matchUpId },
        ]
      : []),
    // the relays last: v1's position clear rewrites each after the release, and its notice is the one kept
    ...relays.flatMap((relay): OutcomeOp[] => [
      {
        op: 'setMatchUpDrawPositions',
        matchUpId: relay.matchUpId,
        drawPositions: taken(relay),
        withdrawnByePosition: drawPosition,
      },
      { op: 'setSideExitProvenance', matchUpId: relay.matchUpId },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: relay.matchUpId },
    ]),
  ];
}

/**
 * Under `doubleExitPropagateBye: false`, a matchUp holding this double exit's own carried exit and nothing else of a
 * result: one provenance entry, a carried exit naming the double exit as its source, no winner, scoreless, no codes; the
 * matchUp a BYE (the relay a passage records beside a BYE it passed) or pending that exit (the passage's landing). S7.
 */
function ownCarryAlone(matchUp: HydratedMatchUp, sourceId: string): boolean {
  const [entry, ...more] = Object.values(matchUp.sideExitProvenance ?? {});
  if (!entry || more.length || entry.sourceMatchUpId !== sourceId) return false;
  const status = carriedExitStatus(entry);
  if (!status || matchUp.winningSide || !scoreless(matchUp) || matchUp.matchUpStatusCodes?.length) return false;
  return matchUp.matchUpStatus === BYE || matchUp.matchUpStatus === status;
}

/** A produced exit directly feeding this feed-round BYE, retained beside its empty seat (S7). */
function producedBesideBye(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
): MatchUpStatusUnion | undefined {
  if (bye.matchUpStatus !== BYE || bye.winningSide || !scoreless(bye) || bye.matchUpStatusCodes?.length)
    return undefined;
  if (!bye.feedRound || bye.loserMatchUpId || positionsOf(bye).length !== 1) return undefined;
  const side = sideOf(bye, drawPosition);
  const entries = Object.entries(bye.sideExitProvenance ?? {});
  const [kept, ...more] = entries;
  if (!side || !kept || more.length || Number(kept[0]) !== 3 - side) return undefined;
  if (!isDoubleExit(kept[1].previousMatchUpStatus)) return undefined;
  const origin = indexed(view, kept[1].sourceMatchUpId);
  if (!origin || !isDoubleExit(origin.matchUpStatus) || origin.winnerMatchUpId !== bye.matchUpId) return undefined;
  return carriedExitStatus(kept[1]);
}

/** The produced copy stands pending and alone, and whatever lies beyond is clean as the unwind leaves it. */
function producedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.loserMatchUpId) return undefined;
  if (next.matchUpStatus !== status || next.winningSide || positionsOf(next).length || !scoreless(next))
    return undefined;
  if (next.matchUpStatusCodes?.length) return undefined;
  const [entry, ...more] = Object.values(next.sideExitProvenance ?? {});
  const [kept] = Object.values(bye.sideExitProvenance ?? {});
  if (!entry || more.length || entry.sourceMatchUpId !== kept.sourceMatchUpId) return undefined;
  if (entry.previousMatchUpStatus !== kept.previousMatchUpStatus || carriedExitStatus(entry) !== status)
    return undefined;
  const beyond = indexed(view, next.winnerMatchUpId);
  if (beyond && (beyond.structureId !== bye.structureId || !unwoundClean(beyond, withdrawn) || beyond.winningSide))
    return undefined;
  return [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId: bye.matchUpId, drawPosition, rederived: { matchUpStatus: status } },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: bye.matchUpId },
  ];
}

/** A terminal feed-round relay retains its direct producer's pending exit when its propagated BYE is withdrawn. */
function terminalProducedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
): OutcomeOp[] | undefined {
  if (bye.winnerMatchUpId) return undefined;
  const status = producedBesideBye(view, bye, drawPosition);
  const [entry] = Object.values(bye.sideExitProvenance ?? {});
  const origin = indexed(view, entry?.sourceMatchUpId);
  if (!status || !origin || origin.structureId !== bye.structureId) return undefined;
  if (origin.matchUpStatus !== entry.previousMatchUpStatus || origin.matchUpStatusCodes?.length) return undefined;
  return [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId: bye.matchUpId, drawPosition, rederived: { matchUpStatus: status } },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: bye.matchUpId },
  ];
}

/** An awarded copy loses its exit on the unwind, before the arriving loser can read it (S7). */
function awardedProducedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.loserMatchUpId) return undefined;
  if (next.matchUpStatus !== status || !next.winningSide || !scoreless(next) || next.matchUpStatusCodes?.length)
    return undefined;
  const winner = next.sides?.find((side) => side.sideNumber === next.winningSide);
  const held = positionsOf(next);
  if (!winner?.participantId || !winner.drawPosition || held.length !== 1) return undefined;
  const [kept] = Object.values(bye.sideExitProvenance ?? {});
  const entries = Object.entries(next.sideExitProvenance ?? {});
  const exits = entries.filter(([, entry]) => isDoubleExit(entry.previousMatchUpStatus));
  const [produced, ...more] = exits;
  if (!produced || more.length || Number(produced[0]) === next.winningSide) return undefined;
  if (produced[1].sourceMatchUpId !== kept.sourceMatchUpId || carriedExitStatus(produced[1]) !== status)
    return undefined;
  if (produced[1].previousMatchUpStatus !== kept.previousMatchUpStatus) return undefined;
  if (
    entries.some(
      ([, entry]) => entry !== produced[1] && (entry.matchUpStatus || entry.previousMatchUpStatus !== COMPLETED),
    )
  )
    return undefined;
  const beyond = indexed(view, next.winnerMatchUpId);
  if (beyond) {
    if (
      beyond.structureId !== next.structureId ||
      beyond.loserMatchUpId ||
      beyond.winningSide ||
      !unwoundClean(beyond, withdrawn)
    )
      return undefined;
    if (!positionsOf(beyond).includes(winner.drawPosition)) return undefined;
    const further = indexed(view, beyond.winnerMatchUpId);
    if (further && (further.structureId !== beyond.structureId || positionsOf(further).includes(winner.drawPosition)))
      return undefined;
  }
  return [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId: bye.matchUpId, drawPosition, rederived: { matchUpStatus: status } },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: bye.matchUpId },
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: held,
      withdrawnByePosition: drawPosition,
      withdrawsProducedExit: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    ...(beyond
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: beyond.matchUpId,
            drawPositions: positionsOf(beyond).filter((position) => position !== winner.drawPosition),
            releasedDrawPosition: winner.drawPosition,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: beyond.matchUpId },
        ]
      : []),
  ];
}

/** A produced copy converged with another origin, producing once more into a clean final. */
function convergedRelayCopy(view: OutcomeView, bye: HydratedMatchUp, drawPosition: number) {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.loserMatchUpId) return undefined;
  if (!isDoubleExit(next.matchUpStatus) || next.winningSide || !scoreless(next)) return undefined;
  if (positionsOf(next).length !== 1 || next.matchUpStatusCodes?.length) return undefined;
  if (next.sides?.some((side) => side.participantId || side.bye)) return undefined;
  const [entry] = Object.values(bye.sideExitProvenance ?? {});
  const origin = indexed(view, entry?.sourceMatchUpId);
  if (!origin) return undefined;
  const entries = Object.values(next.sideExitProvenance ?? {});
  const copy = entries.find((candidate) => candidate.sourceMatchUpId === origin.matchUpId);
  if (entries.length !== 2 || copy?.previousMatchUpStatus !== entry.previousMatchUpStatus) return undefined;
  if (carriedExitStatus(copy) !== status) return undefined;
  const chain = convergedChain(view, origin, { entry: next });
  if (!chain || chain.length !== 2 || !chain[0].rederived || chain[1].rederived) return undefined;
  const kept = chain[0].rederived;
  const successor = indexed(view, chain[1].matchUpId);
  if (!successor || successor.structureId !== next.structureId || successor.loserMatchUpId) return undefined;
  if (successor.winnerMatchUpId || !undecided(successor)) return undefined;
  if (successor.matchUpStatus !== (next.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER)) return undefined;
  return { status, next, successor, kept };
}

/** Retain the foreign onward origin before rebuilding the arriving direction. */
function convergedProducedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
): OutcomeOp[] | undefined {
  const copy = convergedRelayCopy(view, bye, drawPosition);
  if (!copy) return undefined;
  const { status, next, successor, kept } = copy;
  return [
    withdraw,
    {
      op: 'clearMatchUpBye',
      matchUpId: bye.matchUpId,
      drawPosition,
      rederived: { matchUpStatus: status },
      retainedOnwardMatchUpId: next.matchUpId,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: bye.matchUpId },
    {
      op: 'setMatchUpResult',
      matchUpId: next.matchUpId,
      matchUpStatus: kept.matchUpStatus,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcedAs: 'settleRederivedDoubleExit',
    },
    { op: 'setSideExitProvenance', matchUpId: next.matchUpId, provenance: kept.provenance },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    {
      op: 'setMatchUpResult',
      matchUpId: successor.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
      ...(successor.score ? { score: BLANK_SCORE } : {}),
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcedAs: 'withdrawProducedExits',
    },
    { op: 'setSideExitProvenance', matchUpId: successor.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: successor.matchUpId },
  ];
}

/** The foreign single exit reaches this final only through standing BYEs, carried by its original loser. */
function occupiedFinalCarrier(
  view: OutcomeView,
  final: HydratedMatchUp,
  entry: NonNullable<SideExitProvenance[1]>,
  drawPosition: number,
  participantId: string,
  withdrawn: Set<string>,
): boolean {
  const source = indexed(view, entry.sourceMatchUpId);
  if (!source?.winningSide || source.matchUpStatus !== entry.previousMatchUpStatus) return false;
  if (source.matchUpStatus !== WALKOVER && source.matchUpStatus !== DEFAULTED) return false;
  if (entry.matchUpStatus !== source.matchUpStatus || !scoreless(source) || source.matchUpStatusCodes?.length)
    return false;
  const loser = source.sides?.find((side) => side.sideNumber === 3 - (source.winningSide as number));
  if (loser?.participantId !== participantId) return false;
  const visited = new Set<string>();
  let at = indexed(view, source.loserMatchUpId);
  while (at && at.matchUpId !== final.matchUpId) {
    if (visited.has(at.matchUpId)) return false;
    visited.add(at.matchUpId);
    if (at.structureId !== final.structureId || at.loserMatchUpId || at.matchUpStatus !== BYE || at.winningSide)
      return false;
    if (!scoreless(at) || at.matchUpStatusCodes?.length) return false;
    const side = sideOf(at, drawPosition);
    const carrier = at.sides?.find((candidate) => candidate.sideNumber === side);
    const bye = at.sides?.find((candidate) => candidate.bye);
    if (carrier?.participantId !== participantId || !bye?.drawPosition) return false;
    if (withdrawn.has(seatKey({ structureId: at.structureId, drawPosition: bye.drawPosition }))) return false;
    const [carried, ...more] = Object.entries(at.sideExitProvenance ?? {});
    if (!carried || more.length || Number(carried[0]) !== side) return false;
    if (carried[1].sourceMatchUpId !== source.matchUpId || carried[1].previousMatchUpStatus !== source.matchUpStatus)
      return false;
    if (carried[1].matchUpStatus !== entry.matchUpStatus) return false;
    at = indexed(view, at.winnerMatchUpId);
  }
  return visited.size > 0 && at?.matchUpId === final.matchUpId;
}

/** A clear withdraws a produced copy from an occupied final, retaining the real carrier's own award. */
function occupiedFinalRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.winnerMatchUpId || next.loserMatchUpId)
    return undefined;
  if (!isDoubleExit(next.matchUpStatus) || next.winningSide || !scoreless(next) || next.matchUpStatusCodes?.length)
    return undefined;
  const positions = positionsOf(next);
  const carrier = next.sides?.find((side) => side.participantId);
  if (
    positions.length !== 1 ||
    !carrier?.drawPosition ||
    !carrier.participantId ||
    carrier.drawPosition === drawPosition
  )
    return undefined;
  if (next.sides?.some((side) => side.bye || side.qualifier)) return undefined;
  const side = sideOf(next, carrier.drawPosition);
  if (!side) return undefined;
  const [produced] = Object.values(bye.sideExitProvenance ?? {});
  const producer = indexed(view, produced.sourceMatchUpId);
  if (producer?.matchUpStatus !== produced.previousMatchUpStatus) return undefined;
  const entries = Object.entries(next.sideExitProvenance ?? {});
  const copy = entries.find(([, entry]) => entry.sourceMatchUpId === produced.sourceMatchUpId);
  const kept = next.sideExitProvenance?.[side];
  if (entries.length !== 2 || !copy || Number(copy[0]) === side || !kept) return undefined;
  if (copy[1].previousMatchUpStatus !== produced.previousMatchUpStatus || carriedExitStatus(copy[1]) !== status)
    return undefined;
  const carried = carriedExitStatus(kept);
  if (!carried || next.matchUpStatus !== collapseDoubleExitStatus([status, carried])) return undefined;
  if (!occupiedFinalCarrier(view, next, kept, carrier.drawPosition, carrier.participantId, withdrawn)) return undefined;
  const provenance = { [side]: kept };
  return [
    withdraw,
    {
      op: 'clearMatchUpBye',
      matchUpId: bye.matchUpId,
      drawPosition,
      rederived: { matchUpStatus: status },
      retainedCarriedAward: {
        matchUpId: next.matchUpId,
        carrierDrawPosition: carrier.drawPosition,
        participantId: carrier.participantId,
        matchUpStatus: carried,
        provenance,
      },
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: bye.matchUpId },
    {
      op: 'setMatchUpResult',
      matchUpId: next.matchUpId,
      matchUpStatus: carried,
      winningSide: (3 - side) as 1 | 2,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      retainedExitPlanned: true,
      announcedAs: 'settleRederivedDoubleExit',
    },
    { op: 'setSideExitProvenance', matchUpId: next.matchUpId, provenance },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

/** The empty seat already advanced through its standing opposite BYE; its clear changes neither matchUp. */
function standingByeSeat(view: OutcomeView, seat: WinnerLoserSeat, withdrawn: Set<string>): boolean {
  const opposite = seat.seat?.standingBye?.opponentDrawPosition;
  if (!opposite) return false;
  if (withdrawn.has(seatKey({ structureId: seat.structureId, drawPosition: opposite }))) return false;
  const target = indexed(view, seat.matchUpId);
  if (!target || target.structureId !== seat.structureId || target.roundNumber !== 1 || target.loserMatchUpId)
    return false;
  if (target.matchUpStatus !== BYE || target.winningSide || !scoreless(target)) return false;
  if (target.matchUpStatusCodes?.length || Object.keys(target.sideExitProvenance ?? {}).length) return false;
  const positions = positionsOf(target);
  if (positions.length !== 2 || !positions.includes(seat.drawPosition) || !positions.includes(opposite)) return false;
  if (target.sides?.some((side) => side.participantId || side.qualifier)) return false;
  if (!target.sides?.some((side) => side.drawPosition === opposite && side.bye)) return false;
  const next = indexed(view, target.winnerMatchUpId);
  if (!next || next.structureId !== target.structureId || next.roundNumber !== 2) return false;
  const advanced = positionsOf(next);
  if (advanced.length !== 2 || !advanced.includes(seat.drawPosition) || advanced.includes(opposite)) return false;
  const members = (view.inContextDrawMatchUps ?? []).filter((matchUp) => matchUp.structureId === seat.structureId);
  return members.every((matchUp) => standingByeRemainder(view, matchUp, target, next, seat.drawPosition, opposite));
}

/** Bound the v1 pairing/removal tasks: preserve one BYE advancement, with no result or further reservation. */
function standingByeRemainder(
  view: OutcomeView,
  matchUp: HydratedMatchUp,
  target: HydratedMatchUp,
  next: HydratedMatchUp,
  drawPosition: number,
  opposite: number,
): boolean {
  if (matchUp.matchUpId === target.matchUpId) return true;
  if (matchUp.matchUpStatus !== TO_BE_PLAYED || matchUp.winningSide || !scoreless(matchUp)) return false;
  if (matchUp.matchUpStatusCodes?.length || Object.keys(matchUp.sideExitProvenance ?? {}).length) return false;
  if (matchUp.loserMatchUpId || matchUp.sides?.some((side) => side.bye || side.qualifier)) return false;
  const positions = positionsOf(matchUp);
  if (positions.includes(opposite) || (matchUp.matchUpId !== next.matchUpId && positions.includes(drawPosition)))
    return false;
  if (!matchUp.winnerMatchUpId) return true;
  const onward = indexed(view, matchUp.winnerMatchUpId);
  return (
    !!onward && onward.structureId === target.structureId && (onward.roundNumber ?? 0) > (matchUp.roundNumber ?? 0)
  );
}

function unwoundSeatOps(
  view: OutcomeView,
  loserSeat: WinnerLoserSeat,
  placedBye: boolean,
  withdrawn: Set<string> = new Set(),
  released: Set<number> = new Set(),
  cascaded = false,
  relay?: UnwindRelay,
  clearing = false,
  clearOnly = false,
): OutcomeOp[] | undefined {
  const { structureId, drawPosition, matchUpId, seat } = loserSeat;
  // a BYE the round-1 loser cascade takes back: v1 announces no assignments for it (`drawPositionRemovals`, S6 tail)
  const withdraw: OutcomeOp = {
    op: 'withdrawBye',
    structureId,
    drawPosition,
    ...(cascaded ? { announcesAssignments: false as const } : {}),
  };
  // a BYE this double exit placed went in behind a FIRST_MATCHUP link too (`advanceByeToLoserMatchUp` asks no condition),
  // and comes out the same way (S6 tail); a seat further on behind one may hold a standing reservation, not this double
  // exit's to take back: v1's
  const conditioned = loserSeat.linkCondition && !(placedBye && loserSeat.linkCondition === FIRST_MATCHUP);
  if (!seat || conditioned) return undefined;
  if (!placedBye)
    return seat.free && (loserSeat.matchUpStatus !== BYE || standingByeSeat(view, loserSeat, withdrawn))
      ? [withdraw]
      : undefined;
  const byeMatchUp = indexed(view, matchUpId);
  if (!seat.bye || !seat.byeFromPropagation || !byeMatchUp) return undefined;
  const produced =
    (clearOnly
      ? indirectProducedRelaySeatOps(view, loserSeat, byeMatchUp, drawPosition, withdraw, withdrawn)
      : undefined) ??
    producedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw, withdrawn) ??
    awardedProducedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw, withdrawn) ??
    convergedProducedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw) ??
    terminalProducedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw) ??
    (clearing ? occupiedFinalRelaySeatOps(view, byeMatchUp, drawPosition, withdraw, withdrawn) : undefined);
  if (produced) return produced;
  // an exit carried onto the BYE matchUp's other side stands once the BYE goes: v1 re-derives the matchUp to it (a
  // final's consolation seat beside a carried walkover, S6 tail): v1's. Under `doubleExitPropagateBye: false` the carry
  // may be this double exit's own, relayed past the BYE on its way from the own seat (S7): the passage withdraws it
  // after this seat (`unwoundPassage`, which reads the matchUp as this withdrawal leaves it: `UnwindRelay`)
  const relayed = !!relay && ownCarryAlone(byeMatchUp, relay.sourceId);
  // ...or a participant's carried exit beside the BYE in the structure's last round, which stands once the BYE goes: v1
  // re-derives the matchUp to it (S7, `carriedBesideBye`); a carrier the BYE sent on (a next matchUp) is v1's
  const rederived = relayed ? undefined : carriedBesideBye(byeMatchUp, drawPosition);
  // ...or a carrier the BYE sent on into the next matchUp, whom v1 releases back out of it, the carry with them, and the
  // loser then arrives beside the carry and is awarded it (S7, `carrierSentOn`, `unwoundAwardOps`)
  const sentOn = relayed || rederived ? undefined : carrierSentOn(view, byeMatchUp, drawPosition, withdrawn);
  if (!relayed && !rederived && !sentOn && Object.keys(byeMatchUp.sideExitProvenance ?? {}).length) return undefined;
  // the BYE beside another (two paired double exits' loser seats, S6 tail): the standing BYE then advances the freed seat
  if (seat.opponentBye) return doubleByeSeatOps(view, loserSeat, byeMatchUp, withdraw);
  if (byeMatchUp.matchUpStatus !== BYE) return undefined;
  // the BYE matchUp links its own loser on: to be played again, it takes back the BYE it had sent to that seat
  // (`handleLoserMatchUpRemoval`): planned at a first-round seat holding a propagated BYE behind no condition (S6 tail)
  const cascade = byeMatchUp.loserMatchUpId ? cascadedSeatOps(view, loserSeat.beyond, withdrawn, released) : [];
  if (!cascade) return undefined;
  const opposite = loserSeat.drawPositions.filter((position) => position !== drawPosition);
  const ops: OutcomeOp[] = [
    withdraw,
    {
      op: 'clearMatchUpBye',
      matchUpId,
      drawPosition,
      ...((rederived ?? sentOn) ? { rederived: rederived ?? sentOn?.rederived } : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
  // a structure's last round (COMPASS's one-round structures): the BYE sent nothing on (S6 tail)
  if (!byeMatchUp.winnerMatchUpId) return [...ops, ...cascade];
  const next = indexed(view, byeMatchUp.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  // a BYE alone in its matchUp sent nobody on; a next matchUp holding a position is rewritten by v1's position clear
  // all the same, and announced (census 20660398, FEED_IN_CHAMPIONSHIP_TO_SF 16): v1's, unless the own seat's
  // withdrawal releases that position out of it and writes it last, the rewrite's notice superseded (S6 tail)
  if (!opposite.length) return held.some((position) => !released.has(position)) ? undefined : [...ops, ...cascade];
  if (opposite.length > 1 || !next || !held.includes(opposite[0])) return undefined;
  if (sentOn) return [...ops, ...carrierHomeOps(sentOn, drawPosition), ...cascade];
  const beyond = withdrawnByeNextOps(next, held, opposite[0], drawPosition, withdrawn, relayed ? relay : undefined);
  return beyond && [...ops, ...beyond, ...cascade];
}

/**
 * The next matchUp of a withdrawn BYE's matchUp, which the BYE had sent the opposite position on into (`unwoundSeatOps`):
 * the position taken back out of it. Where it is the passage's landing, the own carry pending there (S7), v1's removal
 * takes the position and the pending exit with it, named for the withdrawn BYE whether or not a position stays
 * (`updateMatchUpStatusAfterRemoval`; the release path leaves a pending exit alone), and the passage then finds nothing
 * of this unwind's there. Otherwise planned where it is to be played with no result or provenance: where another
 * position stands, as v1's position clear writes it, named for the withdrawn BYE; alone there, the matchUp is left with
 * no position, which v1 releases instead (`releaseAdvancedDrawPosition`, with neither event nor tournament):
 * FIRST_MATCH_LOSER_CONSOLATION's own seat beside an unfilled fed seat, the double BYE its unfillable seat makes behind
 * FIRST_MATCHUP (S6 tail). Undefined for anything else.
 */
function withdrawnByeNextOps(
  next: HydratedMatchUp,
  held: number[],
  advanced: number,
  drawPosition: number,
  withdrawn: Set<string>,
  relay?: UnwindRelay,
): OutcomeOp[] | undefined {
  const remaining = held.filter((position) => position !== advanced);
  const stamp: OutcomeOp = { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId };
  if (relay && next.matchUpStatus !== BYE && ownCarryAlone(next, relay.sourceId)) {
    if (next.sides?.some((side) => side.bye)) return undefined;
    const reset: OutcomeOp = {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: remaining,
      withdrawnByePosition: drawPosition,
      clearsPendingExit: true,
    };
    return [reset, stamp];
  }
  // a BYE beside the position there that this unwind withdraws is read as withdrawn: the matchUp is then to be played
  const byeStands = (side: HydratedSide) =>
    !!side.bye && !withdrawn.has(seatKey({ structureId: next.structureId, drawPosition: side.drawPosition }));
  const standing = next.sides?.some(byeStands);
  const toBePlayed = next.matchUpStatus === TO_BE_PLAYED || (next.matchUpStatus === BYE && !standing);
  if (!toBePlayed || next.winningSide || !scoreless(next)) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || standing) return undefined;
  const taken: OutcomeOp = remaining.length
    ? {
        op: 'setMatchUpDrawPositions',
        matchUpId: next.matchUpId,
        drawPositions: remaining,
        withdrawnByePosition: drawPosition,
      }
    : {
        op: 'setMatchUpDrawPositions',
        matchUpId: next.matchUpId,
        drawPositions: remaining,
        releasedDrawPosition: advanced,
        announcesContext: false,
      };
  return [taken, stamp];
}

/** the seat a BYE matchUp's loser link feeds, its BYE taken back as v1's round-1 loser cascade takes it (S6 tail) */
function cascadedSeatOps(
  view: OutcomeView,
  beyond: WinnerLoserSeat | undefined,
  withdrawn: Set<string>,
  released: Set<number>,
): OutcomeOp[] | undefined {
  if (!beyond?.seat?.bye || !beyond.seat.byeFromPropagation || beyond.linkCondition) return undefined;
  if (indexed(view, beyond.matchUpId)?.roundNumber !== 1) return undefined;
  const ops = unwoundSeatOps(view, beyond, true, withdrawn, released, true);
  // the cascade announces the matchUps it writes there, which stamps their structure (`structureStamps` reads no quiet seat)
  return ops && beyond.structureId
    ? [...ops, { op: 'stampUpdatedAt', entity: 'structure', id: beyond.structureId }]
    : ops;
}

/**
 * v1's `removeDirectedBye` at a seat whose BYE stands beside another BYE (the loser seats of two paired double exits, a
 * double BYE: S6 tail, family 4): the BYE withdrawn; the position the double BYE had sent on (the other BYE's) taken back
 * out of the next matchUp, which is to be played again, and what that matchUp, a BYE until then, had sent on in turn
 * released out of the matchUp beyond (`releaseAdvancedDrawPosition`); then, after the call's own write, the standing
 * BYE advances the freed seat into the next matchUp (`reconcileByeAdvancements`, announced `advanceWinner`; deferred by
 * `unwoundOps`). Planned where the next matchUp holds the other BYE's position and one more, nothing else, and the
 * matchUp beyond is to be played holding that one, alone or beside a position standing there (a feed round's fed seat:
 * the one taken out as v1's position clear takes it, named for the withdrawn BYE, S7). A next matchUp kept a BYE by
 * another standing BYE
 * (FIRST_MATCH_LOSER_CONSOLATION, the advance going on through it) is v1's.
 */
function doubleByeSeatOps(
  view: OutcomeView,
  loserSeat: WinnerLoserSeat,
  byeMatchUp: HydratedMatchUp,
  withdraw: OutcomeOp,
): OutcomeOp[] | undefined {
  const { drawPosition } = loserSeat;
  // the BYE matchUp keeps a BYE (the other one), so v1 cascades nothing from it, whatever it links its loser to (S6 tail)
  if (byeMatchUp.matchUpStatus !== BYE) return undefined;
  // the one other position of the BYE matchUp (a filtered list, not a side read by index)
  const [other, ...more] = loserSeat.drawPositions.filter((position) => position !== drawPosition);
  const next = indexed(view, byeMatchUp.winnerMatchUpId);
  const held = positionsOf(next);
  // the double BYE sent one of its two positions on: the other BYE's, which the freed seat then replaces (two paired
  // double exits' seats, family 4), or this seat's own, which stays as the freed seat it now is (a BYE matchUp's BYE
  // loser beside it, family 5)
  const advanced = held.find((position) => position === drawPosition || position === other);
  if (!other || more.length || !next || !advanced || held.length !== 2) return undefined;
  if (next.matchUpStatus !== BYE || next.winningSide || !scoreless(next) || next.loserMatchUpId) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || next.matchUpStatusCodes?.length) return undefined;
  const remaining = held.filter((position) => position !== advanced);
  const ownAdvanced = advanced === drawPosition;
  // the next matchUp, a BYE until now, sent its one other position on: that position comes back out of the matchUp beyond,
  // to be played. Where another standing BYE keeps the next matchUp a BYE (FIRST_MATCH_LOSER_CONSOLATION: the freed seat
  // then goes on through it), what it sent on was a BYE and the matchUp beyond is a BYE too: v1's
  const beyond = indexed(view, next.winnerMatchUpId);
  if (!beyond || beyond.matchUpStatus !== TO_BE_PLAYED || beyond.winningSide || !scoreless(beyond)) return undefined;
  if (Object.keys(beyond.sideExitProvenance ?? {}).length || beyond.matchUpStatusCodes?.length) return undefined;
  // the position the next matchUp, a BYE, sent on stands in the matchUp beyond; a feed round's fed seat beside it stays
  // (a plain round's other position came through a BYE this unwind takes back as well: released with it)
  const stood = beyond.feedRound ? positionsOf(beyond).filter((position) => position !== remaining[0]) : [];
  const taken: OutcomeOp[] = ownAdvanced
    ? []
    : [
        {
          op: 'setMatchUpDrawPositions',
          matchUpId: next.matchUpId,
          drawPositions: remaining,
          withdrawnByePosition: drawPosition,
        },
      ];
  const freed: OutcomeOp[] = ownAdvanced
    ? []
    : [
        // deferred past the call's own write (`unwoundOps`): the standing BYE advances the freed seat
        {
          op: 'setMatchUpDrawPositions',
          matchUpId: next.matchUpId,
          drawPositions: [...remaining, drawPosition].sort((a, b) => a - b),
          advancesThroughBye: true,
          announcesEvent: true,
        },
      ];
  return [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId: next.matchUpId, drawPosition },
    ...taken,
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    // alone there it is released; beside a position standing there (a feed round's fed seat) it is taken out as v1's
    // position clear takes it, named for the withdrawn BYE (S7)
    stood.length
      ? {
          op: 'setMatchUpDrawPositions',
          matchUpId: beyond.matchUpId,
          drawPositions: stood,
          withdrawnByePosition: drawPosition,
        }
      : {
          op: 'setMatchUpDrawPositions',
          matchUpId: beyond.matchUpId,
          drawPositions: [],
          releasedDrawPosition: remaining[0],
          announcesContext: false,
        },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: beyond.matchUpId },
    ...freed,
  ];
}

/**
 * The writes at a level's loser seat: the BYE the double exit placed there withdrawn (`unwoundSeatOps`), or under
 * `doubleExitPropagateBye: false` the matchUp holding the seat visited and walked on from (`unwoundBranch`), as v1's
 * `removeDoubleExit` takes one branch or the other by what the seat holds.
 */
function unwoundLevelSeatOps(
  view: OutcomeView,
  level: { loserSeat?: WinnerLoserSeat },
  at: { first: boolean; placed: boolean; kept: boolean },
  withdrawn: Set<string>,
  branched: boolean,
  released: Set<number> = new Set(),
  relay?: UnwindRelay,
  clearing = false,
  clearOnly = false,
): OutcomeOp[] | undefined {
  const { loserSeat } = level;
  if (!loserSeat) return [];
  const byeHeld = loserSeat.matchUpStatus === BYE;
  // a convergence re-derived still sends its seat nobody: the BYE it placed there stands (v1 withdraws the claim and
  // P39 claims it back, `settleRederivedDoubleExit`), nothing written. Under `doubleExitPropagateBye: false` the seat
  // holds the carries' own convergence, which the first level's branch refuses before this level is read
  if (at.kept) return [];
  if (branched && !byeHeld) return unwoundBranch(view, loserSeat, at.first, withdrawn, relay);
  if (branched && !loserSeat.seat?.bye) return unwoundPassage(view, loserSeat, relay);
  // the relay is read whatever the policy: only under `doubleExitPropagateBye: false` can a BYE matchUp hold this
  // double exit's own carry (its loser seats take BYEs otherwise), so it refuses nothing new under the default
  return unwoundSeatOps(view, loserSeat, at.placed, withdrawn, released, false, relay, clearing, clearOnly);
}

/**
 * Under `doubleExitPropagateBye: false`, the double exit's carried exit placed opposite a generated BYE: it passed the
 * BYE (RULE 1), recorded beside it and beside each BYE-held matchUp after, and stands pending where it landed. The unwind
 * takes it back as v1's `removeDoubleExit` visits the seat (S7): each BYE matchUp passed keeps its BYE, its provenance
 * withdrawn by a score write that names neither event nor tournament; then the landing is written back to be played,
 * quietly, the carrier's position standing in it (the BYE sent it there). Undefined where the walk meets anything else:
 * another origin beside the carry, an award at the landing (somebody stood opposite and went on), a result.
 */
function unwoundPassage(view: OutcomeView, loserSeat: WinnerLoserSeat, relay?: UnwindRelay): OutcomeOp[] | undefined {
  const { drawPosition } = loserSeat;
  const start = indexed(view, loserSeat.matchUpId);
  // the seat's matchUp is BYE-held, the seat itself not a BYE: the generated BYE stands opposite (`unwoundLevelSeatOps`)
  if (!start) return undefined;
  const passed: HydratedMatchUp[] = [];
  let at: HydratedMatchUp | undefined = start;
  let landing: HydratedMatchUp | undefined;
  // the landing a deeper seat's withdrawal already wrote back (`clearsPendingExit`): v1's chain finds nothing of this
  // unwind's there and stops (S7)
  while (at && !landing && !relay?.reset.has(at.matchUpId)) {
    const side = sideOf(at, drawPosition);
    const entry = side ? at.sideExitProvenance?.[side] : undefined;
    if (!carriedExitStatus(entry) || Object.keys(at.sideExitProvenance ?? {}).length !== 1) return undefined;
    if (at.matchUpStatus === BYE) passed.push(at);
    else if (at.matchUpStatus !== carriedExitStatus(entry) || at.winningSide || !scoreless(at)) return undefined;
    else landing = at;
    if (passed.length > 8) return undefined;
    at = landing ? undefined : indexed(view, at.winnerMatchUpId);
  }
  const landed: OutcomeOp[] = landing
    ? [
        {
          op: 'setMatchUpResult',
          matchUpId: landing.matchUpId,
          matchUpStatus: TO_BE_PLAYED,
          score: BLANK_SCORE,
          matchUpStatusCodes: [],
          stampsScoredTime: false,
          announcesContext: false,
        },
        { op: 'setSideExitProvenance', matchUpId: landing.matchUpId },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
      ]
    : [];
  // each BYE matchUp passed, its provenance withdrawn by v1's score write (the blank score, codes `[]`), which names
  // neither event nor tournament; one whose BYE a deeper seat's withdrawal took (the unfillable seat's, `cleared`) is to
  // be played by then, and v1 writes it so (S7)
  const relayed = passed.flatMap((matchUp): OutcomeOp[] => [
    {
      op: 'setMatchUpResult',
      matchUpId: matchUp.matchUpId,
      matchUpStatus: relay?.cleared.has(matchUp.matchUpId) ? TO_BE_PLAYED : BYE,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcesContext: false,
    },
    { op: 'setSideExitProvenance', matchUpId: matchUp.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUp.matchUpId },
  ]);
  // v1's notice for each matchUp written stamps its structure (`modifyMatchUpNotice`; `structureStamps` reads no quiet seat)
  const stamped: OutcomeOp[] = [{ op: 'stampUpdatedAt', entity: 'structure', id: loserSeat.structureId }];
  return [...relayed, ...landed, ...stamped];
}

/**
 * The double exit's carried exit on the matchUp its loser link feeds, alone there (`doubleExitPropagateBye: false`): the
 * origin on the fed side (which only this double exit's loser link feeds) carries the matchUp's status; a winner opposite
 * or none yet; scoreless. Anything else there (a convergence, whose status is a double exit's; a BYE) is not this
 * unwind's.
 */
function carriesAlone(matchUp: HydratedMatchUp, drawPosition: number): boolean {
  const fedSide = matchUp.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  if (!fedSide) return false;
  const status = carriedExitStatus(matchUp.sideExitProvenance?.[fedSide]);
  if (!status || matchUp.matchUpStatus !== status) return false;
  if (matchUp.winningSide && matchUp.winningSide !== 3 - fedSide) return false;
  return scoreless(matchUp) && !matchUp.sides?.some((side) => side.bye);
}

/** The own carried convergence dissolves before its produced relay, whose foreign onward origin stands. */
function unwoundOwnConvergence(view: OutcomeView, seat: WinnerLoserSeat, relay?: UnwindRelay): OutcomeOp[] | undefined {
  const start = indexed(view, seat.matchUpId);
  const next = indexed(view, start?.winnerMatchUpId);
  const onwardId = next && relay?.retained.get(next.matchUpId);
  if (!start || !next || !onwardId || next.winnerMatchUpId !== onwardId) return undefined;
  // Numeric positions are forwarded only within this structure.
  if (next.structureId !== start.structureId) return undefined;
  if (!isDoubleExit(start.matchUpStatus) || start.winningSide || !scoreless(start)) return undefined;
  if (start.loserMatchUpId || start.matchUpStatusCodes?.length || start.sides?.some((side) => side.bye))
    return undefined;
  const fedSide = sideOf(start, seat.drawPosition);
  if (!fedSide) return undefined;
  const own = start.sideExitProvenance?.[fedSide];
  const keptSide = (3 - fedSide) as 1 | 2;
  const kept = start.sideExitProvenance?.[keptSide];
  const status = carriedExitStatus(kept);
  const source = indexed(view, kept?.sourceMatchUpId);
  if (Object.keys(start.sideExitProvenance ?? {}).length !== 2 || own?.sourceMatchUpId !== relay?.sourceId)
    return undefined;
  if (!carriedExitStatus(own) || !kept || !status || kept.previousMatchUpStatus !== status) return undefined;
  if (source?.loserMatchUpId !== start.matchUpId || source.matchUpStatus !== status) return undefined;
  const copy = Object.values(next.sideExitProvenance ?? {});
  if (next.matchUpStatus !== BYE || copy.length !== 1 || copy[0].sourceMatchUpId !== start.matchUpId) return undefined;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: next.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcesContext: false,
    },
    { op: 'setSideExitProvenance', matchUpId: next.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    {
      op: 'setMatchUpResult',
      matchUpId: start.matchUpId,
      matchUpStatus: status,
      winningSide: fedSide,
      retainedExitPlanned: true,
      score: BLANK_SCORE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
    },
    { op: 'setSideExitProvenance', matchUpId: start.matchUpId, provenance: { [keptSide]: kept } },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: start.matchUpId },
    { op: 'stampUpdatedAt', entity: 'structure', id: seat.structureId },
  ];
}

/**
 * Under `doubleExitPropagateBye: false` the seat a level's loser link feeds shows no BYE: the double exit carries its exit
 * there, awarded to whoever stands or arrives opposite, and a further level's seat holds nothing of this unwind's. v1
 * visits the matchUp all the same (`conditionallyRemoveDrawPosition`, the loser branch of `removeDoubleExit`) and walks on
 * from it as it walks the main path, over winner and loser links alike: the position its result sent on taken back out
 * of the next matchUp (`removeDirectedWinner`), its winner path to its final and across the final's winner link, the
 * matchUp its own loser link feeds (DOUBLE_ELIMINATION's Main final into the Decider), each matchUp written back to be
 * played, deepest first, the visited matchUp last; the first level's with the call's context, the rest without. Planned
 * where the first level's matchUp holds the carried exit alone (`carriesAlone`) and every other matchUp reached holds
 * nothing (`unwoundClean`). Undefined for anything else: a BYE's or a convergence's seat; a BYE standing where the walk
 * leads (the carry's award, with nobody for a loser, sent one on through the chain beyond: COMPASS, OLYMPIC; another
 * double exit's).
 */
function unwoundBranch(
  view: OutcomeView,
  loserSeat: WinnerLoserSeat,
  first: boolean,
  withdrawn: Set<string>,
  relay?: UnwindRelay,
): OutcomeOp[] | undefined {
  const start = indexed(view, loserSeat.matchUpId);
  if (!start) return undefined;
  if (first && !carriesAlone(start, loserSeat.drawPosition)) return unwoundOwnConvergence(view, loserSeat, relay);
  const all = view.inContextDrawMatchUps ?? [];
  const taken = new Set<number>();
  const written = new Set<string>();
  const write = (matchUp: HydratedMatchUp, context: boolean): OutcomeOp[] => {
    written.add(matchUp.matchUpId);
    return [
      {
        op: 'setMatchUpResult',
        matchUpId: matchUp.matchUpId,
        matchUpStatus: TO_BE_PLAYED,
        score: BLANK_SCORE,
        matchUpStatusCodes: [],
        stampsScoredTime: false,
        ...(context ? {} : { announcesContext: false as const }),
      },
      ...(context ? [{ op: 'setSideExitProvenance' as const, matchUpId: matchUp.matchUpId }] : []),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUp.matchUpId },
    ];
  };
  // v1's `removeSubsequentRoundsParticipant`: the position out of every later round of the structure holding it
  // v1's `removeSubsequentRoundsParticipant`: the position out of every later round holding it. The next matchUp is
  // the only one that can: a further advance is a result standing (the call refused) or a BYE this unwind withdraws
  // (`unwoundSeatOps` takes the position back there)
  const takeBack = (next: HydratedMatchUp, position: number): OutcomeOp => {
    taken.add(position);
    return {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: positionsOf(next).filter((held) => held !== position),
      removedDrawPosition: position,
    };
  };
  const walk = (matchUp: HydratedMatchUp, context: boolean, depth: number): OutcomeOp[] | undefined => {
    if (depth > all.length) return undefined;
    // every matchUp written back holds nothing of a result; the first level's holds the carry alone (`carriesAlone`)
    if (!context && !unwoundClean(matchUp, withdrawn)) return undefined;
    const ops: OutcomeOp[] = [];
    const next = indexed(view, matchUp.winnerMatchUpId);
    if (next) {
      // across a winner link positions are another structure's (v1 follows the participant, `removeLinkedWinner`: a clean
      // final sent nobody)
      const crossed = next.structureId !== matchUp.structureId;
      const sent = crossed
        ? []
        : positionsOf(matchUp).filter((held) => positionsOf(next).includes(held) && !taken.has(held));
      // only the carry's award sent anyone on; v1 takes back the first position it finds
      if (sent.length && (!matchUp.winningSide || sent.length > 1)) return undefined;
      if (sent.length) ops.push(takeBack(next, sent[0]));
      const deeper = walk(next, false, depth + 1);
      if (!deeper) return undefined;
      ops.push(...deeper);
    }
    // v1 walks on over the matchUp's own loser link too, the matchUp there visited as any (OLYMPIC's West into its
    // South; DOUBLE_ELIMINATION's Main final into the Decider); where the carry's award, with nobody for a loser, has
    // sent a BYE on through the chain beyond (COMPASS), the walk stops: v1's
    const target = indexed(view, matchUp.loserMatchUpId);
    if (matchUp.loserMatchUpId && !target) return undefined;
    if (target) {
      const side = walk(target, false, depth + 1);
      if (!side) return undefined;
      ops.push(...side);
    }
    ops.push(...write(matchUp, context));
    return ops;
  };
  const ops = walk(start, first, 0);
  if (!ops) return undefined;
  // v1's notice for each matchUp written stamps its structure (`modifyMatchUpNotice`); the call's own is stamped once
  // by the plan, the others here (no seat op names them, as `structureStamps` reads)
  const source = view.targets.source.structureId;
  const structures = new Set(
    [...written].flatMap((id) => {
      const structureId = indexed(view, id)?.structureId;
      return structureId && structureId !== source ? [structureId] : [];
    }),
  );
  return [
    ...ops,
    ...[...structures].map((id) => ({ op: 'stampUpdatedAt' as const, entity: 'structure' as const, id })),
  ];
}

/**
 * The cleared double exit's unwind, as v1 writes it, deepest first: at each level the seat its loser link feeds, then
 * the matchUp written back to be played through `modifyMatchUpScore` (no `scoredTime` rule), its codes `[]` and its
 * score blanked, the produced exit's origin withdrawn; the call's own seat last, before the clear's own write. v1's walk
 * past the produced exit's matchUp passes on neither the tournament nor the event, so those writes are announced without
 * them (`announcesContext: false`).
 */
function unwoundOps(
  view: OutcomeView,
  request: OutcomeRequest,
  route: Route | undefined,
  drawDefinition?: DrawDefinition,
  retainOccupiedAward = route === CLEAR_SCORE,
): { ops: OutcomeOp[]; reannounced: OutcomeOp[]; seatPrograms: OutcomeOp[][] } {
  if ((route !== CLEAR_SCORE && route !== 'winner') || !isDoubleExit(view.existing.matchUpStatus))
    return { ops: [], reannounced: [], seatPrograms: [] };
  const ownPrograms = standingReservationPrograms({ view, request, route });
  const levels =
    unwoundPath(view, request.matchUpId, drawDefinition, retainOccupiedAward, route === CLEAR_SCORE, ownPrograms) ?? [];
  const retainedAward =
    retainOccupiedAward &&
    levels.some(({ seatOps }) => seatOps.some((op) => op.op === 'clearMatchUpBye' && !!op.retainedCarriedAward));
  // a seat's advance through a standing BYE is v1's `reconcileByeAdvancements`, after the call's own write; so is a
  // released landing's write back to be played (`carrierHomeOps`), announced by `reconcileScoredTimes` after everything
  const deferred = (op: OutcomeOp) =>
    (op.op === 'setMatchUpDrawPositions' && !!op.advancesThroughBye) ||
    (op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes');
  const pendingOps: OutcomeOp[] = levels.flatMap(({ matchUpId, pendingRemoval }) =>
    pendingRemoval
      ? [
          {
            op: 'setMatchUpDrawPositions',
            matchUpId,
            drawPositions: [],
            removedDrawPosition: pendingRemoval.drawPosition,
            withdrawsPendingAward: true,
            announcesContext: false,
          },
          { op: 'setSideExitProvenance', matchUpId, provenance: pendingRemoval.provenance },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
        ]
      : [],
  );
  const ops = [
    ...pendingOps,
    ...[...levels]
      .reverse()
      .flatMap(({ matchUpId, seatOps: all, released, rederived, pendingRemoval }, depth): OutcomeOp[] => {
        if (pendingRemoval) return [];
        const seatOps = all.filter((op) => !deferred(op));
        if (matchUpId === request.matchUpId) return seatOps;
        const produced = depth === levels.length - 2;
        const stored = indexed(view, matchUpId);
        const drawPositions = positionsOf(stored).filter((position) => position !== released);
        // a convergence dissolved: the kept origin's exit, pending, its score the blank one v1's write leaves (a double
        // default stored none) and its codes re-derived (none to keep). Its `modifyMatchUp` is the settle pass's (`reannounced`
        // below), with the event and tournament at every depth; only the in-context notice is this write's
        if (rederived) {
          return [
            ...seatOps,
            {
              op: 'setMatchUpResult',
              matchUpId,
              matchUpStatus: rederived.matchUpStatus,
              score: BLANK_SCORE,
              matchUpStatusCodes: [],
              stampsScoredTime: false,
              ...(retainedAward && !stored?.winnerMatchUpId && !stored?.loserMatchUpId
                ? { retainedExitPlanned: true as const }
                : {}),
              ...(produced ? {} : { announcesContext: false as const }),
            },
            { op: 'setSideExitProvenance', matchUpId, provenance: rederived.provenance },
            { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
          ];
        }
        // the origin withdrawn off the matchUp that held it: the produced exit's, or a dissolved convergence's beyond
        const carried = Object.keys(stored?.sideExitProvenance ?? {}).length > 0;
        return [
          ...seatOps,
          ...(released ? [{ op: 'setMatchUpDrawPositions' as const, matchUpId, drawPositions }] : []),
          {
            op: 'setMatchUpResult',
            matchUpId,
            matchUpStatus: TO_BE_PLAYED,
            score: BLANK_SCORE,
            matchUpStatusCodes: [],
            stampsScoredTime: false,
            ...(produced ? {} : { announcesContext: false as const }),
          },
          ...(carried ? [{ op: 'setSideExitProvenance' as const, matchUpId }] : []),
          { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
        ];
      }),
  ];
  // v1's `settleRederivedDoubleExits` writes each dissolved convergence again as it stands, after the call's own write:
  // its `modifyMatchUp` is announced there, under the pass's name (the in-context notice stays at the unwind's write)
  const reannounced: OutcomeOp[] = levels.flatMap(({ matchUpId, rederived }): OutcomeOp[] =>
    rederived
      ? [
          {
            op: 'setMatchUpResult',
            matchUpId,
            matchUpStatus: rederived.matchUpStatus,
            matchUpStatusCodes: [],
            stampsScoredTime: false,
            announcedAs: 'settleRederivedDoubleExit',
          },
        ]
      : [],
  );
  reannounced.push(...levels.flatMap(({ seatOps }) => seatOps.filter(deferred)));
  return { ops, reannounced, seatPrograms: levels.map(({ seatOps }) => seatOps) };
}

/**
 * S7: a TEAM call is v1's but for its owned shape: a line's first result (scored, a winner alone, a single exit:
 * WALKOVER, DEFAULTED, RETIRED, or a double exit written as it stands), whose dual's tally follows from it. v1 writes the
 * line, then `updateTieMatchUpScore` writes the dual through `modifyMatchUpScore`, with no `scoredTime`: the sides it
 * ensures and the tieFormat it copies on (`line.dualRewrite`, where they change: on a dual's first line, or a record
 * that stored neither), its tally and the status it derives from it; a dual already decided keeps its winner and is
 * directed no further. A line that decides its dual is planned with the dual's own call. A line's result removed, or a
 * line cleared, or its result corrected, is planned where its dual's winner does not change and the dual still holds a
 * line's result: the line rewritten, the dual's tally re-read (it directs nothing: `removalReason` is not asked, nor is
 * it a re-entered or changed winner). A line that un-decides its dual (`line-score`) is planned with the dual's own
 * removal (`undecidingLineOps`). Stay v1's: a removal or correction that un-decides its dual by its own route, a removal
 * that leaves the dual holding no result (`updateTieMatchUpScore` removes its score and an inherited tieFormat), a
 * REPORTED score, and auto-calc off. A line in a round robin takes its dual's group tally (`groupTally`).
 */
function teamReason({
  request,
  asDual,
  route,
  view,
  dual,
}: {
  request: OutcomeRequest;
  view: OutcomeView;
  dual?: DualCall;
  asDual?: true;
  route?: Route;
}): AbstainReason | undefined {
  if (asDual) return undefined;
  if (!view.isTeam && !view.line && !view.matchUpTieId && !view.existing.collectionId) return undefined;
  if (view.isTeam && !view.line) return dualCallReason(view, route);
  const { line, existing } = view;
  // a line's result with a winner, or its double exit (written as it stands, `only-score`, its dual tallied without it)
  if (!line || view.isTeam) return 'team';
  // a line's result removed, or a line cleared: v1 clears it and re-reads its dual's tally (`removeDirectedParticipants`)
  const removing = route === REMOVE_DIRECTED || route === CLEAR_SCORE;
  // a line that un-decides its dual: the dual's own removal is planned with it (`undecidingLineOps`, S7)
  const undeciding = route === LINE_SCORE && !!dual;
  if (!removing && !undeciding && route !== 'winner' && !isDoubleExit(request.matchUpStatus)) return 'team';
  // a line's stored result corrected (`winner` over a winner)
  const correcting = (route === 'winner' || undeciding) && !!existing.winningSide;
  if (!removing && !correcting && !undeciding && (existing.matchUpStatus !== TO_BE_PLAYED || existing.winningSide))
    return 'team';
  if (line.autoCalcDisabled || line.dualRewrite.scoreReported || !line.projectedScore) return 'team';
  // a round robin's group tally is re-read from the dual the line writes (S7: `groupTally`, the group read off the dual)
  if (view.draw.tallied && !view.group) return 'team';
  // a line played on a dual already decided keeps its winner: only the dual's tally changes. A fresh line cannot hand it
  // to the other side, and one that un-decides it (a dual decided by its own call or its own exit, which v1 then projects
  // from its lines alone) is routed `line-score` and planned with the dual's own removal (`undecidingLineOps`); a line
  // that is itself a single exit passes `lineExitReason` first (S7)
  // a removal or correction that changes the dual's winner: v1 takes the dual's winner back out of the next dual
  if ((removing || correcting) && line.projectedWinningSide !== line.dualWinningSide) return 'team';
  if (line.dualWinningSide) return undefined;
  const dualStatuses = new Set<string | undefined>([TO_BE_PLAYED, IN_PROGRESS, DEAD_RUBBER]);
  if (!dualStatuses.has(line.dualMatchUpStatus)) return 'team';
  // a line that decides its dual: the dual's own call is planned with it (`decidingLineOps`, S7)
  if (line.projectedWinningSide) return dual && line.projectedStatus === COMPLETED ? undefined : 'team';
  return line.projectedStatus === IN_PROGRESS ? undefined : 'team';
}

/**
 * S7: a dual's own call given a winner, or its own double exit. v1 writes a winner as any winner (`directParticipants`:
 * the result, `scoredTime`, the winner placed in the next dual, announced `assignMatchUpDrawPosition`), and a double exit
 * as any double exit (`doubleExitAdvancement`: the exit it produces in the next dual, BYEs on the seats its loser links
 * feed), after `ensureSideLineUps` has written the dual's sides (`ensuredSides`). It carries no line-up on: that is a
 * deciding line's (`propagateLineUp`), its first entry's drawPosition not yet sided in the next dual. An exit carried
 * across a loser link is written on the dual it reaches by that dual's own call (`carriedDualLanding`). A dual already
 * decided is planned as any decided matchUp is: its winner entered again writes the team's line-up on the next dual
 * (`winnerLineUpOps`), a changed winner is re-directed. A call that disables auto-calc writes `disableAutoCalc`, one
 * that enables it removes it and takes the winner its lines project (`autoCalcWrite`, `dualProjection`). Stays v1's: an
 * enabling call whose lines project no winner (not the winner's route), and a dual holding no winner and neither to be
 * played nor in progress (a double exit). A dual in a round robin takes its group's tally (`groupTally`).
 */
function dualCallReason(view: OutcomeView, route?: Route): AbstainReason | undefined {
  const { existing } = view;
  if (route !== 'winner' && route !== DOUBLE_EXIT) return 'team';
  // a dual decided is planned as any decided matchUp is (its winner entered again or changed); one holding another
  // status (a double exit, or neither to be played nor in progress) stays v1's
  const open = existing.matchUpStatus === TO_BE_PLAYED || existing.matchUpStatus === IN_PROGRESS;
  if (!open && !existing.winningSide) return 'team';
  // a dual in a round robin: its group's tally re-read with its result in place (`groupTally`)
  return view.draw.tallied && !view.group ? 'team' : undefined;
}

/**
 * S7: the dual after its line's result, as `updateTieMatchUpScore` writes it (`modifyMatchUpScore`): a dual already
 * decided keeps its winner
 */
const dualTallyOps = (line?: OutcomeView['line'], route?: Route): OutcomeOp[] =>
  line?.projectedScore && line.projectedStatus
    ? [
        {
          op: 'setMatchUpResult',
          matchUpId: line.dualMatchUpId,
          matchUpStatus: line.projectedStatus,
          winningSide: line.projectedWinningSide as 1 | 2 | undefined,
          score: line.projectedScore as Score,
          stampsScoredTime: false,
          dualTally: {
            sides: line.dualRewrite.sides,
            tieFormat: line.dualRewrite.tieFormat,
            ...(route === REMOVE_DIRECTED || route === CLEAR_SCORE ? { unreturned: true as const } : {}),
          },
        },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: line.dualMatchUpId },
      ]
    : [];

function abstainReason(args: PlanArgs): AbstainReason | undefined {
  const { request, view, write, direction } = args;
  const team = teamReason(args);
  if (team) return team;
  if (writeLegacyEnabled()) return 'write-mode';
  if (!view.draw.storesEdges) return 'edges';
  if (scheduleReason(args)) return 'schedule';
  if (notesReason(request, view, args.route)) return 'notes';
  if (request.matchUpStatusCodes?.length) return 'status-codes';
  if (view.draw.perMatchUpCompetition && (request.winningSide || write?.winningSide)) return 'competition';
  // S7: a TEAM line's double exit (`only-score`), written as it stands: it directs nothing of its own, its targets being
  // its dual's, and its dual is tallied without it. A line's single exit still meets `exitReason` (a DEFAULTED under a
  // scoring policy's `incompleteAssignmentsOnDefault` writes `processCodes`, v1's)
  if (view.line && isDoubleExit(request.matchUpStatus)) return undefined;
  const exit = exitReason(args);
  if (exit) return exit;
  if (satisfiedDoubleExit(view, request, args.route)) return undefined;
  // S4: a score changed beneath an active downstream keeps its winner and re-directs nothing (`apply-values`)
  const sameWinner =
    args.route === 'apply-values' && !!write?.winningSide && write.winningSide === view.existing.winningSide;
  // S4: the same winner entered again with nothing downstream active, re-directed where they already stand
  const reentered = reentersWinner(view, args.route, write);
  // S4: another winner with nothing downstream active: the old direction taken back, the new one made
  const changing = changesWinner(view, args.route, write);
  // S4: a swap, the two participants' paths exchanged in their structure
  const swapping = args.route === 'swap';
  // S4: a decided result cleared while its downstream is untouched takes back what it directed (`remove-directed`)
  const removing = args.route === REMOVE_DIRECTED && !!view.existing.winningSide && !write?.winningSide;
  // a winner cleared or changed in a WIN_RATIO structure: v1's own removal (`removeDirected`) reports the playoff
  // structures it reaches (`connectedStructures`, a flag on the result), which v2 does not read. A dual's removal a line
  // makes (`undecidingLineOps`) runs v1's `scoreModification`, which reports nothing: not walled (S7)
  if ((removing || changing) && view.draw.winRatio && !args.asDual) return 'link';
  // a TEAM line directs nothing, its targets being its dual's: its result removed or corrected takes back and re-enters
  // nothing (no re-entered or changed winner), its dual's tally re-read (`teamReason`, S7)
  if (removing) {
    const removal = view.line ? undefined : removalReason(view, direction);
    if (removal) return removal;
  } else if (view.existing.winningSide && !view.line && !sameWinner && !reentered && !changing && !swapping)
    return 'winner';
  const shape = shapeReason(args, { sameWinner, reentered, changing, swapping });
  if (shape) return shape;
  if (view.existing.hasSideExitProvenance || view.existing.carriedExit) return 'provenance';
  // a round robin group's tally is planned (`setParticipantResults`, S3; a TEAM group's, S7); an ad hoc or lucky tally
  // that `view.group` does not hold is not yet
  if (view.draw.tallied && !view.group) return 'tallied';
  return undefined;
}

/** the reason the call's own shape is not planned, by the shape `abstainReason` found it to be */
function shapeReason(
  args: PlanArgs,
  shape: { sameWinner: boolean; reentered: boolean; changing: boolean; swapping: boolean },
): AbstainReason | undefined {
  const { request, view, write, direction } = args;
  if (shape.sameWinner) return applyValuesReason(args);
  if (shape.reentered) return reenteredReason(view, write, direction);
  if (shape.changing) return changedWinnerReason(view, write, direction);
  if (shape.swapping) return swapReason(view, write);
  // S5: a double exit's produced exit, vetted by `producedReason`
  if (args.route === DOUBLE_EXIT) return undefined;
  const directing = !!(request.winningSide || write?.winningSide || direction);
  return directing ? directionReason(args) : localReason(args);
}

/**
 * The winner's position joining the next matchUp, which v1 stores ascending. For a changed winner the old winner's
 * position comes out as the new one goes in, and the matchUp's score with it (v1's `removeSubsequentRoundsParticipant`).
 */
function winnerPlacementOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  winner?: DirectionPlan['winner'],
): OutcomeOp[] {
  const target = view.targets.winner;
  const position = write.winningSide ? view.targets.sideDrawPositions[write.winningSide as 1 | 2] : undefined;
  if (!winner || !position || !target) return [];
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

/**
 * A swap's relabel in later rounds of its structure, each matchUp stamped: written before the result, as v1 announces
 * the path (`exchangePathPositions`) and then the score
 */
function swapOps(view: OutcomeView, route: Route | undefined): OutcomeOp[] {
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
function placedDirection(
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
function replacedLoserOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  matchUpStatus?: MatchUpStatusUnion,
): OutcomeOp[] {
  return changesWinner(view, route, write) ? removedLoserOps(view, matchUpStatus) : [];
}

function removedOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  matchUpStatus?: MatchUpStatusUnion,
): OutcomeOp[] {
  if (changesWinner(view, route, write)) return [];
  const { targets, existing } = view;
  const position = existing.winningSide ? targets.sideDrawPositions[existing.winningSide as 1 | 2] : undefined;
  if (!removesDirection(view, route, write) || !position || !targets.winner || !targets.winnerMatchUpId) return [];
  const drawPositions = targets.winner.drawPositions.filter((candidate) => candidate !== position);
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: targets.winnerMatchUpId,
      drawPositions,
      removedDrawPosition: position,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: targets.winnerMatchUpId },
    ...removedLoserOps(view, matchUpStatus),
  ];
}

/**
 * the loser's seat across the link emptied, and their matchUp's codes re-derived (`[]`) where it stored none. v1's
 * `removeDirectedLoser` re-derives them only when the call names a status (its `sourceMatchUpStatus`): a clear that names
 * none leaves them as they are. Only that write announces the matchUp, and its notice stamps the matchUp's structure, so
 * the structure is stamped with it and not otherwise
 */
function removedLoserOps(view: OutcomeView, matchUpStatus?: MatchUpStatusUnion): OutcomeOp[] {
  const { loserMatchUpId, loserStructureId, loserTargetDrawPosition, loserMatchUpRecord } = view.targets;
  const participantId = storedLoserId(view);
  if (!loserMatchUpId || !loserStructureId || !loserTargetDrawPosition || !participantId) return [];
  const codes: OutcomeOp[] =
    !matchUpStatus || loserMatchUpRecord?.matchUpStatusCodes
      ? []
      : [
          { op: 'setMatchUpStatusCodes', matchUpId: loserMatchUpId, matchUpStatusCodes: [] },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: loserMatchUpId },
          { op: 'stampUpdatedAt', entity: 'structure', id: loserStructureId },
        ];
  return [
    { op: 'clearPosition', structureId: loserStructureId, drawPosition: loserTargetDrawPosition, participantId },
    ...codes,
  ];
}

/**
 * The ops of a complete plan for `request`, or the reason there is none. `write` and `direction` are what `planWrite`
 * and `planDirection` already decided; this re-states a complete one as ops and adds the stamps (F2 (i): the matchUp,
 * its structure and the draw, each once).
 */
/**
 * S6: a decided result turned into a double exit (the `completed-to-double-exit` route). v1 takes back what the result
 * directed (`removeDirectedParticipants`: the winner's position out of the next matchUp, the loser out of the seat their
 * link fed), then writes the double exit and advances it as a fresh one. So the plan is S4's removal, planned on the draw
 * as the call found it (`resultRemovalReason`), then S5's double exit, planned on the draw as the removal leaves it: the
 * removal and the matchUp left with no result are folded into the working view, which is read again (`rebuild`), and the
 * double exit is planned there as on a matchUp holding no result. The write is the route's own: a DOUBLE_WALKOVER blanks
 * the score, a DOUBLE_DEFAULT keeps it (CA, 2026-10-02).
 */
function resultToDoubleExit(args: PlanArgs): OutcomePlan {
  const { view, request, rebuild } = args;
  const removing = resultRemovalReason(view);
  if (removing) return { abstain: removing };
  const removal = resultRemovalOps(view, request.matchUpStatus);
  const undecided: OutcomeOp = {
    op: 'setMatchUpResult',
    matchUpId: request.matchUpId as string,
    matchUpStatus: TO_BE_PLAYED,
    stampsScoredTime: false,
  };
  const after = rebuild?.([...removal, undecided], DOUBLE_EXIT);
  if (!after) return { abstain: 'exit' };
  const produced = planOps({ ...args, view: after.view, direction: after.direction, route: DOUBLE_EXIT });
  if (!produced.ops) return produced;
  return { ops: [...removal, ...produced.ops], shape: produced.shape };
}

/**
 * The result's direction taken back as S4 takes back a cleared result (`removalReason`): the winner alone in a clean
 * next matchUp of the same structure, the loser, if a link took them, on the seat it fed in a matchUp they have not
 * played. Not a result in a group (its tally), a WIN_RATIO structure, nor one with side provenance or a carried exit.
 */
function resultRemovalReason(view: OutcomeView): AbstainReason | undefined {
  if (!view.existing.winningSide) return 'exit';
  if (view.group || view.draw.tallied) return 'tallied';
  if (view.draw.winRatio) return 'link';
  if (view.existing.hasSideExitProvenance || view.existing.carriedExit) return 'provenance';
  return removalReason(view);
}

/** S4's removal of the stored result's direction, whatever the route: the winner's position, then the loser's seat */
function resultRemovalOps(view: OutcomeView, matchUpStatus?: MatchUpStatusUnion): OutcomeOp[] {
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
  return [...winner, ...removedLoserOps(view, matchUpStatus)];
}

/**
 * The carried exit's ops (S5): the loser's own arrival carrying it, or, the same winner relabelled an exit, the loser
 * where they already stand (`relabelCarryReason`), whom the direction does not place again
 */
function carriedFor(
  view: OutcomeView,
  args: PlanArgs,
  loser?: DirectionPlan['loser'],
): { relay: OutcomeOp[]; landing: OutcomeOp[] } {
  const write = args.write as MatchUpWrite;
  if (loser?.arrives) return carriedOps(view, args.request, write, loser);
  const relabelled =
    reentersWinner(view, args.route, write) ||
    relabelsWhereWinnerStands(view, args.route, write) ||
    args.route === 'swap'
      ? args.direction?.loser
      : undefined;
  if (relabelled?.withdrawn) return { relay: [], landing: withdrawnOps(view) };
  if (!relabelled?.exit) return { relay: [], landing: [] };
  // the same exit entered again leaves the carry as it is: v1 writes the matchUp alone (S6 tail)
  if (view.targets.loserMatchUpCarryHeld && view.targets.loserMatchUpStatus === relabelled.exit)
    return { relay: [], landing: [] };
  const carried = carriedOps(view, args.request, write, relabelled);
  // nobody is placed, so no op names the loser's structure (`structureStamps`): v1's notice for the matchUp the carry
  // writes stamps it (`modifyMatchUpNotice`)
  const structureId = view.targets.loserStructureId;
  const stamp: OutcomeOp[] =
    structureId && structureId !== view.targets.source.structureId
      ? [{ op: 'stampUpdatedAt', entity: 'structure', id: structureId }]
      : [];
  return { relay: carried.relay, landing: [...carried.landing, ...stamp] };
}

/**
 * The carry's write (`carriedFor`), from the view as a double exit's unwind leaves it where the loser carries their own
 * exit onto the seat the unwind frees (`unwoundCarryReason`, S7), and from the call's view otherwise. The loser's half
 * is the call's: the direction re-planned on the unwound view carries the same exit (`unwoundCarryReason` asked)
 */
function unwoundCarriedFor(
  view: OutcomeView,
  args: PlanArgs,
  loser?: DirectionPlan['loser'],
): ReturnType<typeof carriedFor> {
  const after = loser?.exit && isDoubleExit(view.existing.matchUpStatus) ? unwoundView(args) : undefined;
  return carriedFor(after?.view ?? view, args, loser);
}

/** RULE 4's writes, read after the unwind and its released landings where this call replaces a double exit (S7). */
function unwoundConvergedFor(
  view: OutcomeView,
  args: PlanArgs,
  loser?: DirectionPlan['loser'],
): { ops: OutcomeOp[]; superseded?: Convergence } {
  if (!loser?.converged) return { ops: [] };
  const after = isDoubleExit(view.existing.matchUpStatus) ? unwoundView(args, { releasedLandings: true }) : undefined;
  const superseded = after && supersededOwnRelayConvergence(args, after);
  if (superseded)
    return {
      superseded,
      ops: convergenceOps(
        after.view,
        superseded,
        carriedStatus(args.request.matchUpStatus),
        args.request.matchUpId,
        args.write?.matchUpStatus as MatchUpStatusUnion,
      ),
    };
  return {
    ops: convergedOps(
      after?.view ?? view,
      args.request,
      args.write as MatchUpWrite,
      after?.direction?.loser ?? loser,
      after ? retainedRelayReservation(args, after) : undefined,
    ),
  };
}

/** a plan is folded into the record; a draw held outside it, or a call with no captured instant, cannot be compared */
function recordReason({
  tournamentRecord,
  drawDefinition,
}: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
}): AbstainReason | undefined {
  const held = tournamentRecord?.events?.some((event) =>
    event.drawDefinitions?.includes(drawDefinition as DrawDefinition),
  );
  if (!drawDefinition || !held) return 'no-record';
  if (getCapturedClock() === undefined) return 'clock';
  return undefined;
}

export function planOutcome(args: PlanArgs): OutcomePlan {
  const plan = args.route === RESULT_TO_DOUBLE_EXIT ? resultToDoubleExit(args) : planOps(args);
  // a TEAM line's result numbers it in its collection's finishing order (a deciding line's dual is planned in its plan)
  if (!plan.ops || args.asDual) return plan;
  return { ...plan, ops: withFinishingOrder(plan.ops, args.drawDefinition) };
}

/**
 * S7: a line that decides its dual. v1 writes the line, then the dual (`updateTieMatchUpScore`: COMPLETED, its winner,
 * its tally), then directs the dual as any winner is directed (`directParticipants`), writing the winning team's
 * line-up onto its side of the next dual (`updateSideLineUp`). v2 plans the line's write, then the dual's own call as
 * a call (`planOps`, on the dual's view): its result op takes the dual's form (`dualTally`, no `scoredTime`), and the
 * line-up is set on the next dual's side ahead of the placement, so the placement's `directWinner` is that matchUp's
 * last notice. A loser link out of the dual (its line-up carried onto a consolation seat) stays v1's until probed.
 */
/**
 * S7: the dual's own call a line's result makes, planned from the view of the dual (`DualCall`) as any call is, and
 * re-stated as v1's tally writes the dual (`updateTieMatchUpScore`): no status codes, no scored time, the sides and the
 * tieFormat the line's write ensures. A dual in a round robin is tallied in its group with the line in place among its
 * lines.
 */
function lineDualPlan(
  args: PlanArgs & { dual: DualCall; drawDefinition: DrawDefinition },
  line: NonNullable<OutcomeView['line']>,
  write: MatchUpWrite,
): OutcomePlan {
  const { dual, request, drawDefinition } = args;
  const group = dual.view.group && {
    ...dual.view.group,
    matchUps: dual.view.group.matchUps.map((matchUp) =>
      matchUp.matchUpId === line.dualMatchUpId
        ? {
            ...matchUp,
            tieMatchUps: writtenLine(
              line.projectedTieMatchUps,
              request.matchUpId as string,
              writtenScore(request, write),
            ),
          }
        : matchUp,
    ),
  };
  const dualPlan = planOps({
    tournamentRecord: args.tournamentRecord,
    direction: dual.direction,
    request: dual.request,
    rebuild: dual.rebuild,
    write: dual.write,
    route: dual.route,
    view: group ? { ...dual.view, group } : dual.view,
    drawDefinition,
    asDual: true,
  });
  if (!dualPlan.ops) return dualPlan;
  const ops = dualPlan.ops.map((op): OutcomeOp => {
    if (op.op !== 'setMatchUpResult' || op.matchUpId !== line.dualMatchUpId) return op;
    const { matchUpStatusCodes: _codes, ...result } = op;
    return {
      ...result,
      stampsScoredTime: false,
      dualTally: { sides: line.dualRewrite.sides, tieFormat: line.dualRewrite.tieFormat },
    };
  });
  return { ...dualPlan, ops };
}

/**
 * S7: a line whose result leaves its decided dual's lines projecting no winner (`line-score`): v1 takes the dual's
 * winner back out of the next dual and writes its tally (`scoreModification`), so the plan is the line's result, then
 * the dual's own removal (`undecidedDualCall`, routed `remove-directed`) as v1's tally writes it. A removal that is not
 * clean abstains as any removal does (`removalReason`).
 */
function undecidingLineOps(args: PlanArgs & { dual: DualCall; drawDefinition: DrawDefinition }): OutcomePlan {
  const { dual, view, request } = args;
  const line = view.line;
  const write = args.write;
  if (!line || !write || dual.route !== REMOVE_DIRECTED) return { abstain: 'team' };
  const dualPlan = lineDualPlan(args, line, write);
  if (!dualPlan.ops) return dualPlan;
  // the dual's removal writes it as its tally leaves it (the projected score, no winner); `scoreModification` returns
  // no `tieMatchUpResult`
  const dualOps = dualPlan.ops.map((op): OutcomeOp =>
    op.op === 'setMatchUpResult' && op.matchUpId === line.dualMatchUpId
      ? { ...op, dualTally: { ...op.dualTally, unreturned: true } }
      : op,
  );

  // v1 takes the dual's direction back first (`removeDirectedParticipants`, through the line), then writes the line and
  // the dual: the next dual is announced before them
  const ownsDual = (op: OutcomeOp) =>
    (op.op === 'setMatchUpResult' && op.matchUpId === line.dualMatchUpId) ||
    (op.op === 'stampUpdatedAt' && op.entity === 'matchUp' && op.id === line.dualMatchUpId);
  return {
    ops: [
      ...dualOps.filter((op) => !ownsDual(op)),
      ...resultOps(request, write, request.matchUpId as string),
      ...dualOps.filter(ownsDual),
    ],
    shape: dualPlan.shape,
  };
}

/** S7: a line's result that makes its dual's own call: deciding it, or un-deciding it (`line-score`) */
function lineDualOps(args: PlanArgs & { dual: DualCall; drawDefinition: DrawDefinition }): OutcomePlan {
  return args.route === LINE_SCORE ? undecidingLineOps(args) : decidingLineOps(args);
}

function decidingLineOps(args: PlanArgs & { dual: DualCall; drawDefinition: DrawDefinition }): OutcomePlan {
  const { dual, view, request, drawDefinition } = args;
  const line = view.line;
  const write = args.write;
  const winningSide = dual.request.winningSide as 1 | 2;
  if (!line || !write || dual.route !== 'winner') return { abstain: 'team' };
  const dualPlan = lineDualPlan(args, line, write);
  if (!dualPlan.ops) return dualPlan;
  const dualOps = dualPlan.ops;
  const carry = lineUpCarry({ line, winningSide, dual });
  const loserCarry = loserLineUpCarry({ line, winningSide, dual });
  const beyond = loserLineUpBeyond({ dual, drawDefinition });
  if (carry === false || loserCarry === false || beyond === false) return { abstain: 'team' };
  const ops = [...dualOps];
  // after the winner's placement, as v1 carries it once the position has joined the next dual
  const placement = ops.findIndex(
    (op) => op.op === 'setMatchUpDrawPositions' && op.matchUpId === dual.direction?.winner?.matchUpId,
  );
  if (carry) ops.splice(placement < 0 ? ops.length : placement + 1, 0, carry);
  // the dual the loser lands in, otherwise untouched (the arrival is written on its structure's assignments), is stamped
  // by the carry's notice
  // past a BYE, the dual beyond takes the losing team's line-up first (its assignment's), as v1 announces the two
  if (beyond) ops.push(beyond);
  if (loserCarry) ops.push(loserCarry, { op: 'stampUpdatedAt', entity: 'matchUp', id: loserCarry.matchUpId });
  return { ops: [...resultOps(request, write, request.matchUpId as string), ...ops], shape: dualPlan.shape };
}

/**
 * The winning team's line-up on its side of the next dual, as v1's `propagateLineUp` carries it: the line-up the decided
 * dual's winning side holds (once its line has been written and its sides ensured), without substitutions
 * (`removeLineUpSubstitutions`, which regroups each player's assignments), on the side v1 reckons by roundPosition
 * (draw-positions.md rule 4: a feed round's advancing team, or one advanced by position, is side 2). No next dual (a
 * final) or no line-up held, nothing.
 */
function lineUpCarry({
  line,
  winningSide,
  dual,
}: {
  line: NonNullable<OutcomeView['line']>;
  winningSide: 1 | 2;
  dual: DualCall;
}) {
  const next = dual.direction?.winner?.matchUpId;
  if (!next) return undefined;
  const sides = line.dualRewrite.sidesAsHeld as { sideNumber?: number; lineUp?: LineUp }[] | undefined;
  const held = sides?.find((side) => side.sideNumber === winningSide)?.lineUp;
  if (!held) return undefined;
  const inContext = dual.view.inContextDrawMatchUps;
  const source = inContext?.find((matchUp) => matchUp.matchUpId === line.dualMatchUpId)?.roundPosition;
  const target = inContext?.find((matchUp) => matchUp.matchUpId === next);
  if (!source || !target?.roundPosition) return false;
  const advancedByPosition =
    (source === target.roundPosition && source !== 1) || Math.floor(source / 2) === target.roundPosition;
  const sideNumber = target.feedRound || advancedByPosition ? 2 : 1;
  const lineUp = removeLineUpSubstitutions({ lineUp: held.filter((assignment) => assignment?.participantId) });
  return { op: 'setSideLineUp' as const, matchUpId: next, sideNumber, lineUp, announcedAs: 'directWinner' as const };
}

/**
 * The losing team's line-up on its side of the dual a loser link sends it to, as v1's `propagateLoserLineUp` carries it:
 * the line-up the decided dual's losing side holds, every assignment kept (unlike the winner's, none is filtered),
 * without substitutions, on side `2 - (roundPosition % 2)` of a first-round target and side 1 of a later round. A
 * loser kept out of a first-match feed (a BYE takes the seat) carries nothing; a loser seated opposite a BYE carries it
 * onto the BYE matchUp, and goes on (`loserLineUpBeyond`).
 * The dual a line decides is COMPLETED, so its loser carries no exit (v1 returns before the carry where a fed exit
 * propagates).
 */
function loserLineUpCarry({
  line,
  winningSide,
  dual,
}: {
  line: NonNullable<OutcomeView['line']>;
  winningSide: 1 | 2;
  dual: DualCall;
}) {
  const loser = dual.direction?.loser;
  if (!loser?.arrives) return undefined;
  // as the losing side held it before the line's write; holding none, v1 carries nothing, and the sides the loser's
  // assignment wrote stand (`updateSideLineUp`, from the draw's line-ups): v1's
  const sides = line.dualRewrite.sidesInContext as { sideNumber?: number; lineUp?: LineUp }[] | undefined;
  const held = sides?.find((side) => side.sideNumber === 3 - winningSide)?.lineUp;
  if (!held) return false;
  const inContext = dual.view.inContextDrawMatchUps;
  const source = inContext?.find((matchUp) => matchUp.matchUpId === line.dualMatchUpId)?.roundPosition;
  const roundNumber = inContext?.find((matchUp) => matchUp.matchUpId === loser.matchUpId)?.roundNumber;
  if (!source || !roundNumber) return false;
  const sideNumber = roundNumber === 1 ? 2 - (source % 2) : 1;
  const lineUp = removeLineUpSubstitutions({ lineUp: held });
  return {
    op: 'setSideLineUp' as const,
    matchUpId: loser.matchUpId,
    sideNumber,
    lineUp,
    announcedAs: 'directLoser' as const,
  };
}

/**
 * A losing team seated opposite a BYE goes on through it into the dual beyond, whose side v1 writes as the loser's
 * assignment writes any dual's (`assignTeamLineUp` → `updateSideLineUp`): the team's line-up as the draw holds it, on the
 * side holding the loser's drawPosition, announced `updateSidLineUp`. The dual beyond's notice comes before the BYE
 * matchUp's carry; a team the draw holds no line-up for takes none, as v1 writes it. Abstained (v1's): a drawPosition the
 * dual beyond does not side yet.
 */
function loserLineUpBeyond({ dual, drawDefinition }: { dual: DualCall; drawDefinition: DrawDefinition }) {
  const loser = dual.direction?.loser;
  const { loserThroughBye, loserTargetDrawPosition } = dual.view.targets;
  // the dual's own plan goes through the BYE only into a clean matchUp beyond (`loserThroughBye`), or abstains
  const through = loser?.arrives ? loserThroughBye : undefined;
  if (!loser || !through) return undefined;
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const lineUp = lineUps[loser.participantId];
  const target = dual.view.inContextDrawMatchUps?.find(({ matchUpId }) => matchUpId === through.matchUpId);
  const sideNumber = target?.sides?.find((side) => side.drawPosition === loserTargetDrawPosition)?.sideNumber;
  if (!sideNumber) return false;
  return {
    op: 'setSideLineUp' as const,
    matchUpId: through.matchUpId,
    sideNumber,
    lineUp,
    announcedAs: 'updateSidLineUp' as const,
  };
}

/**
 * S7: a dual's own call whose loser a link places. The loser's assignment writes the team's line-up, as the draw holds it,
 * on its side of each dual it reaches (`assignTeamLineUp` → `updateSideLineUp`, announced `updateSidLineUp`): past a BYE
 * the dual beyond first, then the BYE matchUp. No line-up is carried from the dual itself (that is a deciding line's
 * `propagateLoserLineUp`). False where a dual does not side the drawPosition (v1's).
 */
function assignedLineUpOps(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  participantId: string,
  through?: { matchUpId: string },
): OutcomeOp[] | false {
  const { loserMatchUpId, loserTargetDrawPosition, loserByePassage } = view.targets;
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const ops: OutcomeOp[] = [];
  // a passage's BYE matchUps past the first hold the loser's drawPosition too, and take the line-up after the first
  const passed = loserByePassage?.byes ?? [];
  for (const matchUpId of [through?.matchUpId, loserMatchUpId, ...passed]) {
    if (!matchUpId) continue;
    const target = view.inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
    const sideNumber = target?.sides?.find((side) => side.drawPosition === loserTargetDrawPosition)?.sideNumber;
    if (!sideNumber) return false;
    ops.push({
      op: 'setSideLineUp',
      matchUpId,
      sideNumber,
      lineUp: lineUps[participantId],
      announcedAs: 'updateSidLineUp',
      // the loser's own dual is announced with no event (`assignTeamLineUp` hands `updateSideLineUp` none); the dual
      // beyond a BYE is announced with one
      ...(matchUpId === loserMatchUpId ? { announcesEvent: false as const } : {}),
    });
  }
  // the dual the loser lands in is otherwise untouched (the arrival is written on its structure's assignments): its
  // notice stamps it. Past a BYE, the dual beyond is stamped with its positions
  if (loserMatchUpId) ops.push({ op: 'stampUpdatedAt', entity: 'matchUp', id: loserMatchUpId });
  return ops;
}

/**
 * S7: the line-ups a dual's own call writes through its assignments: a re-entered winner's on the next dual
 * (`winnerLineUpOps`), then the loser's where it lands (`assignedLineUpOps`). False where a dual does not side the
 * drawPosition (v1's).
 */
function dualLineUpOps(
  args: PlanArgs & { drawDefinition: DrawDefinition },
  loser?: DirectionPlan['loser'],
  loserThrough?: { matchUpId: string },
): OutcomeOp[] | false {
  const { view, drawDefinition } = args;
  const arrived = loser?.arrives ? assignedLineUpOps(view, drawDefinition, loser.participantId, loserThrough) : [];
  return arrived && [...winnerLineUpOps(args), ...arrived];
}

/**
 * S7: the stored winner of a decided dual entered again by its own call. v1 assigns the winner's drawPosition in the
 * next dual again (`assignMatchUpDrawPosition`), where it now stands, so the assignment writes the team's line-up, as
 * the draw holds it, on that side (`assignTeamLineUp` → `updateSideLineUp`, announced `updateSidLineUp` with no event):
 * a line-up a deciding line carried there is replaced. A first entry, or a changed winner, writes none: the drawPosition
 * is not yet sided there (v1's view is read before the assignment).
 */
function winnerLineUpOps(args: PlanArgs & { drawDefinition: DrawDefinition }): OutcomeOp[] {
  const { view, write, direction, drawDefinition, request } = args;
  const next = direction?.winner;
  if (!next) return [];
  const inContext = view.inContextDrawMatchUps;
  const dual = inContext?.find((matchUp) => matchUp.matchUpId === request.matchUpId);
  const drawPosition = dual?.sides?.find((side) => side.sideNumber === write?.winningSide)?.drawPosition;
  const target = inContext?.find((matchUp) => matchUp.matchUpId === next.matchUpId);
  const sideNumber = drawPosition && target?.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  if (!sideNumber) return [];
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  return [
    {
      op: 'setSideLineUp',
      matchUpId: next.matchUpId,
      sideNumber,
      lineUp: lineUps[next.participantId],
      announcedAs: 'updateSidLineUp',
      announcesEvent: false,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

/**
 * S7: a dual's exit carried across its loser link is written on the dual it lands on by that dual's own call
 * (`setMatchUpState`), whose `ensureSideLineUps` first writes its sides with the team arrived: the carried write takes
 * them as `ensuredSides` (`ensuredDualSides`, the one rule). That dual is the one the losing team reaches, or, past a BYE
 * there, the dual beyond it (RULE 1: the BYE dual keeps its BYE, records the carry beside it and takes the team's line-up
 * from the assignment, `assignedLineUpOps`). The line-up the team's assignment wrote is the draw's, the line-up that rule
 * falls back to, and one edited on the dual since is the one it keeps: the stored sides are read as they stand. Planned
 * where the carry lands on one dual, both its sides holding their drawPositions, and goes no further.
 */
function carriedDualLanding(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  landing: OutcomeOp[],
  loser?: NonNullable<DirectionPlan['loser']>,
): OutcomeOp[] | undefined {
  const { loserTargetDrawPosition } = view.targets;
  const written = landing.filter((op) => op.op === 'setMatchUpResult');
  if (!written.length || !loser?.arrives) return landing;
  const { participantId } = loser;
  // the carry lands on one dual: the one the loser reaches, or past a BYE the dual beyond it (RULE 1, its passage); a
  // carry on past that dual (its own loser link: the carrier placed again, whose assignment writes the team's line-up
  // there) is v1's
  const landedOn = written[0].matchUpId;
  if (written.some((op) => op.matchUpId !== landedOn) || landing.some((op) => op.op === 'assignPosition'))
    return undefined;
  const reached = indexed(view, landedOn);
  // planned where both the dual's sides hold their drawPositions (the loser's is one of them): a side holding none (a
  // DOUBLE_ELIMINATION losers' round, half placed) is hydrated unnumbered, and v1 reads it numbered after the arrival
  const seated = reached?.sides?.filter((side) => side.drawPosition) ?? [];
  if (seated.length !== 2) return undefined;
  const rawSides = storedSides(drawDefinition, landedOn);
  const ensuredSides = ensuredDualSides({
    contextSides: reached?.sides?.map((side) =>
      side.drawPosition === loserTargetDrawPosition ? { ...side, participantId } : side,
    ),
    rawSides: rawSides as Parameters<typeof ensuredDualSides>[0]['rawSides'],
    lineUps: firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }),
  });
  return landing.map((op) =>
    op.op === 'setMatchUpResult' && op.matchUpId === landedOn ? { ...op, ensuredSides } : op,
  );
}

/** a matchUp's sides as stored (not hydrated), read off the draw's structures */
function storedSides(drawDefinition: DrawDefinition, matchUpId: string): unknown[] | undefined {
  for (const structure of drawDefinition.structures ?? []) {
    const found = matchUpsOf(structure)?.find((matchUp) => matchUp.matchUpId === matchUpId);
    if (found) return found.sides;
  }
  return undefined;
}

/**
 * A double exit given a winner whose own loser seat stood in a double BYE (S7): the unwind withdraws the seat's BYE, and
 * the double BYE had sent the seat's own position on into the next matchUp, where it stands still. The loser then
 * arrives opposite the standing BYE and goes on through it, and v1 announces the next matchUp as it leaves it
 * (`assignMatchUpDrawPosition`, with the event), stamped. The stored next matchUp is a BYE until the unwind, so
 * `throughBye` reads none: it is read as the unwind leaves it. Planned where the unwind withdrew the next matchUp's BYE
 * at that position (`doubleByeSeatOps`, family 5: it is then to be played) or the next matchUp is the structure's last
 * round (COMPASS's West: a BYE still, by the other standing BYE, and nothing further to advance into).
 */
function unwoundThrough(view: OutcomeView, unwound: OutcomeOp[]): ThroughBye | undefined {
  const { loserMatchUpId, loserStructureId, loserTargetDrawPosition: drawPosition } = view.targets;
  const next = indexed(view, indexed(view, loserMatchUpId)?.winnerMatchUpId);
  if (!next || !drawPosition) return undefined;
  const withdrawn = unwound.some(
    (op) => op.op === 'withdrawBye' && op.structureId === loserStructureId && op.drawPosition === drawPosition,
  );
  // under `doubleExitPropagateBye: false` the carry the double exit had sent past the BYE, taken back (`unwoundPassage`)
  const passage = unwound.some((op) => op.op === 'setSideExitProvenance' && op.matchUpId === loserMatchUpId);
  const cleared = unwound.some(
    (op) => op.op === 'clearMatchUpBye' && op.matchUpId === next.matchUpId && op.drawPosition === drawPosition,
  );
  // the passage's landing, written back to be played with the carrier's position standing in it
  const landed =
    passage &&
    unwound.some(
      (op) => op.op === 'setMatchUpResult' && op.matchUpId === next.matchUpId && op.matchUpStatus === TO_BE_PLAYED,
    );
  const drawPositions = positionsOf(next);
  if ((!withdrawn && !passage) || !drawPositions.includes(drawPosition)) return undefined;
  if (cleared || landed || !next.winnerMatchUpId) return { matchUpId: next.matchUpId, drawPositions };
  // a BYE still, by another standing BYE: the loser goes on through it, and through each BYE after it, to the structure's
  // last round, and v1 announces each matchUp passed as it announces the first (S7)
  const onward = byeChainOnward(view, next, drawPosition);
  return onward ? { matchUpId: next.matchUpId, drawPositions, onward } : undefined;
}

/**
 * The BYE-held matchUps a position passes after `from` (walls, never reached refusing: a matchUp no BYE holds, no
 * standing BYE, the position not there, a structure crossed), each a BYE by another standing BYE and holding the position
 * already (the BYEs advanced it structurally), to the structure's last round. Undefined where the chain meets anything
 * else (a matchUp to be played, a structure crossed): v1's.
 */
function byeChainOnward(view: OutcomeView, from: HydratedMatchUp, drawPosition: number): ThroughBye[] | undefined {
  const hops: ThroughBye[] = [];
  let at: HydratedMatchUp | undefined = from;
  for (let hop = 0; at && hop < 8; hop += 1) {
    const standing = at.sides?.some((side) => side.bye && side.drawPosition !== drawPosition);
    if (at.matchUpStatus !== BYE || !standing || !positionsOf(at).includes(drawPosition)) return undefined;
    const next = indexed(view, at.winnerMatchUpId);
    if (!next) return hops;
    if (next.structureId !== from.structureId) return undefined;
    hops.push({ matchUpId: next.matchUpId, drawPositions: positionsOf(next) });
    at = next;
  }
  return undefined;
}

/**
 * A loser arriving on the seat an unwind freed beside a carried exit, whose carrier the unwind released back
 * (`carrierSentOn`): the BYE matchUp, re-derived to the carry as the BYE went, is awarded to the loser as they are seated,
 * and v1's `assignDrawPosition` announces it and sends them on, through each relay (a BYE still, announced as it leaves
 * it) into the landing the release left to be played (S7). Read off the unwind's own ops: the matchUps the BYE matchUp
 * leads on to, each written by the unwind for the withdrawn BYE (a relay) or released (the landing). Nothing where the
 * unwind freed the seat any other way (the loser arrives plainly, `arrivalOps`)
 */
function unwoundArrivalOps(view: OutcomeView, unwound: OutcomeOp[], loser?: DirectionPlan['loser']): OutcomeOp[] {
  const { loserMatchUpId, loserTargetDrawPosition: drawPosition } = view.targets;
  const byeMatchUp = indexed(view, loserMatchUpId);
  if (!loser?.arrives || loser.converged || !byeMatchUp || !drawPosition) return [];
  const retained = unwound.find(
    (op): op is Extract<OutcomeOp, { op: 'setMatchUpResult' }> =>
      op.op === 'setMatchUpResult' && op.matchUpId === loserMatchUpId && !!op.retainedExitPlanned,
  );
  if (retained && !loser.exit) {
    const next = indexed(view, byeMatchUp.winnerMatchUpId) as HydratedMatchUp;
    return [
      {
        op: 'setMatchUpDrawPositions',
        matchUpId: next.matchUpId,
        drawPositions: [...positionsOf(next), drawPosition].sort((a, b) => a - b),
        placedDrawPosition: drawPosition,
      },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
      retained,
    ];
  }
  const cleared = unwound.some(
    (op) =>
      op.op === 'clearMatchUpBye' &&
      op.matchUpId === byeMatchUp.matchUpId &&
      op.drawPosition === drawPosition &&
      !!op.rederived?.winningSide,
  );
  const writtenBy = (matchUpId: string) =>
    unwound.find(
      (op): op is Extract<OutcomeOp, { op: 'setMatchUpDrawPositions' }> =>
        op.op === 'setMatchUpDrawPositions' && op.matchUpId === matchUpId,
    );
  const onward: OutcomeOp[] = [];
  let at = cleared ? indexed(view, byeMatchUp.winnerMatchUpId) : undefined;
  for (let hop = 0; at && hop < 9; hop += 1) {
    const write = writtenBy(at.matchUpId);
    if (!write || (!write.releasedDrawPosition && write.withdrawnByePosition !== drawPosition)) return [];
    const drawPositions = [...write.drawPositions, drawPosition].sort((a, b) => a - b);
    onward.push(
      {
        op: 'setMatchUpDrawPositions',
        matchUpId: at.matchUpId,
        drawPositions,
        ...(write.releasedDrawPosition ? {} : { placedDrawPosition: drawPosition }),
      },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: at.matchUpId },
    );
    if (write.releasedDrawPosition) {
      return [
        {
          op: 'setMatchUpDrawPositions',
          matchUpId: byeMatchUp.matchUpId,
          drawPositions: positionsOf(byeMatchUp),
          placedDrawPosition: drawPosition,
          rederivesCodes: true,
        },
        ...onward,
      ];
    }
    at = indexed(view, at.winnerMatchUpId);
  }
  return [];
}

/** a plain loser arrival: the loser on the seat the link feeds */
function arrivalOps(view: OutcomeView, loser?: DirectionPlan['loser']): OutcomeOp[] {
  const { loserStructureId, loserTargetDrawPosition } = view.targets;
  return loser?.arrives && loserStructureId && loserTargetDrawPosition
    ? [
        {
          op: 'assignPosition',
          structureId: loserStructureId,
          drawPosition: loserTargetDrawPosition,
          participantId: loser.participantId,
        },
      ]
    : [];
}

/** Reserve beside the retained carrier on the folded clear, preserving v1's score and deferred-writer order. */
function retainedCarriedAwardOps(
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
    score: BLANK_SCORE,
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

/**
 * The produced exit rests where its BYE went (S7). A pending copy is withdrawn after the arrival; an awarded copy was
 * already reset on the unwind, so the arrival joins its legitimate occupant without repeating that withdrawal.
 */
function producedRelayAfterOps(
  view: OutcomeView,
  unwound: OutcomeOp[],
  loser: DirectionPlan['loser'] | undefined,
  seatPrograms: OutcomeOp[][],
  superseded?: Convergence,
): OutcomeOp[] {
  return unwound.flatMap((op): OutcomeOp[] => {
    if (op.op !== 'clearMatchUpBye' || !op.rederived || op.rederived.winningSide) return [];
    // The relay reader certified its retained producer and any onward copy before emitting this pending exit.
    const home = indexed(view, op.matchUpId) as HydratedMatchUp;
    const next = indexed(view, home.winnerMatchUpId) as HydratedMatchUp;
    // This same own program now produces a fresh exit on its old relay side; its obsolete copy cannot be replayed.
    if (
      seatPrograms[0]?.includes(op) &&
      superseded?.matchUpId === home.matchUpId &&
      superseded.target?.entry.matchUpId === next?.matchUpId
    )
      return [];
    if (op.retainedCarriedAward) return [];
    // Reuse the complete-level proof; an unrelated level's reset cannot suppress this relay's late write.
    if (seatPrograms.some((program) => indirectRelayReset(view, op, program))) return [];
    if (op.retainedOnwardMatchUpId) {
      const copy = convergedRelayCopy(view, home, op.drawPosition) as NonNullable<
        ReturnType<typeof convergedRelayCopy>
      >;
      return [
        ...unwound.filter((write) => write.op === 'setMatchUpResult' && write.retainedExitPlanned && !loser?.converged),
        ...unwound.filter(
          (write) =>
            write.op === 'setMatchUpResult' &&
            (write.matchUpId === copy.next.matchUpId || write.matchUpId === copy.successor.matchUpId),
        ),
      ];
    }
    const arrived = loser?.arrives && !loser.exit && !loser.converged && view.targets.loserMatchUpId === home.matchUpId;
    const award: OutcomeOp[] = arrived
      ? [
          {
            op: 'setMatchUpResult',
            matchUpId: home.matchUpId,
            matchUpStatus: op.rederived.matchUpStatus,
            winningSide: sideOf(home, op.drawPosition),
            matchUpStatusCodes: [],
            stampsScoredTime: false,
            announcedAs: 'assignMatchUpDrawPosition',
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: home.matchUpId },
        ]
      : [];
    // This direct terminal certificate has no onward copy; named assignment preserves its absent score and callback.
    if (!home.winnerMatchUpId) return award;
    const beyond = indexed(view, next.winnerMatchUpId);
    const drawPositions = [...positionsOf(next), op.drawPosition];
    const arrival: OutcomeOp[] = arrived
      ? [
          ...award,
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: next.matchUpId,
            drawPositions,
            placedDrawPosition: op.drawPosition,
          },
          ...(beyond && !next.winningSide
            ? [
                {
                  op: 'setMatchUpDrawPositions' as const,
                  matchUpId: beyond.matchUpId,
                  drawPositions: positionsOf(beyond),
                  releasedDrawPosition: op.drawPosition,
                },
                { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: beyond.matchUpId },
              ]
            : []),
        ]
      : [];
    const reset: OutcomeOp[] = next.winningSide
      ? []
      : [
          {
            op: 'setMatchUpResult',
            matchUpId: next.matchUpId,
            matchUpStatus: TO_BE_PLAYED,
            matchUpStatusCodes: [],
            announcedAs: 'withdrawProducedExits',
          },
          { op: 'setSideExitProvenance', matchUpId: next.matchUpId },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
        ];
    return [
      ...arrival,
      ...reset,
      ...(!arrived
        ? [
            {
              op: 'setMatchUpDrawPositions' as const,
              matchUpId: next.matchUpId,
              drawPositions,
              advancesThroughBye: true as const,
              announcesEvent: true as const,
            },
          ]
        : []),
    ];
  });
}

/** the call's plan as ops, or the reason it is v1's */
function planOps(args: PlanArgs): OutcomePlan {
  const reason = abstainReason(args);
  if (reason) return { abstain: reason };
  const { request, view, drawDefinition } = args;
  const unrecorded = recordReason(args);
  if (unrecorded || !drawDefinition) return { abstain: unrecorded ?? 'no-record' };
  if (args.dual) return lineDualOps({ ...args, dual: args.dual, drawDefinition });
  // a double exit asked for again: v1 writes nothing (`satisfiedDoubleExit`)
  if (satisfiedDoubleExit(view, request, args.route)) return { ops: [], shape: 'local' };
  return recordedPlanOps(args, drawDefinition);
}

/** A recorded single-call plan after the shared refusal, dual and no-op gates. */
function recordedPlanOps(args: PlanArgs, drawDefinition: DrawDefinition): OutcomePlan {
  const { request, view } = args;
  const write = args.write as MatchUpWrite;
  const matchUpId = request.matchUpId as string;
  const structureId = view.targets.source.structureId;
  if (!structureId) return { abstain: 'route' };

  const standaloneWinner = standaloneBareWinnerOps(args) ?? standaloneCarriedWinnerOps(args);
  if (standaloneWinner) return { ops: standaloneWinner, shape: 'direction' };
  const terminalWinner = terminalOccupiedWinnerOps(args);
  if (terminalWinner) return { ops: terminalWinner, shape: 'direction' };
  const score = writtenScore(request, write);
  // a cleared double exit's unwind, announced before the clear's own write, as v1 makes it first (S6)
  const { ops: unwound, reannounced, seatPrograms } = unwoundOps(view, request, args.route, drawDefinition);
  const retainedAward = retainedCarriedAwardOps(args, unwound);
  if (!retainedAward) return { abstain: 'exit' };
  const ops: OutcomeOp[] = [
    ...swapOps(view, args.route),
    ...replacedLoserOps(view, args.route, write, request.matchUpStatus),
    ...unwound,
    // a dual's own call writes its sides first (S7); for the dual a line decides they are its line's (`dualTally`), by the
    // same rule (`ensuredDualSides`)
    // a schedule the call carries, written before the result as v1 writes it before `applyScoredTime` (S7)
    ...scheduleOps(args, matchUpId),
    ...resultOps(request, write, matchUpId, view.dualSides, autoCalcWrite(request, view)),
    // a convergence the unwind dissolved, re-announced by v1's settle pass after the call's own write (S6 tail)
    ...reannounced,
    ...dualTallyOps(view.line, args.route),
  ];
  // the first direction: the winner's position joins the next matchUp's, which v1 stores ascending
  const placing = placedDirection(view, args.route, write, retainedRelayDirection(args, unwound));
  const winner = placing?.winner;
  ops.push(
    ...winnerPlacementOps(view, args.route, write, winner),
    ...removedOps(view, args.route, write, request.matchUpStatus),
  );
  // a plain loser arrival: the loser on the seat the link feeds. The matchUp they land in is not stamped: its stored
  // object does not change (the write is on the structure's assignments), so it is not a touched entity (F2 (i), and v1).
  // The structure whose assignments change is stamped below (v1's `modifyPositionAssignmentsNotice`).
  const loser = placing?.loser;
  const { loserMatchUpId } = view.targets;
  const arrival = arrivalOps(view, loser);
  // a participant placed opposite a BYE goes on through it, a loser fed onto the seat or a winner into a BYE-held
  // target: their position joins the next matchUp, which is stamped
  const loserThrough =
    loser?.arrives && view.targets.loserTargetSeat?.opponentBye
      ? (view.targets.loserThroughBye ?? view.targets.loserByePassage?.through ?? unwoundThrough(view, unwound))
      : undefined;
  // the loser's own position, where the unwind left it standing in the matchUp beyond (`unwoundThrough`)
  const placedThrough = loserThrough && !view.targets.loserThroughBye && !view.targets.loserByePassage?.through;
  const winnerThrough =
    winner && view.targets.winner?.hasBye ? view.targets.winnerThroughBye?.[write.winningSide as 1 | 2] : undefined;
  // a dual's own call: its loser's assignment writes the team's line-up where it lands (S7)
  const dualCall = view.isTeam && !view.line && !args.asDual;
  const lineUps = dualCall ? dualLineUpOps({ ...args, drawDefinition }, loser, loserThrough) : [];
  if (!lineUps) return { abstain: 'team' };
  // a carried exit's write on the matchUp the loser lands in (S5)
  // (a carry past a BYE is recorded beside it before the carrier is placed on beyond, as v1 announces the two)
  const carried = unwoundCarriedFor(view, args, loser);
  const landing = dualCall ? carriedDualLanding(view, drawDefinition, carried.landing, loser) : carried.landing;
  if (!landing) return { abstain: 'team' };
  const throughBye = [loserThrough, ...(loserThrough?.onward ?? []), winnerThrough].flatMap((through): OutcomeOp[] =>
    through
      ? [
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: through.matchUpId,
            drawPositions: through.drawPositions,
            ...(placedThrough && through === loserThrough
              ? { placedDrawPosition: view.targets.loserTargetDrawPosition }
              : {}),
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: through.matchUpId },
        ]
      : [],
  );
  // a kept-out loser's BYE on the seat the link feeds (v1's `directLoser`), unless a reservation placed it already
  const keptOut = loser?.bye && !loser.arrives && !view.targets.loserTargetSeat?.bye ? loser.bye : undefined;
  const keptOutBye =
    unwoundKeptOutOps(view, seatPrograms[0] ?? [], loser, loser?.bye ? unwoundView(args)?.view : undefined) ??
    (keptOut && loserMatchUpId ? seatBye({ ...keptOut, matchUpId: loserMatchUpId }) : []);
  // the FIRST_MATCHUP reservation the winner's arrival makes (v1's `propagateConsolationBye`)
  const reservation = write.winningSide ? view.targets.reservations?.[write.winningSide as 1 | 2] : undefined;
  const reserved = reservation?.kind === 'reserve' ? seatBye(reservation) : [];
  // two exits meeting where the loser lands (RULE 4), and what the double exit they make produces (S5)
  const convergence = unwoundConvergedFor(view, args, loser);
  const converging = convergence.ops;
  // a double exit's loser seats, BYEs (S5)
  const seatOps = args.route === DOUBLE_EXIT ? doubleExitSeatOps(view, request, args.direction) : undefined;
  const doubleExitSeated = seatOps?.ops ?? [];
  const producedExit = args.route === DOUBLE_EXIT ? producedExitOps(view, request, write, args.direction) : [];
  // ...and, seated beside a carried exit whose carrier the unwind released back, awarded it and sent on (S7)
  const seated = [...arrival, ...unwoundArrivalOps(view, unwound, loser), ...keptOutBye, ...reserved];
  const line = view.line;
  // a TEAM line's group is its dual's: the dual is tallied with the line's result in place, its lines and its tally (S7)
  const tallied = line
    ? {
        matchUpId: line.dualMatchUpId,
        matchUpWrite: { matchUpStatus: line.projectedStatus, winningSide: line.projectedWinningSide } as MatchUpWrite,
        score: line.projectedScore as Score | undefined,
        tieMatchUps: writtenLine(line.projectedTieMatchUps, matchUpId, score),
      }
    : { matchUpId, matchUpWrite: write, score, matchUpFormat: request.matchUpFormat };
  const tally = view.group ? groupTally(view.group, tallied) : [];
  if (!tally) return { abstain: 'tallied' };
  // v1's tally announces the draw with no structure named (`updateAssignmentParticipantResults` → `modifyDrawNotice`),
  // which stamps every top-level structure: a round robin with playoffs stamps its playoff structures too
  const tallyStamps: OutcomeOp[] = view.group
    ? (drawDefinition.structures ?? [])
        .map(({ structureId: id }) => id)
        .filter((id) => id !== (view.group?.containerStructureId ?? structureId))
        .map((id) => ({ op: 'stampUpdatedAt', entity: 'structure', id }))
    : [];
  ops.push(
    ...seated,
    ...carried.relay,
    ...throughBye,
    ...lineUps,
    ...landing,
    ...converging,
    ...doubleExitSeated,
    ...producedExit,
    ...(seatOps?.after ?? []),
    ...structureStamps(
      [...unwound, ...seated, ...carried.landing, ...converging, ...doubleExitSeated, ...producedExit],
      structureId,
    ),
    ...tally,
    // the top-level structure: a round robin group's container, as v1 stamps it
    { op: 'stampUpdatedAt', entity: 'structure', id: view.group?.containerStructureId ?? structureId },
    ...tallyStamps,
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  );
  // a relabel where the winner stands whose carry proceeds returns v1's direction context too (`relabelWithoutDirection`)
  const carriedOn =
    (args.route === APPLY_VALUES || args.route === 'swap') &&
    !!args.direction?.loser?.exit &&
    carried.landing.length > 0;
  // The convergence writes a fresh produced exit into the released landing. v1's scored-time reconciliation then
  // leaves that exit standing, including its existing stamp, rather than resetting the emptied award it replaced.
  const convergedWrites = new Set(converging.filter((op) => op.op === 'setMatchUpResult').map((op) => op.matchUpId));
  const superseded = new Set(
    reannounced.filter(
      (op) =>
        op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes' && convergedWrites.has(op.matchUpId),
    ),
  );
  const writes = ops.filter((op) => !superseded.has(op));
  return {
    ops: [
      ...writes,
      ...producedRelayAfterOps(view, unwound, loser, seatPrograms, convergence.superseded),
      ...retainedAward,
    ],
    shape: args.route === 'winner' || carriedOn ? 'direction' : 'local',
  };
}

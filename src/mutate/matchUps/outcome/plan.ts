import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getCapturedClock, writeLegacyEnabled } from '@Global/state/globalState';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { validMatchUps } from '@Validators/validMatchUp';
import {
  buildCarriedExitProvenance,
  buildSideExitProvenance,
  collapseDoubleExitStatus,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { DrawDefinition, MatchUpStatusUnion, Score, TallyResult, Tournament } from '@Types/tournamentTypes';
import { FIRST_MATCHUP, LOSER } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from './ops';
import type {
  CarryLevel,
  DirectionPlan,
  MatchUpWrite,
  OutcomeRequest,
  OutcomeView,
  Route,
  WinnerLoserSeat,
} from './types';
import {
  AWAITING_RESULT,
  BYE,
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  INCOMPLETE,
  IN_PROGRESS,
  RETIRED,
  SUSPENDED,
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
export type AbstainReason =
  | 'route' // a route S1 does not plan as ops
  | 'winner' // a winner taken away or changed: unwinding what it directed (S4)
  | 'loser' // the loser has somewhere to go: a loser link (S3)
  | 'link' // the winner goes into another structure (S3)
  | 'cascade' // the winner's target holds a BYE, an exit or a result: the winner goes on, or meets it (S5)
  | 'exit' // an exit status, before or after: provenance and the cascade (S5)
  | 'status-codes' // the client's positional codes, split into side codes at the write
  | 'provenance' // the matchUp holds provenance the score write may clear or rescue
  | 'team' // a dual or a line: tieMatchUps and auto-calc (S7)
  | 'tallied' // a round robin, ad hoc or lucky structure: the tally (S3)
  | 'schedule' // the call carries a schedule (§ 3.5.8)
  | 'notes' // the call carries notes
  | 'no-record' // the draw is not held in the tournament record's events: nothing to fold the plan into
  | 'edges' // the draw stores no edges, which v1 writes first (`ensureGoesTo`): S2's setEdges
  | 'clock' // no captured instant (a call outside the engine): the timestamps a write takes cannot be reproduced
  | 'settle' // a settle pass has work on the working view (S2's has-work predicates, `settleWork.ts`)
  | 'write-mode' // LEGACY or BRIDGE: v1 writes `scoredTime` as a timeItem there, which the reducer does not (F6)
  | 'competition'; // a per-matchUp competition policy: v1 processes ratings on a result (`processCompetitionMatchUp`)

/** which of the allowlist's shapes a complete plan is: `local` (the matchUp's own result) or the first `direction` */
export type PlanShape = 'local' | 'direction';
export type OutcomePlan =
  | { ops: OutcomeOp[]; shape: PlanShape; abstain?: undefined }
  | { abstain: AbstainReason; ops?: undefined; shape?: undefined };

const REMOVE_DIRECTED: Route = 'remove-directed';
const DOUBLE_EXIT: Route = 'double-exit';
const CLEAR_SCORE: Route = 'clear-score';
const LOCAL_ROUTES = new Set<Route>(['clear', CLEAR_SCORE, REMOVE_DIRECTED, 'only-score']);
const LOCAL_STATUSES = new Set<string | undefined>([IN_PROGRESS, SUSPENDED, AWAITING_RESULT, INCOMPLETE, TO_BE_PLAYED]);
const SINGLE_EXITS = new Set<string | undefined>([WALKOVER, DEFAULTED, RETIRED]);
const DIRECTED_STATUSES = new Set<string | undefined>([COMPLETED, ...SINGLE_EXITS]);

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
  // opposite a BYE the loser goes on at once: planned when the matchUp they go on into is clean (`loserThroughBye`)
  if (targets.loserTargetSeat.opponentBye && !targets.loserThroughBye) return 'cascade';
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

/** the loser of a stored result: who holds the side the winner did not */
function storedLoserId(view: OutcomeView): string | undefined {
  const winningSide = view.existing.winningSide;
  return winningSide ? view.targets.sideParticipantIds[(3 - winningSide) as 1 | 2] : undefined;
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

/** the winning side's drawPosition already stands in the winner's target: what a stored winner directed */
function heldInTarget(view: OutcomeView, winningSide: 1 | 2): boolean {
  const position = view.targets.sideDrawPositions[winningSide];
  return !!position && !!view.targets.winner?.drawPositions.includes(position);
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
    if (!loser?.arrives || loser.exit || loser.bye || loser.carriedPast || loser.withdrawn || loser.converged)
      return 'loser';
    if (!seat || seat.participantId !== loser.participantId || seat.opponentBye) return 'loser';
    if (targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit) return 'cascade';
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
  if (!write?.winningSide || write.matchUpStatus !== COMPLETED || view.existing.matchUpStatus !== COMPLETED)
    return 'route';
  if (!swap) return 'route';
  if (swap.linkedOut && !swap.relabels) return 'link';
  if (swap.pathCarriesExit) return 'cascade';
  return undefined;
}

/** the values written beneath an active downstream: a played result, nothing directed */
function applyValuesReason({
  write,
  direction,
}: {
  write?: MatchUpWrite;
  direction?: DirectionPlan;
}): AbstainReason | undefined {
  if (!write || write.matchUpStatus !== COMPLETED || direction) return 'route';
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
  if ((target.hasBye && !through) || target.holdsResult) return 'cascade';
  if (!unwound && (target.carriesExit || target.carriedStatuses.length)) return 'cascade';
  // a target generated with no status (LUCKY_DRAW, adaptive) is written TO_BE_PLAYED by v1 as the winner arrives
  if (target.matchUpStatus !== TO_BE_PLAYED && !through && !unwound) return 'route';
  if (!targets.sideDrawPositions[write.winningSide as 1 | 2]) return 'route';
  return undefined;
}

/**
 * A round robin group's tally after the call, as v1's `updateAssignmentParticipantResults` computes it: the group's
 * matchUps with the call's result in place of the target's, tallied under the group's format and tally policy. Its
 * participant results are written by `writeAssignmentResults`, v1's writer, through the reducer. Undefined where v1 would
 * refuse the tally (a matchUp it cannot read), so the call abstains rather than plan what v1 refuses.
 */
function groupTally(
  group: NonNullable<OutcomeView['group']>,
  call: { matchUpId: string; matchUpWrite: MatchUpWrite; score?: Score; matchUpFormat?: string },
): OutcomeOp[] | undefined {
  const matchUps = group.matchUps.map((matchUp) =>
    matchUp.matchUpId === call.matchUpId
      ? {
          ...matchUp,
          matchUpStatus: call.matchUpWrite.matchUpStatus as MatchUpStatusUnion,
          winningSide: call.matchUpWrite.winningSide as 1 | 2 | undefined,
          score: call.score ?? matchUp.score,
          ...(call.matchUpFormat ? { matchUpFormat: call.matchUpFormat } : {}),
        }
      : matchUp,
  );
  if (!validMatchUps(matchUps)) return undefined;
  const { subOrderMap } = createSubOrderMap({ positionAssignments: group.positionAssignments });
  const result = matchUps.length
    ? tallyParticipantResults({
        policyDefinitions: group.policyDefinitions,
        matchUpFormat: group.matchUpFormat,
        subOrderMap,
        matchUps,
      })
    : undefined;
  if (result && 'error' in result && result.error) return undefined;
  const participantResults = (result as { participantResults?: Record<string, TallyResult> } | undefined)
    ?.participantResults;
  return [
    {
      op: 'setParticipantResults',
      structureId: group.structureId,
      participantResults: participantResults ?? {},
      ...(group.adHoc
        ? { participantIds: group.positionAssignments.map(({ participantId }) => participantId as string) }
        : {}),
    },
  ];
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
function exitReason(args: {
  drawDefinition?: DrawDefinition;
  request: OutcomeRequest;
  view: OutcomeView;
  route?: Route;
  write?: MatchUpWrite;
  direction?: DirectionPlan;
}): AbstainReason | undefined {
  const { request, view, route, write, direction } = args;
  const { existing } = view;
  if (!isAnyExit(request.matchUpStatus) && !isAnyExit(existing.matchUpStatus) && !isAnyExit(write?.matchUpStatus))
    return undefined;
  if (route === DOUBLE_EXIT) return producedReason(view, request, direction, write);
  if (route === 'winner' && isDoubleExit(existing.matchUpStatus)) return givenWinnerReason(args);
  if (route === CLEAR_SCORE && isDoubleExit(existing.matchUpStatus))
    return write?.matchUpStatus === TO_BE_PLAYED &&
      !direction &&
      unwoundPath(view, request.matchUpId, args.drawDefinition)
      ? undefined
      : 'exit';
  if (clearedSingleExit(view, route, write)) return undefined;
  if (correctedSingleExit(args)) return undefined;
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
 * S6: a double exit given a winner (the `winner` route, a single exit or a played result). v1 first unwinds the double
 * exit as a clear does (`removeDoubleExit`: the produced exit taken back and the path to the final written back to be
 * played, `unwoundPath`, and the BYEs it placed on loser seats withdrawn), then writes the result and directs it as a
 * played result, the winner into the next matchUp the unwind left to be played (`unwoundOps`, then the direction).
 * Planned where that unwind is the plain one: the produced exit pending, not awarded, and the loser, where a link takes
 * them, placed on the seat the unwind has just freed (`unwoundLoserReason`). The direction's own checks follow
 * (`directionReason`, which reads the next matchUp as the unwind leaves it).
 */
function givenWinnerReason(args: Parameters<typeof exitReason>[0]): AbstainReason | undefined {
  const { request, view, write, direction } = args;
  if (!write?.winningSide || !DIRECTED_STATUSES.has(write.matchUpStatus)) return 'exit';
  if (request.matchUpStatus && request.matchUpStatus !== write.matchUpStatus) return 'exit';
  if (write.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes) return 'exit';
  if (direction?.produced || direction?.converged || direction?.decider) return 'exit';
  const levels = unwoundPath(view, request.matchUpId, args.drawDefinition);
  if (!levels || levels.some(({ released }) => released)) return 'exit';
  if (!view.targets.loserMatchUpId && !view.targets.loserLink && !direction?.loser)
    return levels.some(({ seatOps }) => seatOps.length) ? 'exit' : undefined;
  return unwoundLoserReason(view, levels[0], direction?.loser);
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
): AbstainReason | undefined {
  const { targets } = view;
  if (!loser?.arrives || loser.exit || loser.converged || loser.carriedPast || loser.bye || loser.withdrawn)
    return 'exit';
  if (targets.loserLink?.linkCondition || !targets.loserStructureId || !targets.loserTargetDrawPosition) return 'exit';
  const freed = own.seatOps.some(
    (op) =>
      op.op === 'withdrawBye' &&
      op.structureId === targets.loserStructureId &&
      op.drawPosition === targets.loserTargetDrawPosition,
  );
  if (!freed || !targets.loserTargetSeat?.bye) return 'exit';
  if (targets.seededParticipantIds?.includes(loser.participantId)) return 'loser';
  return undefined;
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
  return (
    route === REMOVE_DIRECTED &&
    SINGLE_EXITS.has(existing.matchUpStatus) &&
    !!existing.winningSide &&
    write?.matchUpStatus === TO_BE_PLAYED &&
    !write.winningSide
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
function correctedSingleExit(args: Parameters<typeof exitReason>[0]): boolean {
  const { request, view, route, write, direction } = args;
  const { existing } = view;
  if (route !== 'winner' || !existing.winningSide || !write?.winningSide) return false;
  if (!DIRECTED_STATUSES.has(existing.matchUpStatus) || !DIRECTED_STATUSES.has(write.matchUpStatus)) return false;
  if (request.matchUpStatus && request.matchUpStatus !== write.matchUpStatus) return false;
  if (write.matchUpStatus === DEFAULTED && view.draw.defaultProcessCodes) return false;
  if (direction?.produced || direction?.converged || direction?.decider) return false;
  const loser = direction?.loser;
  return !(loser?.exit || loser?.carriedPast || loser?.withdrawn || loser?.converged);
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
  // RULE 1: a BYE opposite, which the carrier passes into a clean next matchUp (`loserThroughBye`), where the exit lands
  if (seat.opponentBye) {
    if (targets.loserMatchUpStatus !== BYE || !targets.loserThroughBye) return 'exit';
  } else if (
    targets.loserMatchUpStatus !== TO_BE_PLAYED ||
    targets.loserMatchUpHasResult ||
    targets.loserMatchUpCarriesExit
  )
    return 'exit';
  const landing = carriedLanding(view);
  // a landing that links its loser on carries the exit again: planned level by level (`deeperLandings`)
  if (!landing || (landing.carriesOn && !deeperLandings(view, landing))) return 'exit';
  // RULE 3: somebody stands opposite, wins the carried exit and goes on, planned into a clean next matchUp
  if (landing.opponentHeld && !landing.onward) return 'exit';
  return undefined;
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
  /** RULE 1: the BYE matchUp the carrier passed, which records the carry beside its BYE on the carrier's side */
  relay?: { matchUpId: string; sideNumber: 1 | 2 };
};

const sideOf = (matchUp: HydratedMatchUp | undefined, drawPosition?: number) => {
  const sideNumber = matchUp?.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  return sideNumber === 1 || sideNumber === 2 ? sideNumber : undefined;
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
  const { loserMatchUpId, loserTargetDrawPosition, loserTargetSeat, loserThroughBye } = view.targets;
  const byeMatchUp = loserTargetSeat?.opponentBye ? indexed(view, loserMatchUpId) : undefined;
  const relaySide = sideOf(byeMatchUp, loserTargetDrawPosition);
  if (byeMatchUp && !relaySide) return undefined;
  const landing = landingAt(view, byeMatchUp ? loserThroughBye?.matchUpId : loserMatchUpId, loserTargetDrawPosition, {
    beyondBye: !!byeMatchUp,
  });
  if (!landing) return undefined;
  return byeMatchUp && relaySide
    ? { ...landing, relay: { matchUpId: byeMatchUp.matchUpId, sideNumber: relaySide } }
    : landing;
}

const indexed = (view: OutcomeView, matchUpId?: string) =>
  view.inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

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
    sideNumber,
  };
  if (!opponent?.participantId || opponent.bye || !opponent.drawPosition) return landing;
  const onward = onwardFrom(view, entry, opponent.drawPosition);
  return onward ? { ...landing, onward } : landing;
}

/**
 * Where a participant awarded an exit goes on to, as v1's nested direction sends them (`directWinner`): their position
 * joins the next matchUp of the structure. Only a clean arrival: that matchUp is to be played with no winner, score,
 * provenance or BYE, and has a seat they do not already hold. Undefined otherwise.
 */
function onwardFrom(
  view: OutcomeView,
  entry: HydratedMatchUp,
  drawPosition: number,
): { matchUpId: string; drawPositions: number[] } | undefined {
  const next = indexed(view, entry.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  const clean =
    !!next &&
    next.structureId === entry.structureId &&
    next.matchUpStatus === TO_BE_PLAYED &&
    !next.winningSide &&
    !next.score?.scoreStringSide1 &&
    !Object.keys(next.sideExitProvenance ?? {}).length &&
    !next.sides?.some((side) => side.bye) &&
    held.length < 2 &&
    !held.includes(drawPosition);
  if (!next || !clean) return undefined;
  return { matchUpId: next.matchUpId, drawPositions: [...held, drawPosition].sort((a, b) => a - b) };
}

/**
 * The levels a carried exit goes on to past its first landing (`propagateExitFrom`'s loop): the carrier loses each
 * landing and crosses its loser link, and the exit lands again by RULE 2 or 3, or past a BYE opposite by RULE 1 in the
 * clean matchUp beyond it. Planned where every level is clean, as the first must be: a free seat behind no link
 * condition, in a matchUp to be played holding no result, exit, codes or provenance (or a BYE the carrier passes), until a
 * landing links nothing on. Undefined otherwise, and where the walk reached
 * v1's bound with a level to go (F9: v1 refuses there; v2 abstains, so it never plans the bound).
 */
function deeperLandings(view: OutcomeView, first: CarriedLanding): DeeperLanding[] | undefined {
  if (!first.carriesOn) return [];
  const chain = view.targets.carryLevels;
  if (!chain || chain.bounded || chain.levels[0]?.fromMatchUpId !== first.matchUpId) return undefined;
  const deeper: DeeperLanding[] = [];
  for (const level of chain.levels) {
    if (level.linkCondition || !level.seat?.free) return undefined;
    // RULE 1 at this level: a BYE opposite, which the carrier passes into a clean matchUp beyond, where the exit lands
    const relayed = level.seat.opponentBye;
    if (relayed && (level.matchUpStatus !== BYE || !level.through)) return undefined;
    if (!relayed && (level.matchUpStatus !== TO_BE_PLAYED || level.hasResult || level.carriesExit)) return undefined;
    if (!level.record || level.record.provenance || level.record.matchUpStatusCodes?.length) return undefined;
    const at = relayed ? level.through?.matchUpId : level.matchUpId;
    const reached = landingAt(view, at, level.drawPosition, { beyondBye: relayed });
    const relaySide = relayed ? sideOf(indexed(view, level.matchUpId), level.drawPosition) : undefined;
    if (!reached || (reached.opponentHeld && !reached.onward) || (relayed && !relaySide)) return undefined;
    const landing: CarriedLanding = relaySide
      ? { ...reached, relay: { matchUpId: level.matchUpId, sideNumber: relaySide as 1 | 2 } }
      : reached;
    deeper.push({ level, landing });
    if (!landing.carriesOn) return deeper;
  }
  return undefined;
}

type DeeperLanding = { level: CarryLevel; landing: CarriedLanding };

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
  const deeper = landing ? deeperLandings(view, landing) : undefined;
  if (!loser?.exit || !landing || !deeper) return { relay: [], landing: [] };
  const exit = loser.exit;
  // the entry a side carrying the exit is given: its origin the matchUp the carrier lost, and what that matchUp was
  const carried = (exitingSideNumber: 1 | 2, sourceMatchUpId?: string, previousMatchUpStatus?: MatchUpStatusUnion) =>
    buildCarriedExitProvenance({ previousMatchUpStatus, sourceMatchUpId, matchUpStatus: exit, exitingSideNumber });
  const provenanceOps = (matchUpId: string, provenance?: ReturnType<typeof carried>): OutcomeOp[] =>
    provenance ? [{ op: 'mergeSideExitProvenance', matchUpId, provenance }] : [];
  const source = { matchUpId: request.matchUpId, status: write.matchUpStatus as MatchUpStatusUnion };
  // RULE 1: the BYE matchUp stays a BYE and records the carry beside its BYE, announced by itself
  const relay: OutcomeOp[] = landing.relay
    ? [
        ...provenanceOps(landing.relay.matchUpId, carried(landing.relay.sideNumber, source.matchUpId, source.status)),
        { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.relay.matchUpId },
      ]
    : [];
  const landed = (
    at: CarriedLanding,
    sourceMatchUpId?: string,
    previousMatchUpStatus?: MatchUpStatusUnion,
  ): OutcomeOp[] => [
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
  // each further level: the carrier placed across the landing's loser link, the exit carried from the landing they lost;
  // past a BYE there the BYE matchUp records the carry beside its BYE and the carrier goes on, as at the first level
  const levels = deeper.flatMap(({ level, landing: at }): OutcomeOp[] => [
    {
      op: 'assignPosition',
      structureId: level.structureId,
      drawPosition: level.drawPosition,
      participantId: loser.participantId,
    },
    ...(at.relay
      ? [
          ...provenanceOps(at.relay.matchUpId, carried(at.relay.sideNumber, level.fromMatchUpId, exit)),
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: at.relay.matchUpId },
        ]
      : []),
    ...(at.relay && level.through
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: level.through.matchUpId,
            drawPositions: level.through.drawPositions,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: level.through.matchUpId },
        ]
      : []),
    ...landed(at, level.fromMatchUpId, exit),
  ]);
  return { relay, landing: [...landed(landing, source.matchUpId, source.status), ...levels] };
}

/**
 * S5: a double exit entered on a matchUp holding no result, in a structure it links nothing out of, whose next matchUp
 * receives the exit it produces (`doubleExitAdvancement`: a DOUBLE_WALKOVER produces a WALKOVER, a DOUBLE_DEFAULT a
 * DEFAULTED, on the side the double exit feeds). Planned where the next matchUp is to be played and holds no result,
 * BYE, exit, codes or provenance, and links no loser on, in two shapes:
 *  - PENDING: nobody stands on the side it would be awarded to, so it is written with no winner (CA, 2026-09-20) and
 *    directs nothing, and the matchUp beside this one is still to be played, so its provenance records this side alone;
 *  - AWARDED: the winner of the matchUp beside this one stands there, so it is theirs at once and they go on into a clean
 *    next matchUp (`directWinner`), and their origin is recorded beside this one's (`buildSideExitProvenance`).
 * Beside a loser link from this matchUp or from the next, either shape is planned with the BYEs those seats take
 * (`doubleExitSeats`), outside a feed round. Abstained: a convergence, a BYE on the awarded side, an awarded winner with
 * nowhere clean to go on to, and a loser seat `doubleExitSeats` does not plan.
 */
function producedReason(
  view: OutcomeView,
  request: OutcomeRequest,
  direction?: DirectionPlan,
  write?: MatchUpWrite,
): AbstainReason | undefined {
  const { existing, targets } = view;
  if (!write || !isDoubleExit(write.matchUpStatus) || request.matchUpStatus !== write.matchUpStatus) return 'exit';
  if (existing.matchUpStatus !== TO_BE_PLAYED || existing.winningSide || write.matchUpStatusCodes?.length)
    return 'exit';
  if (targets.byeTarget) return 'exit';
  // a round robin group's matchUp sends nobody on (`doubleExitAdvancement` returns at once in a container): its result
  // and the group's tally are all there is
  if (view.group && !view.group.adHoc && !direction && !targets.winnerMatchUpId && !targets.loserMatchUpId)
    return undefined;
  // the exit it produces meets one standing there: the two converge, and that double exit produces on
  if (direction?.converged) return producedConvergedReason(view, request, write, direction) ? undefined : 'exit';
  const produced = direction?.produced;
  const target = targets.winner;
  if (!produced || direction?.decider || !target) return 'exit';
  if (target.matchUpStatus !== TO_BE_PLAYED || target.holdsResult || target.hasBye || target.carriesExit) return 'exit';
  if (target.carriedStatuses.length) return 'exit';
  const entry = indexed(view, produced.matchUpId);
  if (!entry || entry.matchUpStatusCodes?.length || Object.keys(entry.sideExitProvenance ?? {}).length) return 'exit';
  const awarded = entry.sides?.find((side) => side.sideNumber === produced.winningSide);
  if (awarded?.bye) return 'exit';
  // loser links, from this matchUp or from the next: the seats they feed take BYEs, planned outside a feed round
  if (targets.loserLink || targets.loserMatchUpId || entry.loserMatchUpId) {
    if (entry.feedRound || !doubleExitSeats(view, entry)) return 'exit';
    return pendingOrAwardedReason(view, entry, awarded);
  }
  // a feed round: the awarded side is the fed seat, filled from another structure
  if (entry.feedRound) return fedSeatReason(view, entry, awarded);
  return pendingOrAwardedReason(view, entry, awarded);
}

/**
 * Outside a feed round the produced exit is PENDING where nobody stands on the side it is awarded to and the feeder beside
 * this one is still to be played, or AWARDED where that feeder delivered its winner there (a played result, a single
 * exit or a BYE), who goes on into a clean next matchUp. A seat holding a position nobody has reached is not planned.
 */
function pendingOrAwardedReason(
  view: OutcomeView,
  entry: HydratedMatchUp,
  awarded?: { participantId?: string; drawPosition?: number },
): AbstainReason | undefined {
  const paired = pairedFeeder(view);
  if (!awarded?.participantId) {
    if (awarded?.drawPosition) return 'exit';
    return paired?.matchUpStatus === TO_BE_PLAYED ? undefined : 'exit';
  }
  // delivered by a played result or a single exit, or through a BYE (whose origin v1 records as the BYE)
  const delivered =
    paired?.matchUpStatus === BYE || (!!paired?.winningSide && DELIVERED_FEEDS.has(paired.matchUpStatus));
  if (!delivered) return 'exit';
  if (!awarded.drawPosition || !onwardFrom(view, entry, awarded.drawPosition)) return 'exit';
  return undefined;
}

type Seat = { structureId: string; drawPosition: number; matchUpId: string };

/**
 * A BYE placed on a seat and what it sends on (`assignDrawPositionBye`): the seat's matchUp becomes a BYE, the position
 * opposite goes on into the next matchUp where there is one, and, the BYE being that matchUp's loser, its loser seat takes
 * a BYE in turn (`advanceDrawPosition`), level by level. `assigns` are the seats deepest first, the order v1 announces the
 * structures' assignments in (each nested placement announces its own before the one that sent it); `writes` are the
 * matchUps in the order v1 writes them.
 */
type ByeChain = {
  assigns: OutcomeOp[];
  writes: OutcomeOp[];
  matchUpIds: string[];
  /** where the first seat's matchUp sends the position opposite its BYE, and what that matchUp holds after */
  onward?: { matchUpId: string; drawPositions: number[] };
};

/**
 * The chain from `first`, planned where every step is clean: the seat's matchUp holding at most one other position, that
 * position going on into a clean matchUp with room (or nowhere, a final), and each further seat (`levels`, read before the
 * call) behind a link with no condition, in a first round, free with nobody and no BYE beside it, its matchUp to be played
 * holding no result, exit, codes or provenance. A matchUp holding no other position that links its loser on, and a walk
 * that reached v1's bound (F9), are v1's. `announced`: whether v1 names the event for the first seat (deeper seats are
 * placed with none)
 */
function byeChain(
  view: OutcomeView,
  first: Seat,
  chain: { levels: CarryLevel[]; bounded: boolean } | undefined,
  announced: boolean,
  doubled?: boolean,
  heldFirst?: number[],
): ByeChain | undefined {
  const planned: ByeChain = { assigns: [], writes: [], matchUpIds: [] };
  let seat = first;
  for (let index = 0; ; index += 1) {
    // the first seat's matchUp as an earlier write of this call leaves it (a position advanced into it), else as found;
    // deeper seats are placed with no event
    const step = byeStep(view, seat, {
      held: index === 0 ? heldFirst : undefined,
      namesEvent: index === 0 && announced,
      besideBye: index === 0 && !!doubled,
    });
    if (!step) return undefined;
    planned.assigns.unshift(step.assign);
    planned.writes.push(...step.writes);
    planned.matchUpIds.push(...step.matchUpIds);
    if (index === 0 && step.onward) planned.onward = step.onward;
    if (!step.entry.loserMatchUpId) return planned;
    const level = chain?.levels[index];
    if (!step.opposed || !chain || chain.bounded || level?.fromMatchUpId !== step.entry.matchUpId) return undefined;
    if (!cleanByeLevel(view, level)) return undefined;
    seat = { structureId: level.structureId, drawPosition: level.drawPosition, matchUpId: level.matchUpId };
  }
}

/**
 * One BYE of a chain: the seat's BYE, its matchUp a BYE, and the position opposite sent on where there is a next
 * matchUp (into a clean one only); for a double BYE (`besideBye`, a BYE opposite the seat) the matchUp is left as it stands
 * and the BYE goes on as `byeAdvanced` plans it. Undefined where a step is not clean
 */
function byeStep(
  view: OutcomeView,
  seat: Seat,
  { held, namesEvent, besideBye }: { held?: number[]; namesEvent: boolean; besideBye: boolean },
) {
  const entry = indexed(view, seat.matchUpId);
  const opposite = (held ?? entry?.drawPositions ?? []).filter(
    (position): position is number => !!position && position !== seat.drawPosition,
  );
  if (!entry || opposite.length > 1) return undefined;
  const sends = !!opposite.length && !!entry.winnerMatchUpId && !besideBye;
  const onward = sends ? onwardFrom(view, entry, opposite[0]) : undefined;
  const byeOnward = besideBye ? byeAdvanced(view, entry, seat.drawPosition) : undefined;
  if ((sends && !onward) || (besideBye && !byeOnward)) return undefined;
  const quiet = namesEvent ? {} : { announcesEvent: false as const };
  const assign: OutcomeOp = { op: 'assignBye', ...seat, byeFromPropagation: true, ...quiet };
  // a matchUp a BYE already (the double BYE's) is left as it stands: v1 neither rewrites nor announces it
  const bye: OutcomeOp[] = besideBye
    ? []
    : [
        { op: 'setMatchUpBye', matchUpId: seat.matchUpId, ...quiet },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: seat.matchUpId },
      ];
  return {
    entry,
    assign,
    onward,
    opposed: !!opposite.length,
    writes: [...bye, ...(onward ? throughByeOps(onward) : []), ...(byeOnward?.ops ?? [])],
    matchUpIds: [seat.matchUpId, ...(onward ? [onward.matchUpId] : []), ...(byeOnward?.matchUpIds ?? [])],
  };
}

/**
 * A double BYE (`assignDrawPositionBye` beside a BYE): the seat's position already stands in the next matchUp, advanced
 * there by the BYE opposite, and is now a BYE, so that matchUp becomes a BYE and the one other position it holds goes
 * on into the matchUp after it, which must be clean. Planned where the next matchUp is to be played holding that position
 * and one other, no result or provenance, and links no loser on. Undefined otherwise
 */
function byeAdvanced(
  view: OutcomeView,
  entry: HydratedMatchUp,
  seatPosition: number,
): { ops: OutcomeOp[]; matchUpIds: string[] } | undefined {
  const onward = indexed(view, entry.winnerMatchUpId);
  const held = (onward?.drawPositions ?? []).filter((position): position is number => !!position);
  const others = held.filter((position) => position !== seatPosition);
  if (!onward || onward.structureId !== entry.structureId || onward.loserMatchUpId) return undefined;
  if (onward.matchUpStatus !== TO_BE_PLAYED || onward.winningSide || onward.score?.scoreStringSide1) return undefined;
  if (Object.keys(onward.sideExitProvenance ?? {}).length || onward.sides?.some((side) => side.bye)) return undefined;
  if (!held.includes(seatPosition) || others.length !== 1) return undefined;
  const next = onwardFrom(view, onward, others[0]);
  if (!next) return undefined;
  return {
    ops: [
      { op: 'setMatchUpBye', matchUpId: onward.matchUpId },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
      ...throughByeOps(next),
    ],
    matchUpIds: [onward.matchUpId, next.matchUpId],
  };
}

/** a further level a BYE goes on to: a first-round seat, free and alone, behind no condition, in a clean matchUp */
function cleanByeLevel(view: OutcomeView, level: CarryLevel): boolean {
  if (level.linkCondition || !level.seat?.free || level.seat.opponentHeld) return false;
  if (level.matchUpStatus !== TO_BE_PLAYED || level.hasResult || level.carriesExit) return false;
  if (!level.record || level.record.provenance || level.record.matchUpStatusCodes?.length) return false;
  return indexed(view, level.matchUpId)?.roundNumber === 1;
}

/** a position advanced through a BYE a double exit placed, announced as v1's `advanceWinner`, with no event */
const throughByeOps = (onward: { matchUpId: string; drawPositions: number[] }): OutcomeOp[] => [
  {
    op: 'setMatchUpDrawPositions',
    matchUpId: onward.matchUpId,
    drawPositions: onward.drawPositions,
    advancesThroughBye: true,
  },
  { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
];

type DoubleExitSeats = {
  /** this matchUp's loser seat across its link: a BYE there and what it sends on */
  own?: ByeChain;
  /** the seat the next matchUp's loser link feeds, which its produced exit leaves nobody to fill: a BYE and its chain */
  unfillable?: ByeChain;
  /** under `doubleExitPropagateBye: false`: the exit produced on this matchUp's loser matchUp, in place of `own` */
  producedLoser?: ProducedLoser;
  /** under `doubleExitPropagateBye: false`, a BYE opposite the loser seat: the exit recorded there and carried on */
  heldLoser?: HeldLoser;
};

type HeldLoser = {
  /** the loser matchUp, a BYE, which records the exit on the seat's side */
  byeMatchUpId: string;
  /** its structure, which v1's writes there stamp */
  structureId: string;
  seatSide: 1 | 2;
  /** the matchUp the seat's position already stands in (the BYE advanced it), which takes the exit pending */
  onwardMatchUpId: string;
  arrivalSide: 1 | 2;
};

type ProducedLoser = {
  matchUpId: string;
  /** the loser matchUp's structure, which v1's score write there stamps */
  structureId: string;
  /** the side the loser seat is on, which the exit's origin is recorded on; the exit is awarded to the other */
  seatSide: 1 | 2;
  /** the empty position opposite, advanced ahead of the arrival it awaits (a reservation) */
  onward: { matchUpId: string; drawPositions: number[] };
  /** the loser matchUp's own loser seat, which nobody will lose into: a BYE placed with no event, and its chain */
  beyond?: ByeChain;
};

/**
 * The BYEs a double exit with loser links places (`doubleExitAdvancement`, `propagateUnfillableLoserBye`): nobody loses
 * this matchUp, so the seat its link feeds takes a propagated BYE, with all it sends on (`byeChain`); nobody will lose
 * the next matchUp either (its produced exit is pending, or awarded to the winner standing there), so the seat ITS link
 * feeds takes a BYE too, with its chain. Planned where each first seat is clean (a link with no condition, a free seat
 * with no BYE beside it, the matchUp to be played holding no result, exit, codes or provenance; a participant opposite
 * this matchUp's seat goes on through its BYE as an empty position does), each chain plans, and no matchUp is in two.
 */
function doubleExitSeats(view: OutcomeView, entry: HydratedMatchUp): DoubleExitSeats | undefined {
  const { targets } = view;
  const seats: DoubleExitSeats = {};
  // under `doubleExitPropagateBye: false` the loser matchUp takes a produced exit in place of the BYE
  if (!view.draw.doubleExitPropagatesBye && targets.loserTargetSeat?.opponentBye) {
    seats.heldLoser = heldLoser(view);
    if (!seats.heldLoser) return undefined;
  } else if (!view.draw.doubleExitPropagatesBye && (targets.loserLink || targets.loserMatchUpId)) {
    seats.producedLoser = producedLoser(view);
    if (!seats.producedLoser) return undefined;
  } else if (targets.loserLink || targets.loserMatchUpId) {
    seats.own = ownByeChain(view);
    if (!seats.own) return undefined;
  }
  if (entry.loserMatchUpId) {
    seats.unfillable = unfillableByeChain(view, entry, seats.own?.onward);
    if (!seats.unfillable) return undefined;
  }
  // the one matchUp both may touch: the unfillable seat's, which the own seat's BYE sent a position into first
  const shared =
    seats.unfillable?.matchUpIds[0] === seats.own?.onward?.matchUpId ? seats.own?.onward?.matchUpId : undefined;
  const touched = [
    ...(seats.own?.matchUpIds ?? []).filter((matchUpId) => matchUpId !== shared),
    ...(seats.unfillable?.matchUpIds ?? []),
    ...producedLoserMatchUpIds(seats.producedLoser),
    ...(seats.heldLoser ? [seats.heldLoser.byeMatchUpId, seats.heldLoser.onwardMatchUpId] : []),
    entry.matchUpId,
  ];
  return new Set(touched).size === touched.length ? seats : undefined;
}

/** this matchUp's loser seat, a BYE placed with the event named (`handleLoserMatchUp`), and its chain */
function ownByeChain(view: OutcomeView): ByeChain | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  const { loserStructureId, loserTargetDrawPosition, loserMatchUpRecord, loserMatchUpId } = targets;
  if (targets.loserLink?.linkCondition || !loserMatchUpId || !loserStructureId || !loserTargetDrawPosition)
    return undefined;
  // a participant opposite goes on through the BYE as an empty position would; a BYE opposite makes a double BYE, the
  // matchUp a BYE already
  const doubled = !!seat?.opponentBye;
  if (!seat?.free) return undefined;
  if (targets.loserMatchUpStatus !== (doubled ? BYE : TO_BE_PLAYED)) return undefined;
  if (targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit) return undefined;
  if (!loserMatchUpRecord || loserMatchUpRecord.provenance || loserMatchUpRecord.matchUpStatusCodes?.length)
    return undefined;
  const first = { structureId: loserStructureId, drawPosition: loserTargetDrawPosition, matchUpId: loserMatchUpId };
  return byeChain(view, first, targets.byeLevels?.own, true, doubled);
}

/** the produced exit's matchUp's loser seat, a BYE placed with no event (`conditionallyAdvanceDrawPosition`), and its chain */
function unfillableByeChain(
  view: OutcomeView,
  entry: HydratedMatchUp,
  ownOnward?: { matchUpId: string; drawPositions: number[] },
  from: { seat?: WinnerLoserSeat; levels?: { levels: CarryLevel[]; bounded: boolean } } = {
    seat: view.targets.winnerLoserSeat,
    levels: view.targets.byeLevels?.unfillable,
  },
): ByeChain | undefined {
  const unfillable = from.seat;
  // v1 places this BYE behind a FIRST_MATCHUP link too (`advanceByeToLoserMatchUp` asks no condition): nobody loses here
  const conditioned = unfillable?.linkCondition && unfillable.linkCondition !== FIRST_MATCHUP;
  if (!unfillable || conditioned || unfillable.matchUpId !== entry.loserMatchUpId) return undefined;
  // a position the own seat's BYE sent into this matchUp first stands opposite: it goes on through this BYE too
  const joined = ownOnward?.matchUpId === unfillable.matchUpId ? ownOnward.drawPositions : undefined;
  if (!unfillable.seat?.free || unfillable.seat.opponentBye || (unfillable.seat.opponentHeld && !joined))
    return undefined;
  if (unfillable.matchUpStatus !== TO_BE_PLAYED || unfillable.hasResult) return undefined;
  const record = indexed(view, unfillable.matchUpId);
  if (!record || record.matchUpStatusCodes?.length || Object.keys(record.sideExitProvenance ?? {}).length)
    return undefined;
  const { structureId, drawPosition, matchUpId } = unfillable;
  const first = { structureId, drawPosition, matchUpId };
  return byeChain(view, first, from.levels, false, false, joined);
}

/**
 * Under `doubleExitPropagateBye: false`, a loser seat opposite a BYE (its matchUp a BYE already): v1 records the exit the
 * double exit produces on the BYE matchUp, on the seat's side, its score removed (`stampExitOnByeHeldLoserTarget`), and
 * carries it on (`carryExitOnward`) into the matchUp the seat's position already stands in, advanced there by the BYE,
 * where it lands pending with its origin on that side. Planned behind a link with no condition, the BYE matchUp holding
 * no codes or provenance, and the matchUp beyond to be played holding no result, BYE, exit or provenance, nobody on
 * the other side, and a feeder still to be played (or a fed seat) for it.
 */
function heldLoser(view: OutcomeView): HeldLoser | undefined {
  const { targets } = view;
  const { loserTargetDrawPosition, loserMatchUpRecord, loserTargetSeat: seat } = targets;
  const byeMatchUp = indexed(view, targets.loserMatchUpId);
  if (targets.loserLink?.linkCondition || !byeMatchUp || !loserTargetDrawPosition || !seat?.free) return undefined;
  if (targets.loserMatchUpStatus !== BYE || targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit)
    return undefined;
  if (!loserMatchUpRecord || loserMatchUpRecord.provenance || loserMatchUpRecord.matchUpStatusCodes?.length)
    return undefined;
  const seatSide = byeMatchUp.feedRound ? 1 : sideOf(byeMatchUp, loserTargetDrawPosition);
  const onward = indexed(view, byeMatchUp.winnerMatchUpId);
  const arrivalSide = sideOf(onward, loserTargetDrawPosition);
  if (!seatSide || !onward || !arrivalSide || onward.structureId !== byeMatchUp.structureId) return undefined;
  if (onward.matchUpStatus !== TO_BE_PLAYED || onward.winningSide || onward.score?.scoreStringSide1) return undefined;
  if (Object.keys(onward.sideExitProvenance ?? {}).length || onward.sides?.some((side) => side.bye)) return undefined;
  const other = onward.sides?.find((side) => side.sideNumber === 3 - arrivalSide);
  if (other?.participantId) return undefined;
  const feeder = view.inContextDrawMatchUps?.find(
    (matchUp) => matchUp.winnerMatchUpId === onward.matchUpId && matchUp.matchUpId !== byeMatchUp.matchUpId,
  );
  if (!(feeder?.matchUpStatus === TO_BE_PLAYED || (onward.feedRound && !feeder))) return undefined;
  return {
    byeMatchUpId: byeMatchUp.matchUpId,
    structureId: byeMatchUp.structureId,
    onwardMatchUpId: onward.matchUpId,
    arrivalSide,
    seatSide,
  };
}

/** the exit recorded on the BYE matchUp and carried on, as v1 writes the two, the BYE matchUp first */
function heldLoserOps(request: OutcomeRequest, held: HeldLoser): OutcomeOp[] {
  const status = request.matchUpStatus as MatchUpStatusUnion;
  const entry = (exitingSideNumber: 1 | 2) =>
    buildCarriedExitProvenance({
      sourceMatchUpId: request.matchUpId,
      previousMatchUpStatus: status,
      matchUpStatus: status,
      exitingSideNumber,
    });
  const blank = { scoreStringSide1: '', scoreStringSide2: '' };
  const write = (matchUpId: string, matchUpStatus: MatchUpStatusUnion, side: 1 | 2): OutcomeOp[] => {
    const provenance = entry(side);
    return [
      {
        op: 'setMatchUpResult',
        matchUpId,
        matchUpStatus,
        matchUpStatusCodes: [],
        stampsScoredTime: false,
        announcesContext: false,
        score: blank,
      },
      ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ];
  };
  const produced = status === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  return [
    ...write(held.byeMatchUpId, BYE, held.seatSide),
    ...write(held.onwardMatchUpId, produced, held.arrivalSide),
    { op: 'stampUpdatedAt', entity: 'structure', id: held.structureId },
  ];
}

const producedLoserMatchUpIds = (produced?: ProducedLoser) =>
  produced ? [produced.matchUpId, produced.onward.matchUpId, ...(produced.beyond?.matchUpIds ?? [])] : [];

/**
 * Under `doubleExitPropagateBye: false` nobody loses the double exit, and its loser matchUp takes a produced exit
 * (`handleLoserMatchUp` → `conditionallyAdvanceDrawPosition`): the double exit's flavour, awarded to the side opposite the
 * seat, its origin recorded on the seat's side, and the position opposite advanced into the next matchUp: a participant
 * standing there goes on, an empty position goes ahead of the arrival it awaits (a reservation). Planned only in a first
 * round, not fed (a fed seat takes a BYE whatever the policy), behind a link with no condition: the seat free with no
 * BYE opposite, the matchUp to be played holding no result, exit, codes or provenance, and the advance into a clean
 * matchUp with room. A loser matchUp that links its own loser on (COMPASS, OLYMPIC) leaves that seat to nobody: a BYE,
 * with all it sends on (`byeChain`).
 */
function producedLoser(view: OutcomeView): ProducedLoser | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  const loserMatchUp = indexed(view, targets.loserMatchUpId);
  const { loserTargetDrawPosition, loserMatchUpRecord } = targets;
  if (targets.loserLink?.linkCondition || !loserMatchUp || !loserTargetDrawPosition) return undefined;
  if (loserMatchUp.roundNumber !== 1 || loserMatchUp.feedRound || loserMatchUp.hasFedDrawPosition) return undefined;
  // a participant opposite is awarded the exit and goes on, as the empty position would; a BYE opposite is v1's
  if (!seat?.free || seat.opponentBye) return undefined;
  if (targets.loserMatchUpStatus !== TO_BE_PLAYED || targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit)
    return undefined;
  if (!loserMatchUpRecord || loserMatchUpRecord.provenance || loserMatchUpRecord.matchUpStatusCodes?.length)
    return undefined;
  const seatSide = sideOf(loserMatchUp, loserTargetDrawPosition);
  const opposite = (targets.loserMatchUpDrawPositions ?? []).filter((position) => position !== loserTargetDrawPosition);
  const onward = opposite.length === 1 ? onwardFrom(view, loserMatchUp, opposite[0]) : undefined;
  if (!seatSide || !onward) return undefined;
  const produced: ProducedLoser = {
    matchUpId: loserMatchUp.matchUpId,
    structureId: loserMatchUp.structureId,
    seatSide,
    onward,
  };
  if (!loserMatchUp.loserMatchUpId) return produced;
  // a loser matchUp that links its own loser on: nobody will lose it either, so that seat takes a BYE, with its chain
  const levels = targets.byeLevels?.own;
  const [level, ...deeper] = levels?.levels ?? [];
  if (!levels || !level || level.fromMatchUpId !== loserMatchUp.matchUpId || !cleanByeLevel(view, level))
    return undefined;
  const seatAt = { structureId: level.structureId, drawPosition: level.drawPosition, matchUpId: level.matchUpId };
  const beyond = byeChain(view, seatAt, { levels: deeper, bounded: levels.bounded }, false);
  return beyond ? { ...produced, beyond } : undefined;
}

/**
 * the exit produced on the loser matchUp, as v1 writes it there: the BYE beyond it first (`conditionallyAdvanceDrawPosition`
 * serves the loser seat before the score), then the exit, its origin, and the advance
 */
function producedLoserOps(request: OutcomeRequest, produced: ProducedLoser): OutcomeOp[] {
  const matchUpStatus = request.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: request.matchUpStatus as MatchUpStatusUnion,
    sourceMatchUpId: request.matchUpId,
    sourceSideNumber: produced.seatSide,
  });
  return [
    ...(produced.beyond ? [...produced.beyond.assigns, ...produced.beyond.writes] : []),
    {
      op: 'setMatchUpResult',
      matchUpId: produced.matchUpId,
      matchUpStatus,
      winningSide: (3 - produced.seatSide) as 1 | 2,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(matchUpStatus === WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: produced.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: produced.matchUpId },
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: produced.onward.matchUpId,
      drawPositions: produced.onward.drawPositions,
      announcesContext: false,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: produced.onward.matchUpId },
    { op: 'stampUpdatedAt', entity: 'structure', id: produced.structureId },
  ];
}

/** the double exit's BYEs and what they send on, in the order v1 announces them */
function doubleExitSeatOps(view: OutcomeView, request: OutcomeRequest, direction?: DirectionPlan): OutcomeOp[] {
  const entry = direction?.produced ? indexed(view, direction.produced.matchUpId) : undefined;
  const seats = entry ? doubleExitSeats(view, entry) : undefined;
  if (!seats) return [];
  const { own, unfillable, producedLoser: produced, heldLoser: held } = seats;
  return [
    ...(produced ? producedLoserOps(request, produced) : []),
    ...(held ? heldLoserOps(request, held) : []),
    ...(own ? [...own.assigns, ...own.writes] : []),
    ...(unfillable ? [...unfillable.assigns, ...unfillable.writes] : []),
  ];
}

/** a feeder's results whose winner standing in the seat it feeds is an origin v1 records as it is (`deliveredStatus`) */
const DELIVERED_FEEDS = new Set<string | undefined>([COMPLETED, ...SINGLE_EXITS]);

/**
 * A produced exit in a FEED ROUND, beside the fed seat. Planned where that seat holds a position nobody has reached yet:
 * the exit stands pending for whoever arrives there, and v1 advances the EMPTY position into the next matchUp ahead of
 * them (a reservation for the arrival, `doubleExitAdvancement`), into a clean one only. A fed seat already filled (the
 * award and its onward direction) or holding no position is v1's.
 */
function fedSeatReason(
  view: OutcomeView,
  entry: HydratedMatchUp,
  awarded?: { participantId?: string; drawPosition?: number },
): AbstainReason | undefined {
  if (awarded?.participantId || !awarded?.drawPosition) return 'exit';
  return onwardFrom(view, entry, awarded.drawPosition) ? undefined : 'exit';
}

/** the matchUp beside this one in its round, which feeds the other side of the same next matchUp */
function pairedFeeder(view: OutcomeView): HydratedMatchUp | undefined {
  const { structureId, roundNumber, roundPosition } = view.targets.source;
  if (!roundPosition) return undefined;
  const paired = roundPosition % 2 ? roundPosition + 1 : roundPosition - 1;
  return view.inContextDrawMatchUps?.find(
    (matchUp) =>
      matchUp.structureId === structureId && matchUp.roundNumber === roundNumber && matchUp.roundPosition === paired,
  );
}

/**
 * The produced exit's write on the next matchUp, as v1's `doubleExitAdvancement` makes it there: the status, no winner,
 * the policy codes it keeps (`[]`), a WALKOVER's score blanked, then the side the double exit feeds given its origin
 * (`buildSideExitProvenance`, v1's own builder). Announced as the score write it is.
 */
function producedOps(view: OutcomeView, request: OutcomeRequest, write: MatchUpWrite, direction?: DirectionPlan) {
  const produced = direction?.produced;
  if (!produced) return [];
  const entry = indexed(view, produced.matchUpId);
  const awarded = entry?.sides?.find((side) => side.sideNumber === produced.winningSide);
  const paired = awarded?.participantId && !entry?.feedRound ? pairedFeeder(view) : undefined;
  // awarded at once to the paired feeder's winner standing there, or in a feed round the fed seat's empty position
  // advanced ahead of the arrival it awaits (a reservation)
  const reserving = !!entry?.feedRound && !awarded?.participantId;
  const onward =
    entry && (paired || reserving) && awarded?.drawPosition ? onwardFrom(view, entry, awarded.drawPosition) : undefined;
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
    sourceSideNumber: 3 - produced.winningSide,
    sourceMatchUpId: request.matchUpId,
    // the opponent standing there arrived from the feeder beside this one: its origin is recorded too
    ...(paired ? { pairedMatchUpStatus: paired.matchUpStatus, pairedMatchUpId: paired.matchUpId } : {}),
  });
  const ops: OutcomeOp[] = [
    {
      op: 'setMatchUpResult',
      matchUpId: produced.matchUpId,
      matchUpStatus: produced.matchUpStatus,
      ...(paired ? { winningSide: produced.winningSide } : {}),
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(produced.matchUpStatus === WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: produced.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: produced.matchUpId },
    // the awarded opponent going on (`directWinner`), or the reservation; announced as v1 announces them here
    ...(onward
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: onward.matchUpId },
        ]
      : []),
  ];
  return ops;
}

type ProducedTarget = {
  entry: HydratedMatchUp;
  /** the side the double exit feeds, and the side its produced exit is awarded to */
  fedSide: 1 | 2;
  awardedSide: 1 | 2;
  matchUpStatus: MatchUpStatusUnion;
  /** the next round is a feed round: the awarded side is the seat fed from another structure */
  feed: boolean;
};

/**
 * Where a double exit at `source` produces its exit, read from the index as `planProducedExit` reads the call's: the next
 * matchUp of the same structure, in a round of half as many matchUps (roundPosition n feeds side 1 when odd and 2 when
 * even) or a feed round of as many (it feeds side 2, beside the fed seat). A DOUBLE_DEFAULT produces a DEFAULTED, any
 * other double exit a WALKOVER.
 */
function producedTarget(
  view: OutcomeView,
  source: HydratedMatchUp,
  sourceStatus?: MatchUpStatusUnion,
): ProducedTarget | undefined {
  const index = view.inContextDrawMatchUps ?? [];
  const entry = indexed(view, source.winnerMatchUpId);
  const { roundNumber, roundPosition, structureId } = source;
  if (!entry || !roundNumber || !roundPosition || entry.structureId !== structureId) return undefined;
  if (entry.roundNumber !== roundNumber + 1) return undefined;
  const count = (round?: number) =>
    index.filter((m) => m.structureId === structureId && m.roundNumber === round).length;
  const here = count(roundNumber);
  const there = count(entry.roundNumber);
  const feed = there === here && entry.roundPosition === roundPosition && !!entry.feedRound;
  const plain = there * 2 === here && entry.roundPosition === Math.ceil(roundPosition / 2);
  if (!feed && !plain) return undefined;
  const fedSide = feed || roundPosition % 2 === 0 ? 2 : 1;
  const matchUpStatus = sourceStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  return { entry, fedSide, awardedSide: (3 - fedSide) as 1 | 2, matchUpStatus, feed };
}

/**
 * The produced exit lands pending, planned where its matchUp is to be played with no winner, score, BYE, exit, codes or
 * provenance, and links no loser on; and, on the side it is awarded to, nobody stands: in a feed round a fed seat whose
 * empty position goes ahead into a clean next matchUp (the reservation), otherwise no position at all, beside a feeder
 * still to be played. Anything else (an award, a convergence there) is v1's.
 */
function producedTargetReason(
  view: OutcomeView,
  source: HydratedMatchUp,
  target: ProducedTarget,
  loserLinked?: boolean,
): boolean {
  const { entry } = target;
  if (entry.matchUpStatus !== TO_BE_PLAYED || entry.winningSide || entry.score?.scoreStringSide1) return false;
  if (entry.matchUpStatusCodes?.length || Object.keys(entry.sideExitProvenance ?? {}).length) return false;
  if ((entry.loserMatchUpId && !loserLinked) || entry.sides?.some((side) => side.bye)) return false;
  const awarded = entry.sides?.find((side) => side.sideNumber === target.awardedSide);
  if (awarded?.participantId) return false;
  if (target.feed) return !!awarded?.drawPosition && !!onwardFrom(view, entry, awarded.drawPosition);
  if (awarded?.drawPosition) return false;
  const pairedPosition =
    (source.roundPosition ?? 0) % 2 ? (source.roundPosition ?? 0) + 1 : (source.roundPosition ?? 0) - 1;
  const paired = view.inContextDrawMatchUps?.find(
    (m) =>
      m.structureId === source.structureId &&
      m.roundNumber === source.roundNumber &&
      m.roundPosition === pairedPosition,
  );
  return paired?.matchUpStatus === TO_BE_PLAYED;
}

/** the produced exit's write, as v1's `doubleExitAdvancement` makes it (#5874), and in a feed round the reservation */
function producedTargetOps(
  view: OutcomeView,
  target: ProducedTarget,
  sourceMatchUpId: string,
  sourceStatus: MatchUpStatusUnion,
): OutcomeOp[] {
  const { entry } = target;
  const provenance = buildSideExitProvenance({
    sourceSideNumber: target.fedSide,
    sourceMatchUpStatus: sourceStatus,
    sourceMatchUpId,
  });
  const awarded = entry.sides?.find((side) => side.sideNumber === target.awardedSide);
  const onward = target.feed && awarded?.drawPosition ? onwardFrom(view, entry, awarded.drawPosition) : undefined;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: entry.matchUpId,
      matchUpStatus: target.matchUpStatus,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(target.matchUpStatus === WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: entry.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ...(onward
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: onward.matchUpId },
        ]
      : []),
  ];
}

/** the exit a loser carries across the link (`progressExitStatus`): a WALKOVER or DEFAULTED as itself, else a WALKOVER */
const carriedStatus = (status?: string): MatchUpStatusUnion => (status === DEFAULTED ? DEFAULTED : WALKOVER);

/**
 * S5: RULE 4 of v1's `progressExitStatus`. The loser carries an exit onto the seat a carried exit standing there was
 * awarded to: the two meet and the matchUp becomes the double exit (`collapseDoubleExitStatus`), its award taken away,
 * codes as they stood and a DOUBLE_WALKOVER's score blanked, the arriving side's entry merged beside the standing one; and that double exit then
 * produces its exit onward, as a double exit entered there would (`producedTarget`). Planned where the landing holds a
 * single exit awarded to the carrier's seat, carried in on the other side and on that side alone, no score value, and
 * no loser link of its own (the first carrier, its loser, was sent nowhere), and where the produced exit lands clean.
 */
function convergedReason(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  loser: NonNullable<DirectionPlan['loser']>,
): AbstainReason | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  if (write.matchUpStatusCodes?.length || !loser.arrives) return 'exit';
  if (!seat?.free || seat.opponentBye) return 'exit';
  if (!SINGLE_EXITS.has(targets.loserMatchUpStatus) || targets.loserMatchUpStatus === RETIRED) return 'exit';
  const landing = indexed(view, targets.loserMatchUpId);
  const side = sideOf(landing, targets.loserTargetDrawPosition);
  if (!landing || !side || landing.loserMatchUpId || landing.winningSide !== side) return 'exit';
  if (landing.score?.scoreStringSide1 || landing.score?.scoreStringSide2 || landing.score?.sets?.length) return 'exit';
  const provenance = landing.sideExitProvenance ?? {};
  if (provenance[side] || !provenance[3 - side]?.matchUpStatus) return 'exit';
  const converged = collapseDoubleExitStatus([carriedStatus(request.matchUpStatus), targets.loserMatchUpStatus]);
  if (loser.converged !== converged) return 'exit';
  const target = producedTarget(view, landing, converged);
  return target && producedTargetReason(view, landing, target) ? undefined : 'exit';
}

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

/**
 * S5: a double exit whose produced exit meets an exit standing in the next matchUp (`conditionallyAdvanceDrawPosition`'s
 * `existingExit`): the two converge there (`collapseDoubleExitStatus`: two defaults a `DOUBLE_DEFAULT`, anything else a
 * `DOUBLE_WALKOVER`), with no winner, the arriving side's origin merged beside the standing one, and that double exit
 * produces on as one entered there would (`advanceConvergedWinner`). Planned where the standing exit is a pending one a
 * double exit beside this one produced (its origin alone, on the other side; nobody there; no score, codes or loser link),
 * nothing links a loser on from this matchUp, and the exit produced onward lands clean (or the landing is a final).
 */
function producedConvergedReason(
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
  const own = linked ? ownByeChain(view) : undefined;
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
  const onwardBye = onwardLinked
    ? unfillableByeChain(view, onward.entry, undefined, { seat, levels: seat?.levels })
    : undefined;
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
function producedConvergedOps(
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
      ...(matchUpStatus === DOUBLE_WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: landing.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
    // the onward matchUp's unfillable seat is served before its produced exit is written (`conditionallyAdvanceDrawPosition`)
    ...(onwardBye ? [...onwardBye.assigns, ...onwardBye.writes] : []),
    ...(onward ? producedTargetOps(view, onward, landing.matchUpId, matchUpStatus) : []),
  ];
  return ops;
}

/** what a double exit produces in the next matchUp: an exit there, or a convergence with the one standing there */
function producedExitOps(view: OutcomeView, request: OutcomeRequest, write: MatchUpWrite, direction?: DirectionPlan) {
  return direction?.converged
    ? producedConvergedOps(view, request, write, direction)
    : producedOps(view, request, write, direction);
}

/** a convergence's writes: the landing as the double exit, the arriving side's entry, and the exit it produces */
function convergedOps(view: OutcomeView, request: OutcomeRequest, write: MatchUpWrite, loser?: DirectionPlan['loser']) {
  const { targets } = view;
  const landing = indexed(view, targets.loserMatchUpId);
  const side = sideOf(landing, targets.loserTargetDrawPosition);
  if (!loser?.arrives || !loser.converged || !landing || !side) return [];
  const target = producedTarget(view, landing, loser.converged);
  if (!target) return [];
  const provenance = buildCarriedExitProvenance({
    previousMatchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
    matchUpStatus: carriedStatus(request.matchUpStatus),
    sourceMatchUpId: request.matchUpId,
    exitingSideNumber: side,
  });
  const ops: OutcomeOp[] = [
    {
      op: 'setMatchUpResult',
      matchUpId: landing.matchUpId,
      matchUpStatus: loser.converged,
      // a DOUBLE_WALKOVER says nothing was played, so its score is blanked; a DOUBLE_DEFAULT keeps what stood
      ...(loser.converged === DOUBLE_WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: landing.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
    ...producedTargetOps(view, target, landing.matchUpId, loser.converged),
  ];
  return ops;
}

/** the first reason this call is not S1's, or undefined when it is */
const BLANK_SCORE: Score = { scoreStringSide1: '', scoreStringSide2: '' };
const scoreless = (matchUp: HydratedMatchUp) =>
  !matchUp.score?.scoreStringSide1 && !matchUp.score?.scoreStringSide2 && !matchUp.score?.sets?.length;
const unplaced = (matchUp: HydratedMatchUp) => !(matchUp.drawPositions ?? []).some(Boolean);
const undecided = (matchUp: HydratedMatchUp, loserLinked?: boolean) =>
  !matchUp.winningSide &&
  scoreless(matchUp) &&
  unplaced(matchUp) &&
  !matchUp.matchUpStatusCodes?.length &&
  (loserLinked || !matchUp.loserMatchUpId) &&
  !matchUp.sides?.some((side) => side.bye);

/** a matchUp on a cleared double exit's path, with the writes v1's unwind makes at the seat its loser link feeds */
type UnwoundLevel = {
  matchUpId: string;
  seatOps: OutcomeOp[];
  /** the drawPosition an award sent on into this matchUp, taken back out of it */
  released?: number;
};

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
function unwoundPath(
  view: OutcomeView,
  matchUpId?: string,
  drawDefinition?: DrawDefinition,
): UnwoundLevel[] | undefined {
  const source = indexed(view, matchUpId);
  const structureId = source?.structureId;
  if (!source || !structureId) return undefined;
  const linksOut = (drawDefinition?.links ?? []).filter((link) => link.source?.structureId === structureId);
  if (linksOut.some((link) => link.linkType !== LOSER || link.linkCondition)) return undefined;
  if (linksOut.length && !view.draw.doubleExitPropagatesBye) return undefined;
  const target = producedTarget(view, source, source.matchUpStatus as MatchUpStatusUnion);
  if (!target || target.feed) return undefined;
  const { entry } = target;
  if (entry.matchUpStatus !== target.matchUpStatus) return undefined;
  const awardee = awardedReason(view, source, target);
  if (awardee === false) return undefined;
  const path = [source.matchUpId, entry.matchUpId];
  let next = indexed(view, entry.winnerMatchUpId);
  // the awardee went on into the next matchUp, alone there: their position comes back out of it
  if (awardee) {
    const held = (next?.drawPositions ?? []).filter(Boolean);
    if (!next || held.length !== 1 || held[0] !== awardee || next.structureId !== structureId) return undefined;
    if (next.matchUpStatus !== TO_BE_PLAYED || next.winningSide || !scoreless(next)) return undefined;
    if (next.matchUpStatusCodes?.length || Object.keys(next.sideExitProvenance ?? {}).length) return undefined;
    path.push(next.matchUpId);
    next = indexed(view, next.winnerMatchUpId);
  }
  while (next) {
    const clean = next.structureId === structureId && next.matchUpStatus === TO_BE_PLAYED && undecided(next, true);
    if (!clean || Object.keys(next.sideExitProvenance ?? {}).length || path.includes(next.matchUpId)) return undefined;
    path.push(next.matchUpId);
    next = indexed(view, next.winnerMatchUpId);
  }
  const seats = view.targets.unwindLoserSeats ?? [];
  const levels: UnwoundLevel[] = [];
  for (const [index, id] of path.entries()) {
    const level = seats[index];
    if (level?.matchUpId !== id) return undefined;
    // the double exit's own seat and its produced exit's took the BYEs it placed; a seat further on holds nothing yet
    const seatOps = level.loserSeat ? unwoundSeatOps(view, level.loserSeat, index < 2) : [];
    if (!seatOps) return undefined;
    levels.push({ matchUpId: id, seatOps, ...(awardee && index === 2 ? { released: awardee } : {}) });
  }
  return levels;
}

/**
 * The produced exit as it stands: pending (undefined), with this matchUp's origin, on the side it fed, its only
 * provenance and nothing placed; or awarded to the winner of the matchUp beside this one, who stands there alone with
 * their arrival recorded beside that origin (their drawPosition). False for anything else (a convergence, a score, codes).
 */
function awardedReason(view: OutcomeView, source: HydratedMatchUp, target: ProducedTarget): number | false | undefined {
  const { entry, fedSide, awardedSide } = target;
  const provenance = entry.sideExitProvenance ?? {};
  const origins = Object.keys(provenance);
  if (provenance[fedSide]?.sourceMatchUpId !== source.matchUpId) return false;
  if (!entry.winningSide) return undecided(entry, true) && origins.length === 1 ? undefined : false;
  const awarded = entry.sides?.find((side) => side.sideNumber === awardedSide);
  const arrival = provenance[awardedSide];
  const paired = pairedFeeder(view);
  const held = (entry.drawPositions ?? []).filter(Boolean);
  if (entry.winningSide !== awardedSide || !awarded?.participantId || !awarded.drawPosition) return false;
  if (origins.length !== 2 || arrival?.matchUpStatus || !paired || arrival?.sourceMatchUpId !== paired.matchUpId)
    return false;
  if (held.length !== 1 || !scoreless(entry) || entry.matchUpStatusCodes?.length) return false;
  if (entry.sides?.some((side) => side.bye)) return false;
  return awarded.drawPosition;
}

/**
 * v1's `removeDirectedBye` at a seat the unwind visits. Where the double exit placed a BYE (its own loser seat, and the
 * seat its produced exit left unfillable), the BYE is withdrawn, its matchUp is to be played again, and a position the
 * BYE sent on is taken back out of the next matchUp; planned where that BYE went no further (its matchUp links no loser
 * on, and the next matchUp is to be played with no result or provenance, and keeps a position). A seat further on holds nothing yet, and the
 * visit only announces its structure. Undefined for anything else.
 */
function unwoundSeatOps(view: OutcomeView, loserSeat: WinnerLoserSeat, placedBye: boolean): OutcomeOp[] | undefined {
  const { structureId, drawPosition, matchUpId, seat } = loserSeat;
  const withdraw: OutcomeOp = { op: 'withdrawBye', structureId, drawPosition };
  if (!seat || loserSeat.linkCondition) return undefined;
  if (!placedBye) return seat.free && loserSeat.matchUpStatus !== BYE ? [withdraw] : undefined;
  const byeMatchUp = indexed(view, matchUpId);
  if (!seat.bye || !seat.byeFromPropagation || seat.opponentBye || !byeMatchUp) return undefined;
  if (byeMatchUp.matchUpStatus !== BYE || byeMatchUp.loserMatchUpId) return undefined;
  const opposite = loserSeat.drawPositions.filter((position) => position !== drawPosition);
  const ops: OutcomeOp[] = [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId, drawPosition },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
  const next = indexed(view, byeMatchUp.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  // a BYE alone in its matchUp sent nobody on; a next matchUp holding a position is rewritten by v1's position clear
  // all the same, and announced (census 20660398, FEED_IN_CHAMPIONSHIP_TO_SF 16): v1's
  if (!opposite.length) return held.length ? undefined : ops;
  // a next matchUp the withdrawal leaves with no position is v1's: its release re-announces it
  // (`releaseAdvancedDrawPosition`)
  if (opposite.length > 1 || !next || !held.includes(opposite[0]) || held.length < 2) return undefined;
  if (next.matchUpStatus !== TO_BE_PLAYED || next.winningSide || !scoreless(next)) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || next.sides?.some((side) => side.bye)) return undefined;
  return [
    ...ops,
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: held.filter((position) => position !== opposite[0]),
      withdrawnByePosition: drawPosition,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
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
): OutcomeOp[] {
  if ((route !== CLEAR_SCORE && route !== 'winner') || !isDoubleExit(view.existing.matchUpStatus)) return [];
  const levels = unwoundPath(view, request.matchUpId, drawDefinition) ?? [];
  return [...levels].reverse().flatMap(({ matchUpId, seatOps, released }, depth): OutcomeOp[] => {
    if (matchUpId === request.matchUpId) return seatOps;
    const produced = depth === levels.length - 2;
    const held = indexed(view, matchUpId)?.drawPositions ?? [];
    const drawPositions = held.filter((position): position is number => !!position && position !== released);
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
      ...(produced ? [{ op: 'setSideExitProvenance' as const, matchUpId }] : []),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ];
  });
}

function abstainReason(args: {
  drawDefinition?: DrawDefinition;
  request: OutcomeRequest;
  view: OutcomeView;
  route?: Route;
  write?: MatchUpWrite;
  direction?: DirectionPlan;
}): AbstainReason | undefined {
  const { request, view, write, direction } = args;
  if (view.isTeam || view.line || view.matchUpTieId || view.existing.collectionId) return 'team';
  if (writeLegacyEnabled()) return 'write-mode';
  if (!view.draw.storesEdges) return 'edges';
  if (request.carries?.schedule) return 'schedule';
  if (request.carries?.notes) return 'notes';
  if (request.matchUpStatusCodes?.length) return 'status-codes';
  if (view.draw.perMatchUpCompetition && (request.winningSide || write?.winningSide)) return 'competition';
  const exit = exitReason(args);
  if (exit) return exit;
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
  // a winner cleared or changed in a WIN_RATIO structure: v1 reports the playoff structures it reaches, which v2 does not
  // read
  if ((removing || changing) && view.draw.winRatio) return 'link';
  if (removing) {
    const removal = removalReason(view, direction);
    if (removal) return removal;
  } else if (view.existing.winningSide && !sameWinner && !reentered && !changing && !swapping) return 'winner';
  const shape = shapeReason(args, { sameWinner, reentered, changing, swapping });
  if (shape) return shape;
  if (view.existing.hasSideExitProvenance || view.existing.carriedExit) return 'provenance';
  // a round robin group's tally is planned (`setParticipantResults`, S3); an ad hoc, lucky or TEAM tally is not yet
  if (view.draw.tallied && !view.group) return 'tallied';
  return undefined;
}

/** the reason the call's own shape is not planned, by the shape `abstainReason` found it to be */
function shapeReason(
  args: Parameters<typeof abstainReason>[0],
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

/** the stored winner entered again on the winner's route (S4) */
function reentersWinner(view: OutcomeView, route: Route | undefined, write?: MatchUpWrite): boolean {
  return route === 'winner' && !!write?.winningSide && write.winningSide === view.existing.winningSide;
}

/** a stored winner replaced by the other side on the winner's route (S4) */
function changesWinner(view: OutcomeView, route: Route | undefined, write?: MatchUpWrite): boolean {
  return (
    route === 'winner' &&
    !!write?.winningSide &&
    !!view.existing.winningSide &&
    write.winningSide !== view.existing.winningSide
  );
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
  return reentersWinner(view, route, write) || route === 'swap' ? undefined : direction;
}

/** a cleared result taking back a winner it stored (S4) */
function removesDirection(view: OutcomeView, route: Route | undefined, write: MatchUpWrite): boolean {
  return route === REMOVE_DIRECTED && !!view.existing.winningSide && !write.winningSide;
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

/** a seat filled with a propagated BYE and its matchUp a BYE (`assignDrawPositionBye`), the matchUp stamped */
function seatBye(seat: { structureId: string; drawPosition: number; matchUpId: string }): OutcomeOp[] {
  return [
    { op: 'assignBye', structureId: seat.structureId, drawPosition: seat.drawPosition, byeFromPropagation: true },
    { op: 'setMatchUpBye', matchUpId: seat.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: seat.matchUpId },
  ];
}

/** each structure other than the call's whose assignments the ops change, stamped once (F2 (i)) */
function structureStamps(ops: OutcomeOp[], structureId: string): OutcomeOp[] {
  const seatedIn = ops.flatMap((op) =>
    (op.op === 'assignPosition' || op.op === 'assignBye' || op.op === 'withdrawBye') && op.structureId !== structureId
      ? [op.structureId]
      : [],
  );
  return [...new Set(seatedIn)].map((id) => ({ op: 'stampUpdatedAt', entity: 'structure', id }));
}

/**
 * The ops of a complete plan for `request`, or the reason there is none. `write` and `direction` are what `planWrite`
 * and `planDirection` already decided; this re-states a complete one as ops and adds the stamps (F2 (i): the matchUp,
 * its structure and the draw, each once).
 */
export function planOutcome(args: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  direction?: DirectionPlan;
  request: OutcomeRequest;
  write?: MatchUpWrite;
  view: OutcomeView;
  route?: Route;
}): OutcomePlan {
  const reason = abstainReason(args);
  if (reason) return { abstain: reason };
  const { request, view, drawDefinition, tournamentRecord } = args;
  // a plan is folded into the record; a draw held outside it, or a call with no captured instant, cannot be compared
  const held = tournamentRecord?.events?.some((event) =>
    event.drawDefinitions?.includes(drawDefinition as DrawDefinition),
  );
  if (!drawDefinition || !held) return { abstain: 'no-record' };
  if (getCapturedClock() === undefined) return { abstain: 'clock' };
  const write = args.write as MatchUpWrite;
  const matchUpId = request.matchUpId as string;
  const structureId = view.targets.source.structureId;
  if (!structureId) return { abstain: 'route' };

  // the score as v1's write stores it (`applyScoreAndStatus`): blanked, the blank; given, the object as given (point
  // scores and all); neither, the matchUp's own is left where it is
  const blanked = write.scoreStringSide1 === '' && write.scoreStringSide2 === '' && !write.sets;
  const score: Score | undefined = blanked
    ? { scoreStringSide1: '', scoreStringSide2: '' }
    : (request.score as Score | undefined);
  // a cleared double exit's unwind, announced before the clear's own write, as v1 makes it first (S6)
  const unwound = unwoundOps(view, request, args.route, drawDefinition);
  const ops: OutcomeOp[] = [
    ...swapOps(view, args.route),
    ...replacedLoserOps(view, args.route, write, request.matchUpStatus),
    ...unwound,
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
      ...(score ? { score } : {}),
      ...(request.matchUpFormat ? { matchUpFormat: request.matchUpFormat } : {}),
      ...(write.winningSide ? { winningSide: write.winningSide as 1 | 2 } : {}),
      ...(write.matchUpStatusCodes ? { matchUpStatusCodes: write.matchUpStatusCodes } : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
  // the first direction: the winner's position joins the next matchUp's, which v1 stores ascending
  const placing = placedDirection(view, args.route, write, args.direction);
  const winner = placing?.winner;
  ops.push(
    ...winnerPlacementOps(view, args.route, write, winner),
    ...removedOps(view, args.route, write, request.matchUpStatus),
  );
  // a plain loser arrival: the loser on the seat the link feeds. The matchUp they land in is not stamped: its stored
  // object does not change (the write is on the structure's assignments), so it is not a touched entity (F2 (i), and v1).
  // The structure whose assignments change is stamped below (v1's `modifyPositionAssignmentsNotice`).
  const loser = placing?.loser;
  const { loserStructureId, loserTargetDrawPosition, loserMatchUpId } = view.targets;
  const arrival: OutcomeOp[] =
    loser?.arrives && loserStructureId && loserTargetDrawPosition
      ? [
          {
            op: 'assignPosition',
            structureId: loserStructureId,
            drawPosition: loserTargetDrawPosition,
            participantId: loser.participantId,
          },
        ]
      : [];
  // a participant placed opposite a BYE goes on through it, a loser fed onto the seat or a winner into a BYE-held
  // target: their position joins the next matchUp, which is stamped
  const loserThrough =
    loser?.arrives && view.targets.loserTargetSeat?.opponentBye ? view.targets.loserThroughBye : undefined;
  const winnerThrough =
    winner && view.targets.winner?.hasBye ? view.targets.winnerThroughBye?.[write.winningSide as 1 | 2] : undefined;
  const throughBye = [loserThrough, winnerThrough].flatMap((through): OutcomeOp[] =>
    through
      ? [
          { op: 'setMatchUpDrawPositions', matchUpId: through.matchUpId, drawPositions: through.drawPositions },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: through.matchUpId },
        ]
      : [],
  );
  // a kept-out loser's BYE on the seat the link feeds (v1's `directLoser`), unless a reservation placed it already
  const keptOut = loser?.bye && !loser.arrives && !view.targets.loserTargetSeat?.bye ? loser.bye : undefined;
  const keptOutBye = keptOut && loserMatchUpId ? seatBye({ ...keptOut, matchUpId: loserMatchUpId }) : [];
  // the FIRST_MATCHUP reservation the winner's arrival makes (v1's `propagateConsolationBye`)
  const reservation = write.winningSide ? view.targets.reservations?.[write.winningSide as 1 | 2] : undefined;
  const reserved = reservation?.kind === 'reserve' ? seatBye(reservation) : [];
  // a carried exit's write on the matchUp the loser lands in (S5)
  // (a carry past a BYE is recorded beside it before the carrier is placed on beyond, as v1 announces the two)
  const carried = loser?.arrives ? carriedOps(view, request, write, loser) : { relay: [], landing: [] };
  // two exits meeting where the loser lands (RULE 4), and what the double exit they make produces (S5)
  const converging = loser?.converged ? convergedOps(view, request, write, loser) : [];
  // a double exit's loser seats, BYEs (S5)
  const doubleExitSeated = args.route === DOUBLE_EXIT ? doubleExitSeatOps(view, request, args.direction) : [];
  const producedExit = args.route === DOUBLE_EXIT ? producedExitOps(view, request, write, args.direction) : [];
  const seated = [...arrival, ...keptOutBye, ...reserved];
  const tally = view.group
    ? groupTally(view.group, { matchUpId, matchUpWrite: write, score, matchUpFormat: request.matchUpFormat })
    : [];
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
    ...carried.landing,
    ...converging,
    ...doubleExitSeated,
    ...producedExit,
    ...structureStamps([...unwound, ...seated, ...carried.landing, ...doubleExitSeated, ...producedExit], structureId),
    ...tally,
    // the top-level structure: a round robin group's container, as v1 stamps it
    { op: 'stampUpdatedAt', entity: 'structure', id: view.group?.containerStructureId ?? structureId },
    ...tallyStamps,
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  );
  return { ops, shape: args.route === 'winner' ? 'direction' : 'local' };
}

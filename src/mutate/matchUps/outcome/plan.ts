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
import type { CarryLevel, DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView, Route } from './types';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from './ops';
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
const LOCAL_ROUTES = new Set<Route>(['clear', 'clear-score', REMOVE_DIRECTED, 'only-score']);
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
  if (!write?.winningSide || write.matchUpStatus !== COMPLETED) return 'route';
  // a stored status that changes is refreshed on the arrivals the first entry sent on (v1's `refreshArrivals`)
  if (view.existing.matchUpStatus !== COMPLETED) return 'route';
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
 * is v1's (S4).
 */
function changedWinnerReason(
  view: OutcomeView,
  write?: MatchUpWrite,
  direction?: DirectionPlan,
): AbstainReason | undefined {
  const { targets, existing } = view;
  if (!write?.winningSide || write.matchUpStatus !== COMPLETED || existing.matchUpStatus !== COMPLETED) return 'route';
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
  const loserReason = plainLoserReason(view, direction);
  if (loserReason) return loserReason;
  if (direction.decider || direction.produced || direction.converged) return 'route';
  if (final) return undefined;
  const target = targets.winner;
  if (!target || target.structureId !== targets.source.structureId) return 'link';
  if (reservationReason(view, write.winningSide as 1 | 2)) return 'cascade';
  // a target holding a BYE sends the winner on past it: planned when where they go is clean (`winnerThroughBye`)
  const through = target.hasBye ? targets.winnerThroughBye?.[write.winningSide as 1 | 2] : undefined;
  if ((target.hasBye && !through) || target.carriesExit || target.carriedStatuses.length || target.holdsResult)
    return 'cascade';
  // a target generated with no status (LUCKY_DRAW, adaptive) is written TO_BE_PLAYED by v1 as the winner arrives
  if (target.matchUpStatus !== TO_BE_PLAYED && !through) return 'route';
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
 * landing and crosses its loser link, and the exit lands again by RULE 2 or 3. Planned where every level is clean, as
 * the first must be: a free seat with no BYE opposite, behind no link condition, in a matchUp to be played holding no
 * result, exit, codes or provenance, until a landing links nothing on. Undefined otherwise, and where the walk reached
 * v1's bound with a level to go (F9: v1 refuses there; v2 abstains, so it never plans the bound).
 */
function deeperLandings(view: OutcomeView, first: CarriedLanding): DeeperLanding[] | undefined {
  if (!first.carriesOn) return [];
  const chain = view.targets.carryLevels;
  if (!chain || chain.bounded || chain.levels[0]?.fromMatchUpId !== first.matchUpId) return undefined;
  const deeper: DeeperLanding[] = [];
  for (const level of chain.levels) {
    if (level.linkCondition || !level.seat?.free || level.seat.opponentBye) return undefined;
    if (level.matchUpStatus !== TO_BE_PLAYED || level.hasResult || level.carriesExit) return undefined;
    if (!level.record || level.record.provenance || level.record.matchUpStatusCodes?.length) return undefined;
    const landing = landingAt(view, level.matchUpId, level.drawPosition);
    if (!landing || (landing.opponentHeld && !landing.onward)) return undefined;
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
  // each further level: the carrier placed across the landing's loser link, the exit carried from the landing they lost
  const levels = deeper.flatMap(({ level, landing: at }): OutcomeOp[] => [
    {
      op: 'assignPosition',
      structureId: level.structureId,
      drawPosition: level.drawPosition,
      participantId: loser.participantId,
    },
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
  const produced = direction?.produced;
  const target = targets.winner;
  if (!produced || direction?.converged || direction?.decider || !target) return 'exit';
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
 * this one is still to be played, or AWARDED where that feeder delivered its winner there (a played result or a single
 * exit), who goes on into a clean next matchUp. A seat holding a position nobody has reached is not planned.
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
  if (!paired?.winningSide || !DELIVERED_FEEDS.has(paired.matchUpStatus)) return 'exit';
  if (!awarded.drawPosition || !onwardFrom(view, entry, awarded.drawPosition)) return 'exit';
  return undefined;
}

type DoubleExitSeats = {
  /** this matchUp's loser seat across its link, the matchUp a BYE there makes a BYE, and the position it sends on */
  own?: {
    structureId: string;
    drawPosition: number;
    matchUpId: string;
    onward: { matchUpId: string; drawPositions: number[] };
  };
  /** the seat the next matchUp's loser link feeds, which the pending exit there leaves nobody to fill */
  unfillable?: { structureId: string; drawPosition: number; matchUpId: string };
};

/**
 * The BYEs a double exit with loser links places (`doubleExitAdvancement`, `propagateUnfillableLoserBye`), as v1 places
 * them in FEED_IN_CHAMPIONSHIP and CURTIS: nobody loses this matchUp, so the seat its link feeds takes a propagated BYE
 * and that matchUp a BYE, and the position opposite is advanced through it into the next matchUp; nobody will lose
 * the next matchUp either (its produced exit is pending, or awarded to the winner standing there), so the seat ITS link
 * feeds takes a BYE too. Planned only where each is clean and alone: links with no condition, free seats with no BYE
 * beside them (a participant opposite the first goes on through its BYE as an empty position does), matchUps to be
 * played holding no result, exit, codes or provenance, the advance into a clean matchUp with room, and the unfillable
 * seat's matchUp holding no other position (so nothing is advanced from it) and apart from the first's.
 */
function doubleExitSeats(view: OutcomeView, entry: HydratedMatchUp): DoubleExitSeats | undefined {
  const { targets } = view;
  // under `doubleExitPropagateBye: false` the loser seat shows the produced exit, not a BYE: v1's
  if (!view.draw.doubleExitPropagatesBye) return undefined;
  const seats: DoubleExitSeats = {};
  if (targets.loserLink || targets.loserMatchUpId) {
    const seat = targets.loserTargetSeat;
    const loserMatchUp = indexed(view, targets.loserMatchUpId);
    const { loserStructureId, loserTargetDrawPosition, loserMatchUpRecord } = targets;
    if (targets.loserLink?.linkCondition || !loserMatchUp || !loserStructureId || !loserTargetDrawPosition)
      return undefined;
    // a participant opposite goes on through the BYE as an empty position would; a BYE opposite makes a double BYE
    if (!seat?.free || seat.opponentBye) return undefined;
    if (targets.loserMatchUpStatus !== TO_BE_PLAYED || targets.loserMatchUpHasResult || targets.loserMatchUpCarriesExit)
      return undefined;
    if (!loserMatchUpRecord || loserMatchUpRecord.provenance || loserMatchUpRecord.matchUpStatusCodes?.length)
      return undefined;
    const opposite = (targets.loserMatchUpDrawPositions ?? []).filter(
      (position) => position !== loserTargetDrawPosition,
    );
    if (opposite.length !== 1) return undefined;
    const onward = onwardFrom(view, loserMatchUp, opposite[0]);
    if (!onward) return undefined;
    seats.own = {
      structureId: loserStructureId,
      drawPosition: loserTargetDrawPosition,
      matchUpId: loserMatchUp.matchUpId,
      onward,
    };
  }
  if (entry.loserMatchUpId) {
    const unfillable = targets.winnerLoserSeat;
    if (!unfillable || unfillable.linkCondition || unfillable.matchUpId !== entry.loserMatchUpId) return undefined;
    if (!unfillable.seat?.free || unfillable.seat.opponentBye || unfillable.seat.opponentHeld) return undefined;
    if (unfillable.matchUpStatus !== TO_BE_PLAYED || unfillable.hasResult) return undefined;
    if (unfillable.drawPositions.some((position) => position !== unfillable.drawPosition)) return undefined;
    if (unfillable.matchUpId === seats.own?.matchUpId || unfillable.matchUpId === seats.own?.onward.matchUpId)
      return undefined;
    const record = indexed(view, unfillable.matchUpId);
    if (!record || record.matchUpStatusCodes?.length || Object.keys(record.sideExitProvenance ?? {}).length)
      return undefined;
    seats.unfillable = {
      structureId: unfillable.structureId,
      drawPosition: unfillable.drawPosition,
      matchUpId: unfillable.matchUpId,
    };
  }
  return seats;
}

/** the double exit's BYEs and the advance through the first, in the order v1 announces them */
function doubleExitSeatOps(view: OutcomeView, direction?: DirectionPlan): OutcomeOp[] {
  const entry = direction?.produced ? indexed(view, direction.produced.matchUpId) : undefined;
  const seats = entry ? doubleExitSeats(view, entry) : undefined;
  if (!seats) return [];
  const { own, unfillable } = seats;
  return [
    ...(own
      ? [
          ...seatBye(own),
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: own.onward.matchUpId,
            drawPositions: own.onward.drawPositions,
            advancesThroughBye: true as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: own.onward.matchUpId },
        ]
      : []),
    ...(unfillable
      ? [
          {
            op: 'assignBye' as const,
            structureId: unfillable.structureId,
            drawPosition: unfillable.drawPosition,
            byeFromPropagation: true as const,
          },
          { op: 'setMatchUpBye' as const, matchUpId: unfillable.matchUpId, announcesEvent: false as const },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: unfillable.matchUpId },
        ]
      : []),
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
function producedTargetReason(view: OutcomeView, source: HydratedMatchUp, target: ProducedTarget): boolean {
  const { entry } = target;
  if (entry.matchUpStatus !== TO_BE_PLAYED || entry.winningSide || entry.score?.scoreStringSide1) return false;
  if (entry.matchUpStatusCodes?.length || Object.keys(entry.sideExitProvenance ?? {}).length) return false;
  if (entry.loserMatchUpId || entry.sides?.some((side) => side.bye)) return false;
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
function abstainReason(args: {
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
    (op.op === 'assignPosition' || op.op === 'assignBye') && op.structureId !== structureId ? [op.structureId] : [],
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
  const ops: OutcomeOp[] = [
    ...swapOps(view, args.route),
    ...replacedLoserOps(view, args.route, write, request.matchUpStatus),
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
  const doubleExitSeated = args.route === DOUBLE_EXIT ? doubleExitSeatOps(view, args.direction) : [];
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
    ...(args.route === DOUBLE_EXIT ? producedOps(view, request, write, args.direction) : []),
    ...structureStamps([...seated, ...carried.landing, ...doubleExitSeated], structureId),
    ...tally,
    // the top-level structure: a round robin group's container, as v1 stamps it
    { op: 'stampUpdatedAt', entity: 'structure', id: view.group?.containerStructureId ?? structureId },
    ...tallyStamps,
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  );
  return { ops, shape: args.route === 'winner' ? 'direction' : 'local' };
}

import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { getCapturedClock, writeLegacyEnabled } from '@Global/state/globalState';
import { ensuredDualSides } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { annotateScoreSets } from '@Query/matchUps/addMatchUpContext';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { validMatchUps } from '@Validators/validMatchUp';
import { withFinishingOrder } from './finishingOrderOps';
import {
  buildCarriedExitProvenance,
  buildSideExitProvenance,
  collapseDoubleExitStatus,
  carriedExitStatus,
  deriveStatusCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { FIRST_MATCHUP, LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import { LINEUPS } from '@Constants/extensionConstants';
import type { LineUp } from '@Types/factoryTypes';
import type { OutcomeOp } from './ops';
import type {
  DrawDefinition,
  MatchUpSchedule,
  MatchUpStatusUnion,
  Score,
  SideExitProvenance,
  Structure,
  TallyResult,
  Tournament,
} from '@Types/tournamentTypes';
import type {
  ByePassage,
  ByeWalk,
  CarryLevel,
  DirectionPlan,
  MatchUpWrite,
  OutcomeRequest,
  OutcomeView,
  Route,
  ThroughBye,
  WinnerLoserSeat,
  WithdrawnCarry,
} from './types';
import {
  AWAITING_RESULT,
  BYE,
  COMPLETED,
  DEAD_RUBBER,
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
const LINE_SCORE: Route = 'line-score';
const DOUBLE_EXIT: Route = 'double-exit';
const CLEAR_SCORE: Route = 'clear-score';
const APPLY_VALUES: Route = 'apply-values';
const RESULT_TO_DOUBLE_EXIT: Route = 'completed-to-double-exit';

/**
 * The view of the draw as `ops` leave it, with the direction a route plans on it: the working view (§ 3.2) folded and
 * read again, on the call's one hydration (the structural index re-indexed where the ops touched it). How a plan composes
 * one step on another (S6: a result turned into a double exit plans the double exit on the draw its removal leaves).
 */
/** S7: the dual's own call a deciding line makes, planned on a view of the dual (`decide.ts` `decidedDualCall`) */
export type DualCall = {
  request: OutcomeRequest;
  direction?: DirectionPlan;
  rebuild?: RebuildView;
  write?: MatchUpWrite;
  view: OutcomeView;
  route?: Route;
};

export type RebuildView = (
  ops: OutcomeOp[],
  route: Route,
) => { view: OutcomeView; direction?: DirectionPlan } | undefined;
const LOCAL_ROUTES = new Set<Route>(['clear', CLEAR_SCORE, REMOVE_DIRECTED, 'only-score']);
const LOCAL_STATUSES = new Set<string | undefined>([IN_PROGRESS, SUSPENDED, AWAITING_RESULT, INCOMPLETE, TO_BE_PLAYED]);
const SINGLE_EXITS = new Set<string | undefined>([WALKOVER, DEFAULTED, RETIRED]);
const DIRECTED_STATUSES = new Set<string | undefined>([COMPLETED, ...SINGLE_EXITS]);

/**
 * S6: a double exit asked for again (the `noop` route: the status it already holds, no winner). v1 treats it as
 * satisfied, not repeated (`attemptToSetMatchUpStatus`, `alreadyInRequestedDoubleExit`): it writes, stamps and announces
 * nothing, whatever score the call carries, and returns success. Planned as that: no ops.
 */
function satisfiedDoubleExit(view: OutcomeView, request: OutcomeRequest, route?: Route): boolean {
  const { existing } = view;
  return (
    route === 'noop' &&
    isDoubleExit(existing.matchUpStatus) &&
    request.matchUpStatus === existing.matchUpStatus &&
    !existing.winningSide &&
    !request.winningSide
  );
}

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
  if ((target.hasBye && !through) || target.holdsResult) return 'cascade';
  if (!unwound && (target.carriesExit || target.carriedStatuses.length)) return 'cascade';
  // a target generated with no status (LUCKY_DRAW, adaptive) is written TO_BE_PLAYED by v1 as the winner arrives
  if (target.matchUpStatus !== TO_BE_PLAYED && !through && !unwound) return 'route';
  if (!targets.sideDrawPositions[write.winningSide as 1 | 2]) return 'route';
  return undefined;
}

/**
 * A dual's projected lines with the call's line holding its score as a round robin group's tally reads it (S7): as
 * written, then annotated as hydration annotates it under the line's format (`annotateScoreSets`: a tiebreak-only set
 * read as 1-0), since v1 tallies the group's hydrated duals
 */
function writtenLine(
  tieMatchUps: HydratedMatchUp['tieMatchUps'],
  matchUpId: string,
  score?: Score,
): HydratedMatchUp['tieMatchUps'] {
  return tieMatchUps?.map((tieMatchUp) => {
    if (tieMatchUp.matchUpId !== matchUpId) return tieMatchUp;
    const read = { ...tieMatchUp, score: score && structuredClone(score) };
    if (read.score?.sets?.length && read.matchUpFormat) annotateScoreSets(read, read.matchUpFormat);
    return read;
  });
}

/**
 * A round robin group's tally after the call, as v1's `updateAssignmentParticipantResults` computes it: the group's
 * matchUps with the call's result in place of the target's, tallied under the group's format and tally policy. Its
 * participant results are written by `writeAssignmentResults`, v1's writer, through the reducer. Undefined where v1 would
 * refuse the tally (a matchUp it cannot read), so the call abstains rather than plan what v1 refuses.
 */
function groupTally(
  group: NonNullable<OutcomeView['group']>,
  call: {
    matchUpId: string;
    matchUpWrite: MatchUpWrite;
    score?: Score;
    matchUpFormat?: string;
    tieMatchUps?: HydratedMatchUp['tieMatchUps'];
  },
): OutcomeOp[] | undefined {
  const matchUps = group.matchUps.map((matchUp) =>
    matchUp.matchUpId === call.matchUpId
      ? {
          ...matchUp,
          matchUpStatus: call.matchUpWrite.matchUpStatus as MatchUpStatusUnion,
          winningSide: call.matchUpWrite.winningSide as 1 | 2 | undefined,
          score: call.score ?? matchUp.score,
          ...(call.matchUpFormat ? { matchUpFormat: call.matchUpFormat } : {}),
          ...(call.tieMatchUps ? { tieMatchUps: call.tieMatchUps } : {}),
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
  if (satisfiedDoubleExit(view, request, route)) return undefined;
  if (route === 'winner' && isDoubleExit(existing.matchUpStatus)) return givenWinnerReason(args);
  if (route === CLEAR_SCORE && isDoubleExit(existing.matchUpStatus))
    return write?.matchUpStatus === TO_BE_PLAYED &&
      !direction &&
      unwoundPath(view, request.matchUpId, args.drawDefinition)
      ? undefined
      : 'exit';
  if (clearedSingleExit(view, route, write)) return undefined;
  if (correctedSingleExit(args)) return undefined;
  if (route === APPLY_VALUES || route === 'swap') return relabelledExit(args) ? undefined : 'exit';
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
  // a convergence the unwind dissolves: the winner then lands beside the re-derived pending exit and is awarded it, v1's
  if (!levels || levels.some(({ released, rederived }) => released || rederived)) return 'exit';
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
  // under `doubleExitPropagateBye: false` the seat held no BYE: the unwind wrote its matchUp back to be played instead
  // (`unwoundBranch`), and the loser arrives there as plainly (S6 tail)
  const branched =
    !view.draw.doubleExitPropagatesBye &&
    own.seatOps.some((op) => op.op === 'setMatchUpResult' && op.matchUpId === targets.loserMatchUpId);
  if (!branched && (!freed || !targets.loserTargetSeat?.bye)) return 'exit';
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
function relabelledExit(args: Parameters<typeof exitReason>[0]): boolean {
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
  // a TEAM dual's passage: v1 ensures the dual's sides on the BYE matchUps it passes (the line-up carry, S7's TEAM track)
  if (passage && view.isTeam) return undefined;
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
    passes: 1,
    sideNumber,
  };
  if (!opponent?.participantId || opponent.bye || !opponent.drawPosition) return landing;
  const standing = view.targets.loserMatchUpCarryHeld && entry.matchUpId === view.targets.loserMatchUpId;
  const onward = onwardFrom(view, entry, opponent.drawPosition, { standing });
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
  { standing, heldNext }: { standing?: boolean; heldNext?: { matchUpId: string; drawPositions: number[] } } = {},
): { matchUpId: string; drawPositions: number[] } | undefined {
  const next = indexed(view, entry.winnerMatchUpId);
  // the next matchUp as an earlier write of this call leaves it (another BYE's chain sent a position there)
  const positions = heldNext && heldNext.matchUpId === next?.matchUpId ? heldNext.drawPositions : next?.drawPositions;
  const held = (positions ?? []).filter((position): position is number => !!position);
  // a held carry rewritten in place (S6 tail): the awardee already stands onward, and v1 re-announces them there
  const already = !!standing && held.includes(drawPosition) && held.length <= 2;
  const clean =
    !!next &&
    next.structureId === entry.structureId &&
    next.matchUpStatus === TO_BE_PLAYED &&
    !next.winningSide &&
    !next.score?.scoreStringSide1 &&
    !Object.keys(next.sideExitProvenance ?? {}).length &&
    !next.sides?.some((side) => side.bye) &&
    (already || (held.length < 2 && !held.includes(drawPosition)));
  if (!next || !clean) return undefined;
  return { matchUpId: next.matchUpId, drawPositions: already ? held : [...held, drawPosition].sort((a, b) => a - b) };
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
  const provenanceOps = (matchUpId: string, provenance?: ReturnType<typeof carried>): OutcomeOp[] =>
    provenance ? [{ op: 'mergeSideExitProvenance', matchUpId, provenance }] : [];
  const source = { matchUpId: request.matchUpId, status: write.matchUpStatus as MatchUpStatusUnion };
  // RULE 1: each BYE matchUp passed stays a BYE and records the carry beside its BYE, announced by itself
  const relayed = (at: CarriedLanding, sourceMatchUpId?: string, previousMatchUpStatus?: MatchUpStatusUnion) =>
    (at.relays ?? []).flatMap(({ matchUpId, sideNumber }): OutcomeOp[] => [
      ...provenanceOps(matchUpId, carried(sideNumber, sourceMatchUpId, previousMatchUpStatus)),
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
  // a matchUp in progress takes the double exit as one to be played does: v1 writes over its score (a dual's tally),
  // leaving a dual's played lines as they stand (S7)
  const open = existing.matchUpStatus === TO_BE_PLAYED || existing.matchUpStatus === IN_PROGRESS;
  if (!open || existing.winningSide || write.matchUpStatusCodes?.length) return 'exit';
  if (targets.byeTarget) return 'exit';
  // a round robin group's matchUp sends nobody on (`doubleExitAdvancement` returns at once in a container): its result
  // and the group's tally are all there is
  if (view.group && !view.group.adHoc && !direction && !targets.winnerMatchUpId && !targets.loserMatchUpId)
    return undefined;
  // the exit it produces meets one standing there: the two converge, and that double exit produces on
  if (direction?.converged) return producedConvergedReason(view, request, write, direction) ? undefined : 'exit';
  // a structure's final (or the one matchUp of a one-round structure) produces nothing (`doubleExitAdvancement` finds no
  // winner target): the own loser seat's BYE where a link feeds one, and the call's own write (S6 tail, family 8). A
  // final whose winner link leads on (DOUBLE_ELIMINATION's Decider) has a winner target across it: the decider's, v1's
  if (!targets.winnerMatchUpId && !direction?.decider) return doubleExitSeats(view) ? undefined : 'exit';
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
  /** a double BYE at the first seat: the matchUp it makes a BYE, and where that one sends its other position */
  advanced?: { matchUpId: string; next?: { matchUpId: string; drawPositions: number[] } };
  /** the position opposite the first seat sent on through a BYE already standing: the matchUp beyond it, and what it holds */
  passed?: { matchUpId: string; drawPositions: number[] };
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
  heldOnward?: { matchUpId: string; drawPositions: number[] },
): ByeChain | undefined {
  const planned: ByeChain = { assigns: [], writes: [], matchUpIds: [] };
  let seat = first;
  let beside = !!doubled;
  for (let index = 0; ; index += 1) {
    // the first seat's matchUp as an earlier write of this call leaves it (a position advanced into it), else as found;
    // deeper seats are placed with no event
    const step = byeStep(view, seat, {
      held: index === 0 ? heldFirst : undefined,
      heldOnward: index === 0 ? heldOnward : undefined,
      namesEvent: index === 0 && announced,
      besideBye: beside,
    });
    if (!step) return undefined;
    planned.assigns.unshift(step.assign);
    planned.writes.push(...step.writes);
    planned.matchUpIds.push(...step.matchUpIds);
    if (index === 0 && step.onward) planned.onward = step.onward;
    if (index === 0 && step.advanced) planned.advanced = step.advanced;
    if (index === 0 && step.passed) planned.passed = step.passed;
    if (!step.entry.loserMatchUpId) return planned;
    const level = chain?.levels[index];
    if (!step.opposed || !chain || chain.bounded || level?.fromMatchUpId !== step.entry.matchUpId) return undefined;
    // the seat beyond holds a BYE already: v1 places nothing there, and the chain ends (S6 tail, the BYE chain)
    if (level.seat?.bye) return planned;
    const clean = cleanByeLevel(view, level);
    if (!clean) return undefined;
    beside = clean === 'doubled';
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
  {
    held,
    heldOnward,
    namesEvent,
    besideBye,
  }: {
    held?: number[];
    heldOnward?: { matchUpId: string; drawPositions: number[] };
    namesEvent: boolean;
    besideBye: boolean;
  },
) {
  const entry = indexed(view, seat.matchUpId);
  const opposite = (held ?? entry?.drawPositions ?? []).filter(
    (position): position is number => !!position && position !== seat.drawPosition,
  );
  if (!entry || opposite.length > 1) return undefined;
  const sends = !!opposite.length && !!entry.winnerMatchUpId && !besideBye;
  const direct = sends ? onwardFrom(view, entry, opposite[0], { heldNext: heldOnward }) : undefined;
  // a next matchUp a BYE already: the position goes into it and through it; no `onward` is named for it, so a later
  // chain touching either matchUp is refused as an overlap
  const passed = sends && !direct ? throughHeldBye(view, entry, opposite[0]) : undefined;
  const onward = direct;
  const quiet = namesEvent ? {} : { announcesEvent: false as const };
  const byeOnward = besideBye ? byeAdvanced(view, entry, seat.drawPosition, quiet, heldOnward) : undefined;
  if ((sends && !onward && !passed) || (besideBye && !byeOnward)) return undefined;
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
    advanced: byeOnward?.advanced,
    passed: passed?.[passed.length - 1],
    opposed: !!opposite.length,
    writes: [...bye, ...(passed ?? (onward ? [onward] : [])).flatMap(throughByeOps), ...(byeOnward?.ops ?? [])],
    matchUpIds: [
      seat.matchUpId,
      ...(passed ?? (onward ? [onward] : [])).map(({ matchUpId }) => matchUpId),
      ...(byeOnward?.matchUpIds ?? []),
    ],
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
  quiet: { announcesEvent?: false },
  heldOnward?: { matchUpId: string; drawPositions: number[] },
): { ops: OutcomeOp[]; matchUpIds: string[]; advanced: NonNullable<ByeChain['advanced']> } | undefined {
  // a final: the BYE goes nowhere; v1 writes the matchUp, a BYE already, as a BYE again
  if (!entry.winnerMatchUpId)
    return {
      ops: [
        { op: 'setMatchUpBye', matchUpId: entry.matchUpId, ...quiet },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
      ],
      matchUpIds: [],
      advanced: { matchUpId: entry.matchUpId },
    };
  const onward = indexed(view, entry.winnerMatchUpId);
  // the next matchUp as an earlier write of this call leaves it (the other BYE's chain sent the position there)
  const positions = heldOnward?.matchUpId === onward?.matchUpId ? heldOnward?.drawPositions : onward?.drawPositions;
  const held = (positions ?? []).filter((position): position is number => !!position);
  const others = held.filter((position) => position !== seatPosition);
  if (!onward || onward.structureId !== entry.structureId || onward.loserMatchUpId) return undefined;
  // a BYE the position passed through (a feed round's fed BYE included, S6 tail): left as it stands, the BYE going on
  // where the position stands
  if (onward.matchUpStatus === BYE && byeOpposite(onward, seatPosition))
    return byeAdvanced(view, onward, seatPosition, quiet);
  if (onward.matchUpStatus !== TO_BE_PLAYED || onward.winningSide || onward.score?.scoreStringSide1) return undefined;
  if (Object.keys(onward.sideExitProvenance ?? {}).length || onward.sides?.some((side) => side.bye)) return undefined;
  if (!held.includes(seatPosition) || others.length > 1) return undefined;
  const bye: OutcomeOp[] = [
    { op: 'setMatchUpBye', matchUpId: onward.matchUpId, ...quiet },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: onward.matchUpId },
  ];
  const advanced = { matchUpId: onward.matchUpId };
  // nothing beside it, or the structure's last round: the position beside it goes nowhere (S6 tail, the BYE chain)
  if (!others.length || !onward.winnerMatchUpId) return { ops: bye, matchUpIds: [onward.matchUpId], advanced };
  const next = onwardFrom(view, onward, others[0]);
  if (!next) return undefined;
  return {
    ops: [...bye, ...throughByeOps(next)],
    matchUpIds: [onward.matchUpId, next.matchUpId],
    advanced: { ...advanced, next },
  };
}

/**
 * The next matchUp a BYE already, its other side the BYE alone: the position goes into it and on through it, into a
 * clean matchUp after it. Undefined otherwise
 */
function throughHeldBye(
  view: OutcomeView,
  entry: HydratedMatchUp,
  drawPosition: number,
): { matchUpId: string; drawPositions: number[] }[] | undefined {
  const next = indexed(view, entry.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  if (!next || next.structureId !== entry.structureId || next.matchUpStatus !== BYE || next.loserMatchUpId)
    return undefined;
  if (held.length !== 1 || held.includes(drawPosition) || !next.sides?.some((side) => side.bye)) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || next.matchUpStatusCodes?.length) return undefined;
  const beyond = onwardFrom(view, next, drawPosition);
  if (!beyond) return undefined;
  const into = { matchUpId: next.matchUpId, drawPositions: [...held, drawPosition].sort((a, b) => a - b) };
  return [into, beyond];
}

/** a BYE matchUp holding the position and a BYE opposite it: a double BYE the position passed through */
function byeOpposite(matchUp: HydratedMatchUp, position: number): boolean {
  const seated = matchUp.sides?.find((side) => side.drawPosition === position);
  const other = matchUp.sides?.find((side) => side.drawPosition && side.drawPosition !== position);
  return !!seated && !seated.bye && !!other?.bye;
}

/**
 * A further level a BYE goes on to: a first-round seat, free, behind no condition, in a clean matchUp. Alone, its matchUp
 * to be played (`clean`); or opposite a BYE, its matchUp a BYE already (`doubled`, a double BYE as `byeAdvanced` plans it)
 */
function cleanByeLevel(view: OutcomeView, level: CarryLevel): 'clean' | 'doubled' | false {
  if (level.linkCondition || !level.seat?.free) return false;
  const doubled = level.seat.opponentBye;
  if (level.seat.opponentHeld && !doubled) return false;
  if (level.matchUpStatus !== (doubled ? BYE : TO_BE_PLAYED) || level.hasResult || level.carriesExit) return false;
  if (!level.record || level.record.provenance || level.record.matchUpStatusCodes?.length) return false;
  if (indexed(view, level.matchUpId)?.roundNumber !== 1) return false;
  return doubled ? 'doubled' : 'clean';
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
function doubleExitSeats(view: OutcomeView, entry?: HydratedMatchUp): DoubleExitSeats | undefined {
  const seats = chainedSeats(view, entry);
  if (seats || !view.draw.doubleExitPropagatesBye) return seats;
  // the chain's shapes refused: the seats as v1's `assignDrawPositionBye` recursion walks them (S6 tail, the BYE chain)
  return walkedSeats(view, entry);
}

/** the seats' BYEs as the view's walk of v1's recursion places them, each written as the chain's own ops are */
function walkedSeats(view: OutcomeView, entry?: HydratedMatchUp): DoubleExitSeats | undefined {
  const { targets } = view;
  const walk = targets.byeWalk;
  const ownSeat = !!targets.loserLink || !!targets.loserMatchUpId;
  if (!walk || (ownSeat && !walk.own) || (entry?.loserMatchUpId && !walk.unfillable)) return undefined;
  return {
    ...(ownSeat && walk.own ? { own: walkChain(walk.own) } : {}),
    ...(entry?.loserMatchUpId && walk.unfillable ? { unfillable: walkChain(walk.unfillable) } : {}),
  };
}

function walkChain(walk: ByeWalk): ByeChain {
  const quiet = (named: boolean) => (named ? {} : { announcesEvent: false as const });
  return {
    assigns: walk.assigns.map(({ structureId, drawPosition, matchUpId, named }) => ({
      op: 'assignBye' as const,
      byeFromPropagation: true as const,
      structureId,
      drawPosition,
      matchUpId,
      ...quiet(named),
    })),
    writes: walk.writes.flatMap((write, index): OutcomeOp[] => {
      if (write.kind === 'advance') return throughByeOps(write);
      // a displaced carrier's landing: the carry withdrawn, the matchUp a BYE, its `scoredTime` taken by the pass that
      // announces it (`withdrawDisplacedCarry`, `setMatchUpStatusBYE`, `reconcileScoredTimes`)
      if (write.kind === 'displaced') {
        const bye = walk.writes[index + 1];
        return [
          { op: 'setSideExitProvenance', matchUpId: write.matchUpId },
          { op: 'setMatchUpBye', matchUpId: write.matchUpId, ...(bye?.kind === 'bye' ? quiet(bye.named) : {}) },
          {
            op: 'setMatchUpResult',
            matchUpId: write.matchUpId,
            matchUpStatus: BYE,
            announcedAs: 'reconcileScoredTimes',
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: write.matchUpId },
        ];
      }
      if (walk.writes[index - 1]?.kind === 'displaced') return [];
      return [
        { op: 'setMatchUpBye', matchUpId: write.matchUpId, ...quiet(write.named) },
        { op: 'stampUpdatedAt', entity: 'matchUp', id: write.matchUpId },
      ];
    }),
    matchUpIds: walk.matchUpIds,
  };
}

/** the seats as the chain's shapes plan them (S5, S6) */
function chainedSeats(view: OutcomeView, entry?: HydratedMatchUp): DoubleExitSeats | undefined {
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
  if (entry?.loserMatchUpId) {
    seats.unfillable = unfillableByeChain(view, entry, seats.own?.onward, seats.own?.advanced, seats.own?.passed);
    if (!seats.unfillable) return undefined;
  }
  // the matchUps both may touch: the unfillable seat's, which the own seat's BYE sent a position into first; or, the own
  // seat's double BYE having made it a BYE, it and the one its position went on into
  const ownSent = [
    seats.own?.onward?.matchUpId,
    seats.own?.advanced?.matchUpId,
    seats.own?.advanced?.next?.matchUpId,
    seats.own?.passed?.matchUpId,
  ];
  // ...or the matchUp the own chain passed a position into, which the unfillable seat's BYE sends its own position into,
  // read as the own chain leaves it (S6 tail, the BYE chain)
  const unfillableFirst = seats.unfillable?.matchUpIds[0];
  const joinedPassed = !!seats.own?.passed && seats.unfillable?.matchUpIds.includes(seats.own.passed.matchUpId);
  const shared = new Set(
    (unfillableFirst && ownSent.includes(unfillableFirst)) || joinedPassed
      ? (seats.unfillable?.matchUpIds ?? []).filter((matchUpId) => ownSent.includes(matchUpId))
      : [],
  );
  const touched = [
    ...(seats.own?.matchUpIds ?? []).filter((matchUpId) => !shared.has(matchUpId)),
    ...(seats.unfillable?.matchUpIds ?? []),
    ...producedLoserMatchUpIds(seats.producedLoser),
    ...(seats.heldLoser ? [seats.heldLoser.byeMatchUpId, seats.heldLoser.onwardMatchUpId] : []),
    ...(entry ? [entry.matchUpId] : []),
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
  ownAdvanced?: ByeChain['advanced'],
  ownPassed?: ByeChain['passed'],
  from: { seat?: WinnerLoserSeat; levels?: { levels: CarryLevel[]; bounded: boolean } } = {
    seat: view.targets.winnerLoserSeat,
    levels: view.targets.byeLevels?.unfillable,
  },
): ByeChain | undefined {
  const unfillable = from.seat;
  // v1 places this BYE behind a FIRST_MATCHUP link too (`advanceByeToLoserMatchUp` asks no condition): nobody loses here
  const conditioned = unfillable?.linkCondition && unfillable.linkCondition !== FIRST_MATCHUP;
  if (!unfillable || conditioned || unfillable.matchUpId !== entry.loserMatchUpId) return undefined;
  // whoever stands opposite goes on through this BYE: a participant there, or a position the own seat's BYE sent into
  // this matchUp first (read as this call leaves it)
  const joined = ownOnward?.matchUpId === unfillable.matchUpId ? ownOnward.drawPositions : undefined;
  if (!unfillable.seat?.free) return undefined;
  // the own seat's double BYE made this matchUp a BYE, the position opposite gone on: a double BYE here too, the seat's
  // position (that one) standing where the own chain sent it (FIRST_MATCH_LOSER_CONSOLATION)
  const byOwn = ownAdvanced?.matchUpId === unfillable.matchUpId;
  // ...or a BYE already stands opposite the seat (another double exit's, a draw's BYE): a double BYE beside it, its
  // position gone on into the next matchUp as the own chain leaves it (S6 tail, the BYE chain)
  const standing = !byOwn && !!unfillable.seat.opponentBye && unfillable.matchUpStatus === BYE;
  if (unfillable.seat.opponentBye && !standing) return undefined;
  const doubled = byOwn || standing;
  if (unfillable.matchUpStatus !== (standing ? BYE : TO_BE_PLAYED) || unfillable.hasResult) return undefined;
  const record = indexed(view, unfillable.matchUpId);
  if (!record || record.matchUpStatusCodes?.length || Object.keys(record.sideExitProvenance ?? {}).length)
    return undefined;
  const { structureId, drawPosition, matchUpId } = unfillable;
  const first = { structureId, drawPosition, matchUpId };
  // the next matchUp as the own chain leaves it: the position it passed through a standing BYE arrived there first
  const heldOnward = byOwn ? ownAdvanced?.next : ownPassed;
  return byeChain(view, first, from.levels, false, doubled, joined, heldOnward);
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
  const clean = levels && level?.fromMatchUpId === loserMatchUp.matchUpId && cleanByeLevel(view, level);
  if (!clean) return undefined;
  const seatAt = { structureId: level.structureId, drawPosition: level.drawPosition, matchUpId: level.matchUpId };
  const doubled = clean === 'doubled';
  const beyond = byeChain(view, seatAt, { levels: deeper, bounded: levels.bounded }, false, doubled);
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
  // a final produces nothing: its own seat's BYE alone (S6 tail, family 8)
  const final = !view.targets.winnerMatchUpId && !direction?.decider;
  const seats = entry || final ? doubleExitSeats(view, entry) : undefined;
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
  const { loserMatchUpId, loserTargetDrawPosition } = targets;
  const convergence = convergenceAt(
    view,
    loserMatchUpId,
    loserTargetDrawPosition,
    carriedStatus(request.matchUpStatus),
    targets.landingWalk,
  );
  return convergence && loser.converged === convergence.matchUpStatus ? undefined : 'exit';
}

/** RULE 4 where a carrier lands: the matchUp, the carrier's side there, the double exit, and where it produces its exit */
type Convergence = {
  matchUpId: string;
  sideNumber: 1 | 2;
  matchUpStatus: MatchUpStatusUnion;
  /** the codes v1 writes there: its projection of the matchUp's provenance before the arrival (`deriveStatusCodes`) */
  matchUpStatusCodes: string[];
  target?: ProducedTarget;
  /** a landing that links its loser on: the BYEs the double exit places, walked as v1's recursion places them (S6 tail) */
  seats?: OutcomeOp[];
};

/**
 * RULE 4 at the matchUp a carrier lands in (`progressExitStatus`), at the first level (S5) or a deeper one (S6 tail): the
 * matchUp holds a single exit (not a retirement) awarded to the carrier's seat, carried in on the other side and on that
 * side alone, with no score value and no loser link of its own. The double exit (`collapseDoubleExitStatus`) produces
 * its exit into a clean next matchUp (`producedTarget`), or, in a structure's last round, nothing
 * (`doubleExitAdvancement` finds no winner target, S6 tail). Undefined otherwise.
 */
function convergenceAt(
  view: OutcomeView,
  matchUpId: string | undefined,
  drawPosition: number | undefined,
  carried: MatchUpStatusUnion,
  walk?: { own?: ByeWalk; unfillable?: ByeWalk },
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
  const target = producedTarget(view, landing, matchUpStatus);
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
function convergenceOps(
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
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus,
      // a side whose standing exit a double exit delivered shows its outcome code (S6 tail)
      ...(matchUpStatusCodes.length ? { matchUpStatusCodes } : {}),
      // a DOUBLE_WALKOVER says nothing was played, so its score is blanked; a DOUBLE_DEFAULT keeps what stood
      ...(matchUpStatus === DOUBLE_WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
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
const unreconciled = (ops: OutcomeOp[]) =>
  ops.filter((op) => !(op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes'));
const reconciled = (ops: OutcomeOp[]) =>
  ops.filter((op) => op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes');

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
  const onwardBye = onwardLinked
    ? unfillableByeChain(view, onward.entry, undefined, undefined, undefined, { seat, levels: seat?.levels })
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
  const { loserMatchUpId, loserTargetDrawPosition } = view.targets;
  const carried = carriedStatus(request.matchUpStatus);
  const convergence =
    loser?.arrives && loser.converged
      ? convergenceAt(view, loserMatchUpId, loserTargetDrawPosition, carried, view.targets.landingWalk)
      : undefined;
  if (!convergence) return [];
  return convergenceOps(view, convergence, carried, request.matchUpId, write.matchUpStatus as MatchUpStatusUnion);
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
  /** the drawPosition the level before sent on into this matchUp (an award, a fed seat's reservation), taken back out */
  released?: number;
  /** a convergence this unwind dissolves, re-derived to the kept origin's pending exit (S6 tail) */
  rederived?: Rederived;
};

/** what a dissolved convergence is written back to: the kept origin's exit, pending, with that origin alone */
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
  target: ProducedTarget,
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
function unwoundPath(
  view: OutcomeView,
  matchUpId?: string,
  drawDefinition?: DrawDefinition,
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
  const produced = source.winnerMatchUpId
    ? unwoundProducedPath(view, source, structureId)
    : { path: [source.matchUpId], rederived: new Map<string, Rederived>(), takenBack: new Map<string, number>() };
  if (!produced) return undefined;
  const { path, rederived, takenBack } = produced;
  // the BYEs this unwind withdraws (its own seat's and its produced exit's), which a seat's onward matchUp is read without:
  // v1 withdraws the deeper one first, so the own seat's onward matchUp has lost the unfillable seat's BYE by the time it
  // is visited (FIRST_MATCH_LOSER_CONSOLATION: both BYEs meet in the consolation's second round). Past a convergence
  // re-derived the unfillable seat is a level further on, and no owned shape reads it there (FMLC's dissolved
  // convergence is v1's): the first two levels suffice
  const reset = 1 + rederived.size;
  const withdrawn = new Set(
    seats.slice(0, 2).flatMap(({ loserSeat }) => (loserSeat?.seat?.byeFromPropagation ? [seatKey(loserSeat)] : [])),
  );
  const levels: UnwoundLevel[] = [];
  // a position the own seat's withdrawal releases out of a matchUp a deeper seat's BYE also sends to (a double BYE's next
  // matchUp, a BYE until then, had sent it on): that matchUp is read without it, and written once, by the release
  const released = new Set<number>();
  for (const [index, id] of path.entries()) {
    const level = seats[index];
    if (level?.matchUpId !== id) return undefined;
    const kept = rederived.get(id);
    // the double exit's own seat and its produced exit's took the BYEs it placed; a seat further on holds nothing yet
    const at = { first: index === 0, placed: index === 0 || index === reset, kept: !!kept };
    const seatOps = level.loserSeat ? unwoundLevelSeatOps(view, level, at, withdrawn, branched, released) : [];
    if (!seatOps) return undefined;
    for (const op of seatOps)
      if (op.op === 'setMatchUpDrawPositions' && op.releasedDrawPosition) released.add(op.releasedDrawPosition);
    const taken = takenBack.get(id);
    levels.push({
      matchUpId: id,
      seatOps,
      ...(taken ? { released: taken } : {}),
      ...(kept ? { rederived: kept } : {}),
    });
  }
  return levels;
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
): { path: string[]; rederived: Map<string, Rederived>; takenBack: Map<string, number> } | undefined {
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
  const walked = unwoundWinnerPath(view, structureId, start);
  if (!walked) return undefined;
  const rederived = new Map(
    converged?.flatMap((level): [string, Rederived][] => (level.rederived ? [[level.matchUpId, level.rederived]] : [])),
  );
  return { path: walked.path, rederived, takenBack: walked.takenBack };
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
function awardedReason(view: OutcomeView, source: HydratedMatchUp, target: ProducedTarget): number | false | undefined {
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
  return awarded.drawPosition;
}

/**
 * v1's `removeDirectedBye` at a seat the unwind visits. Where the double exit placed a BYE (its own loser seat, and the
 * seat its produced exit left unfillable), the BYE is withdrawn, its matchUp is to be played again, and a position the
 * BYE sent on is taken back out of the next matchUp; planned where that BYE went no further (its matchUp links no loser
 * on, and the next matchUp is to be played with no result or provenance, and keeps a position). A seat further on holds nothing yet, and the
 * visit only announces its structure. Undefined for anything else.
 */
const seatKey = ({ structureId, drawPosition }: { structureId?: string; drawPosition?: number }) =>
  `${structureId}:${drawPosition}`;

function unwoundSeatOps(
  view: OutcomeView,
  loserSeat: WinnerLoserSeat,
  placedBye: boolean,
  withdrawn: Set<string> = new Set(),
  released: Set<number> = new Set(),
  cascaded = false,
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
  if (!placedBye) return seat.free && loserSeat.matchUpStatus !== BYE ? [withdraw] : undefined;
  const byeMatchUp = indexed(view, matchUpId);
  if (!seat.bye || !seat.byeFromPropagation || !byeMatchUp) return undefined;
  // an exit carried onto the BYE matchUp's other side stands once the BYE goes: v1 re-derives the matchUp to it (a
  // final's consolation seat beside a carried walkover, S6 tail): v1's
  if (Object.keys(byeMatchUp.sideExitProvenance ?? {}).length) return undefined;
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
    { op: 'clearMatchUpBye', matchUpId, drawPosition },
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
  // a BYE beside the position there that this unwind withdraws is read as withdrawn: the matchUp is then to be played
  const byeStands = (side: HydratedSide) =>
    !!side.bye && !withdrawn.has(seatKey({ structureId: next.structureId, drawPosition: side.drawPosition }));
  const standing = next.sides?.some(byeStands);
  const toBePlayed = next.matchUpStatus === TO_BE_PLAYED || (next.matchUpStatus === BYE && !standing);
  if (!toBePlayed || next.winningSide || !scoreless(next)) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || standing) return undefined;
  const remaining = held.filter((position) => position !== opposite[0]);
  // the position taken back out of the next matchUp: where another stands, as v1's position clear writes it, named for
  // the withdrawn BYE; alone there, the matchUp is left with no position, which v1 releases instead
  // (`releaseAdvancedDrawPosition`, with neither event nor tournament): FIRST_MATCH_LOSER_CONSOLATION's own seat beside an
  // unfilled fed seat, the double BYE its unfillable seat makes behind FIRST_MATCHUP (S6 tail)
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
        releasedDrawPosition: opposite[0],
        announcesContext: false,
      };
  return [...ops, taken, { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId }, ...cascade];
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
  return unwoundSeatOps(view, beyond, true, withdrawn, released, true);
}

/**
 * v1's `removeDirectedBye` at a seat whose BYE stands beside another BYE (the loser seats of two paired double exits, a
 * double BYE: S6 tail, family 4): the BYE withdrawn; the position the double BYE had sent on (the other BYE's) taken back
 * out of the next matchUp, which is to be played again, and what that matchUp, a BYE until then, had sent on in turn
 * released out of the matchUp beyond (`releaseAdvancedDrawPosition`); then, after the call's own write, the standing
 * BYE advances the freed seat into the next matchUp (`reconcileByeAdvancements`, announced `advanceWinner`; deferred by
 * `unwoundOps`). Planned where the next matchUp holds the other BYE's position and one more, nothing else, and the
 * matchUp beyond is to be played holding that one alone. A next matchUp kept a BYE by another standing BYE
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
    {
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
): OutcomeOp[] | undefined {
  const { loserSeat } = level;
  if (!loserSeat) return [];
  const byeHeld = loserSeat.matchUpStatus === BYE;
  // a convergence re-derived still sends its seat nobody: the BYE it placed there stands (v1 withdraws the claim and
  // P39 claims it back, `settleRederivedDoubleExit`), nothing written. Under `doubleExitPropagateBye: false` the seat
  // holds the carries' own convergence, which the first level's branch refuses before this level is read
  if (at.kept) return [];
  if (branched && !byeHeld) return unwoundBranch(view, loserSeat, at.first, withdrawn);
  return unwoundSeatOps(view, loserSeat, at.placed, withdrawn, released);
}

const positionsOf = (matchUp: HydratedMatchUp | undefined) =>
  (matchUp?.drawPositions ?? []).filter((position): position is number => !!position);

/**
 * A matchUp an unwind writes back to be played, holding nothing of a result: to be played (or a BYE whose BYE this unwind
 * withdraws), no score, codes or provenance. Its positions stand: structural, or sent on by what the unwind takes back.
 */
function unwoundClean(matchUp: HydratedMatchUp, withdrawn: Set<string>): boolean {
  const standing = matchUp.sides?.some(
    (side) =>
      !!side.bye && !withdrawn.has(seatKey({ structureId: matchUp.structureId, drawPosition: side.drawPosition })),
  );
  const toBePlayed = matchUp.matchUpStatus === TO_BE_PLAYED || (matchUp.matchUpStatus === BYE && !standing);
  return (
    toBePlayed &&
    scoreless(matchUp) &&
    !matchUp.matchUpStatusCodes?.length &&
    !Object.keys(matchUp.sideExitProvenance ?? {}).length
  );
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
): OutcomeOp[] | undefined {
  const start = indexed(view, loserSeat.matchUpId);
  if (!start) return undefined;
  if (first && !carriesAlone(start, loserSeat.drawPosition)) return undefined;
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
): { ops: OutcomeOp[]; reannounced: OutcomeOp[] } {
  if ((route !== CLEAR_SCORE && route !== 'winner') || !isDoubleExit(view.existing.matchUpStatus))
    return { ops: [], reannounced: [] };
  const levels = unwoundPath(view, request.matchUpId, drawDefinition) ?? [];
  // a seat's advance through a standing BYE is v1's `reconcileByeAdvancements`, after the call's own write
  const deferred = (op: OutcomeOp) => op.op === 'setMatchUpDrawPositions' && !!op.advancesThroughBye;
  const ops = [...levels].reverse().flatMap(({ matchUpId, seatOps: all, released, rederived }, depth): OutcomeOp[] => {
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
  });
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
  return { ops, reannounced };
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
  // to the other side, and one that un-decides it (a dual decided by its own exit, which v1 then projects from its
  // lines alone) is routed `line-score`, v1's above
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

/**
 * S7: the call's notes. v1 writes them inside `modifyMatchUpScore` (`addNotes`), on every matchUp a writer reaches with
 * the call's params: the call's own on the winner, score-only, removal and clear routes (`attemptToModifyScore`,
 * `removeDirectedParticipants`), which v2 plans (`resultOps`). Deferred: a TEAM call (the dual's tally write), a double
 * exit before or after (`doubleExitAdvancement` and `removeDoubleExit` forward the params to the exits they write), and
 * every other route
 */
const NOTED_ROUTES = new Set<Route | undefined>(['winner', 'only-score', REMOVE_DIRECTED, CLEAR_SCORE]);
function notesReason(request: OutcomeRequest, view: OutcomeView, route?: Route): boolean {
  if (!request.carries?.notes) return false;
  // the test fixture `{ testing: true }`, written by `addNotes` as given: not planned (deferred)
  if (typeof request.carries.notes !== 'string') return true;
  if (view.isTeam || view.line || view.matchUpTieId) return true;
  if (isDoubleExit(request.matchUpStatus) || isDoubleExit(view.existing.matchUpStatus)) return true;
  return !NOTED_ROUTES.has(route);
}

function abstainReason(args: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  request: OutcomeRequest;
  view: OutcomeView;
  route?: Route;
  write?: MatchUpWrite;
  direction?: DirectionPlan;
  dual?: DualCall;
  asDual?: true;
}): AbstainReason | undefined {
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
  // a winner cleared or changed in a WIN_RATIO structure: v1 reports the playoff structures it reaches, which v2 does not
  // read
  if ((removing || changing) && view.draw.winRatio) return 'link';
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
  return route === 'winner' && !view.line && !!write?.winningSide && write.winningSide === view.existing.winningSide;
}

/** a stored winner replaced by the other side on the winner's route (S4) */
function changesWinner(view: OutcomeView, route: Route | undefined, write?: MatchUpWrite): boolean {
  return (
    route === 'winner' &&
    !view.line &&
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
  return reentersWinner(view, route, write) || route === 'swap' || route === APPLY_VALUES ? undefined : direction;
}

/** S6 tail: a relabel where the winner already stands (the `apply-values` route, the same winner) */
function relabelsWhereWinnerStands(view: OutcomeView, route: Route | undefined, write?: MatchUpWrite): boolean {
  return route === APPLY_VALUES && !!write?.winningSide && write.winningSide === view.existing.winningSide;
}

/** a cleared result taking back a winner it stored (S4) */
function removesDirection(view: OutcomeView, route: Route | undefined, write: MatchUpWrite): boolean {
  // a line directs nothing: its targets are its dual's (S7)
  return route === REMOVE_DIRECTED && !view.line && !!view.existing.winningSide && !write.winningSide;
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
/**
 * S6: a decided result turned into a double exit (the `completed-to-double-exit` route). v1 takes back what the result
 * directed (`removeDirectedParticipants`: the winner's position out of the next matchUp, the loser out of the seat their
 * link fed), then writes the double exit and advances it as a fresh one. So the plan is S4's removal, planned on the draw
 * as the call found it (`resultRemovalReason`), then S5's double exit, planned on the draw as the removal leaves it: the
 * removal and the matchUp left with no result are folded into the working view, which is read again (`rebuild`), and the
 * double exit is planned there as on a matchUp holding no result. The write is the route's own: a DOUBLE_WALKOVER blanks
 * the score, a DOUBLE_DEFAULT keeps it (CA, 2026-10-02).
 */
function resultToDoubleExit(args: Parameters<typeof planOutcome>[0]): OutcomePlan {
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
  args: Parameters<typeof planOutcome>[0],
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

/** the schedule attributes v2 plans: those v1's writer writes on the matchUp alone (S7) */
const PLANNED_SCHEDULE = new Set(['scheduledDate', 'scheduledTime', 'courtId', 'venueId', 'courtOrder']);

/**
 * S7: a call carrying a schedule. v1 asks its writer's refusals before the outcome (`addMatchUpScheduleItems`,
 * `validateOnly`) and writes it after (`disableNotice`), before `applyScoredTime` stamps onto it. v2 plans it where the
 * write lands on the matchUp alone, a date, a time, a court, a venue or a court order, as v1's own writer leaves it on a
 * copy of the matchUp (`scheduledFor`). Stays v1's: a schedule v1 refuses (an apply-stage refusal), any other attribute
 * (start, stop, resume and end times, officials, ...), and a double exit asked for again. A result turned into a double
 * exit is planned through `planOps` too, so it carries the schedule. A TEAM line is held in its dual's `tieMatchUps`, not
 * a structure's matchUps, so `scheduledFor` finds none and it stays v1's.
 */
function scheduleReason(args: Parameters<typeof abstainReason>[0]): boolean {
  const schedule = args.request.carries?.schedule;
  if (!schedule) return false;
  if (Object.keys(schedule).some((key) => !PLANNED_SCHEDULE.has(key))) return true;
  // a double exit asked for again writes nothing (`satisfiedDoubleExit`): v1 still writes the schedule
  if (satisfiedDoubleExit(args.view, args.request, args.route)) return true;
  return !scheduledFor(args);
}

/** the schedule the plan writes, once per request: the reason and the ops both read it */
const scheduled = new WeakMap<OutcomeRequest, MatchUpSchedule | undefined>();

/**
 * The matchUp's whole stored `schedule` after v1's writer has written the call's schedule on it, read by running that
 * writer, refusals first against the stored draw (nothing written), then on a copy of the matchUp in a draw holding it
 * alone. Undefined where v1 refuses it or the matchUp is not stored.
 */
function scheduledFor({
  tournamentRecord,
  drawDefinition,
  request,
}: Pick<Parameters<typeof abstainReason>[0], 'tournamentRecord' | 'drawDefinition' | 'request'>):
  MatchUpSchedule | undefined {
  if (scheduled.has(request)) return scheduled.get(request);
  const schedule = request.carries?.schedule;
  const matchUpId = request.matchUpId;
  let written: MatchUpSchedule | undefined;
  if (schedule && drawDefinition && tournamentRecord && matchUpId) {
    const args = { tournamentRecord, matchUpId, schedule, disableNotice: true };
    const check = addMatchUpScheduleItems({ ...args, drawDefinition, validateOnly: true });
    const structure = check.error ? undefined : holdingStructure(drawDefinition.structures, matchUpId);
    const stored = matchUpsOf(structure)?.find((matchUp) => matchUp.matchUpId === matchUpId);
    if (structure && stored) {
      const copy = structuredClone(stored);
      const scratch = { ...drawDefinition, structures: [{ ...structure, matchUps: [copy] } as Structure] };
      written = addMatchUpScheduleItems({ ...args, drawDefinition: scratch }).error ? undefined : (copy.schedule ?? {});
    }
  }
  scheduled.set(request, written);
  return written;
}

/** the structure whose own matchUps hold the matchUp: a round robin's group, not its container */
function holdingStructure(structures: Structure[] | undefined, matchUpId: string): Structure | undefined {
  for (const structure of structures ?? []) {
    if (matchUpsOf(structure)?.some((matchUp) => matchUp.matchUpId === matchUpId)) return structure;
    const held = holdingStructure(structuresOf(structure), matchUpId);
    if (held) return held;
  }
  return undefined;
}

function scheduleOps(args: Parameters<typeof planOutcome>[0], matchUpId: string): OutcomeOp[] {
  const schedule = args.request.carries?.schedule && scheduledFor(args);
  return schedule ? [{ op: 'setMatchUpSchedule', matchUpId, schedule }] : [];
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

export function planOutcome(args: {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  direction?: DirectionPlan;
  request: OutcomeRequest;
  write?: MatchUpWrite;
  view: OutcomeView;
  route?: Route;
  rebuild?: RebuildView;
  /** S7: the dual's call a deciding line makes */
  dual?: DualCall;
  /** S7: this call is a deciding line's dual, planned as part of the line's plan: its TEAM shape is the line's to vet */
  asDual?: true;
}): OutcomePlan {
  const plan = args.route === RESULT_TO_DOUBLE_EXIT ? resultToDoubleExit(args) : planOps(args);
  // a TEAM line's result numbers it in its collection's finishing order (a deciding line's dual is planned in its plan)
  if (!plan.ops || args.asDual) return plan;
  return { ...plan, ops: withFinishingOrder(plan.ops, args.drawDefinition) };
}

/**
 * the score as v1's write stores it (`applyScoreAndStatus`): blanked, the blank; given, the object as given (point
 * scores and all); neither, the matchUp's own is left where it is
 */
function writtenScore(request: OutcomeRequest, write: MatchUpWrite): Score | undefined {
  const blanked = write.scoreStringSide1 === '' && write.scoreStringSide2 === '' && !write.sets;
  return blanked ? { scoreStringSide1: '', scoreStringSide2: '' } : (request.score as Score | undefined);
}

/** the call's own result on its matchUp, and the matchUp's stamp */
/**
 * S7: a dual's own call that disables auto-calc writes `disableAutoCalc` on the dual, one that enables it removes it
 * (`handleTeamAutoCalc`, through `setFirstClassOrExtension`); enabling also projects the dual's winner and score from its
 * lines, which the route and the write read (`dualProjection`)
 */
function autoCalcWrite(request: OutcomeRequest, view: OutcomeView): true | null | undefined {
  if (!view.isTeam) return undefined;
  if (request.flags.disableAutoCalc) return true;
  return request.flags.enableAutoCalc ? null : undefined;
}

function resultOps(
  request: OutcomeRequest,
  write: MatchUpWrite,
  matchUpId: string,
  ensuredSides?: unknown[],
  disableAutoCalc?: true | null,
): OutcomeOp[] {
  const score = writtenScore(request, write);
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      ...(ensuredSides ? { ensuredSides } : {}),
      ...(disableAutoCalc === undefined ? {} : { disableAutoCalc }),
      matchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
      ...(score ? { score } : {}),
      ...(request.matchUpFormat ? { matchUpFormat: request.matchUpFormat } : {}),
      ...(write.winningSide ? { winningSide: write.winningSide as 1 | 2 } : {}),
      ...(write.matchUpStatusCodes ? { matchUpStatusCodes: write.matchUpStatusCodes } : {}),
      // the call's notes land on its own matchUp (a deciding line's dual, planned through here too, takes none)
      ...(typeof request.carries?.notes === 'string' && matchUpId === request.matchUpId
        ? { notes: request.carries.notes }
        : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
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
  args: Parameters<typeof planOutcome>[0] & { dual: DualCall; drawDefinition: DrawDefinition },
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
function undecidingLineOps(
  args: Parameters<typeof planOutcome>[0] & { dual: DualCall; drawDefinition: DrawDefinition },
): OutcomePlan {
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
function lineDualOps(
  args: Parameters<typeof planOutcome>[0] & { dual: DualCall; drawDefinition: DrawDefinition },
): OutcomePlan {
  return args.route === LINE_SCORE ? undecidingLineOps(args) : decidingLineOps(args);
}

function decidingLineOps(
  args: Parameters<typeof planOutcome>[0] & { dual: DualCall; drawDefinition: DrawDefinition },
): OutcomePlan {
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
  const { loserMatchUpId, loserTargetDrawPosition } = view.targets;
  const lineUps = firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }) ?? {};
  const ops: OutcomeOp[] = [];
  for (const matchUpId of [through?.matchUpId, loserMatchUpId]) {
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
  args: Parameters<typeof planOutcome>[0] & { drawDefinition: DrawDefinition },
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
function winnerLineUpOps(args: Parameters<typeof planOutcome>[0] & { drawDefinition: DrawDefinition }): OutcomeOp[] {
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
 * S7: a dual's exit carried across its loser link is written on the dual the losing team reaches by that dual's own call
 * (`setMatchUpState`), whose `ensureSideLineUps` first writes its sides with the team arrived: the carried write takes
 * them as `ensuredSides` (`ensuredDualSides`, the one rule). The line-up the team's assignment wrote there is the draw's,
 * the line-up that rule falls back to, and one edited on the dual since is the one it keeps: the stored sides are read
 * as they stand. Planned where the carry lands on that dual alone, both its sides holding their drawPositions.
 */
function carriedDualLanding(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  landing: OutcomeOp[],
  loser?: NonNullable<DirectionPlan['loser']>,
): OutcomeOp[] | undefined {
  const { loserMatchUpId, loserTargetDrawPosition } = view.targets;
  // a carry through a BYE, or on past the dual it reaches (its own loser link), writes a matchUp beyond it: v1's
  const written = landing.filter((op) => op.op === 'setMatchUpResult');
  if (!written.length || !loser?.arrives) return landing;
  const { participantId } = loser;
  if (written.some((op) => op.matchUpId !== loserMatchUpId)) return undefined;
  const reached = view.inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === loserMatchUpId);
  // planned where both the dual's sides hold their drawPositions (the loser's is one of them): a side holding none (a
  // DOUBLE_ELIMINATION losers' round, half placed) is hydrated unnumbered, and v1 reads it numbered after the arrival
  const seated = reached?.sides?.filter((side) => side.drawPosition) ?? [];
  if (seated.length !== 2) return undefined;
  const ensuredSides = ensuredDualSides({
    contextSides: reached?.sides?.map((side) =>
      side.drawPosition === loserTargetDrawPosition ? { ...side, participantId } : side,
    ),
    rawSides: view.loserDualSides as Parameters<typeof ensuredDualSides>[0]['rawSides'],
    lineUps: firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }),
  });
  return landing.map((op) =>
    op.op === 'setMatchUpResult' && op.matchUpId === loserMatchUpId ? { ...op, ensuredSides } : op,
  );
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

/** the call's plan as ops, or the reason it is v1's */
function planOps(args: Parameters<typeof planOutcome>[0]): OutcomePlan {
  const reason = abstainReason(args);
  if (reason) return { abstain: reason };
  const { request, view, drawDefinition } = args;
  const unrecorded = recordReason(args);
  if (unrecorded || !drawDefinition) return { abstain: unrecorded ?? 'no-record' };
  if (args.dual) return lineDualOps({ ...args, dual: args.dual, drawDefinition });
  // a double exit asked for again: v1 writes nothing (`satisfiedDoubleExit`)
  if (satisfiedDoubleExit(view, request, args.route)) return { ops: [], shape: 'local' };
  const write = args.write as MatchUpWrite;
  const matchUpId = request.matchUpId as string;
  const structureId = view.targets.source.structureId;
  if (!structureId) return { abstain: 'route' };

  const score = writtenScore(request, write);
  // a cleared double exit's unwind, announced before the clear's own write, as v1 makes it first (S6)
  const { ops: unwound, reannounced } = unwoundOps(view, request, args.route, drawDefinition);
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
  const { loserMatchUpId } = view.targets;
  const arrival = arrivalOps(view, loser);
  // a participant placed opposite a BYE goes on through it, a loser fed onto the seat or a winner into a BYE-held
  // target: their position joins the next matchUp, which is stamped
  const loserThrough =
    loser?.arrives && view.targets.loserTargetSeat?.opponentBye
      ? (view.targets.loserThroughBye ?? view.targets.loserByePassage?.through)
      : undefined;
  const winnerThrough =
    winner && view.targets.winner?.hasBye ? view.targets.winnerThroughBye?.[write.winningSide as 1 | 2] : undefined;
  // a dual's own call: its loser's assignment writes the team's line-up where it lands (S7)
  const dualCall = view.isTeam && !view.line && !args.asDual;
  const lineUps = dualCall ? dualLineUpOps({ ...args, drawDefinition }, loser, loserThrough) : [];
  if (!lineUps) return { abstain: 'team' };
  // a carried exit's write on the matchUp the loser lands in (S5)
  // (a carry past a BYE is recorded beside it before the carrier is placed on beyond, as v1 announces the two)
  const carried = carriedFor(view, args, loser);
  const landing = dualCall ? carriedDualLanding(view, drawDefinition, carried.landing, loser) : carried.landing;
  if (!landing) return { abstain: 'team' };
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
  // two exits meeting where the loser lands (RULE 4), and what the double exit they make produces (S5)
  const converging = loser?.converged ? convergedOps(view, request, write, loser) : [];
  // a double exit's loser seats, BYEs (S5)
  const doubleExitSeated = args.route === DOUBLE_EXIT ? doubleExitSeatOps(view, request, args.direction) : [];
  const producedExit = args.route === DOUBLE_EXIT ? producedExitOps(view, request, write, args.direction) : [];
  const seated = [...arrival, ...keptOutBye, ...reserved];
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
  return { ops, shape: args.route === 'winner' || carriedOn ? 'direction' : 'local' };
}

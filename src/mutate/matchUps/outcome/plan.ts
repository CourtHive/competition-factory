import { pendingCarryOps, type CarrySource } from './plan/pendingCarry';
import { clearedSingleExit, correctedSingleExit, refreshedArrivalOps, relabelledExit } from './plan/exitCorrections';
import { getCapturedClock, getCapturedStamps, writeLegacyEnabled } from '@Global/state/globalState';
import { producedRelayAfterOps, unwoundOps, unwoundPath, unwoundView } from './plan/unwindPath';
import { standaloneBareWinnerOps, standaloneCarriedWinnerOps } from './plan/standaloneIndirect';
import { retainedCarriedAwardOps, terminalOccupiedWinnerOps } from './plan/terminalAward';
import { notesReason, scheduleOps, scheduleReason } from './plan/schedulePlan';
import { autoCalcWrite, resultOps, writtenScore } from './plan/resultOps';
import { producedExitOps, producedReason } from './plan/producedExit';
import { carriedReason, retainedByeCarry } from './plan/carriedExit';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { convergedReason } from './plan/carriedConvergence';
import { groupTally, writtenLine } from './plan/tallyOps';
import { withFinishingOrder } from './finishingOrderOps';
import { doubleExitSeatOps } from './plan/byeChain';
import {
  APPLY_VALUES,
  CLEAR_SCORE,
  DOUBLE_EXIT,
  LINE_SCORE,
  REMOVE_DIRECTED,
  RESULT_TO_DOUBLE_EXIT,
  SINGLE_EXITS,
  changesWinner,
  directsElsewhere,
  isSettleWrite,
  indexed,
  loserByeArrival,
  heldByeLoser,
  reentersWinner,
  satisfiedDoubleExit,
  seatBye,
  structureStamps,
} from './plan/planShared';
import {
  givenWinnerReason,
  retainedRelayDirection,
  unwoundArrivalOps,
  unwoundCarriedFor,
  unwoundConvergedFor,
  unwoundKeptOutOps,
  unwoundThrough,
} from './plan/givenWinner';
import {
  carriedDualLanding,
  dualLineUpOps,
  initialRelayLineUpOps,
  dualTallyOps,
  lineExitReason,
  lineUpCarry,
  loserLineUpBeyond,
  removedByeLineUpOps,
  loserLineUpCarry,
  teamReason,
} from './plan/teamPlan';
import {
  applyValuesReason,
  changedWinnerReason,
  directionReason,
  localReason,
  reenteredReason,
  removalReason,
  swapReason,
} from './plan/directionReasons';
import {
  arrivalOps,
  awardedArrivalOps,
  arrivalReturnOps,
  placedDirection,
  removalOps,
  removedOps,
  replacedLoserOps,
  swapOps,
  winnerPlacementOps,
} from './plan/directionOps';

// constants and types
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, Score } from '@Types/tournamentTypes';
import type { OutcomeOp } from './ops';
import type {
  AbstainReason,
  DirectionPlan,
  DualCall,
  ExitReasonArgs,
  MatchUpWrite,
  OutcomePlan,
  OutcomeView,
  PlanArgs,
  SeatObligation,
} from './types';

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

/**
 * S5: an exit is planned only as a single WALKOVER, DEFAULTED or RETIRED entered with a winner on a matchUp that holds
 * no result, whose loser carries nothing on: `propagateExitStatus` off, or on with nothing to carry (no loser link, or a
 * retirement the policy does not propagate). v1 then directs it as a played result (`directParticipants`): the winner
 * goes on, the loser crosses their link plainly, and the arrival records no provenance in a target outside the exit
 * cascade (`assignMatchUpDrawPosition`'s `participatesInExitCascade` gate). The direction's own checks follow
 * (`directionReason`). A DEFAULTED under a scoring policy's `incompleteAssignmentsOnDefault` writes `processCodes`
 * (`modifyMatchUpScore`), not an op. Anything else with an exit before or after is v1's.
 */
function exitReason(args: ExitReasonArgs): AbstainReason | SeatObligation | undefined {
  const { request, view, route, write, direction } = args;
  const { existing } = view;
  // A non-propagating completion can leave a carried origin beside a BYE; the next correction still owes it.
  if (retainedByeCarry(args)) return relabelledExit(args) ? undefined : 'exit';
  if (!isAnyExit(request.matchUpStatus) && !isAnyExit(existing.matchUpStatus) && !isAnyExit(write?.matchUpStatus))
    return undefined;
  if (route === DOUBLE_EXIT)
    return producedReason(view, request, direction, write, {
      drawDefinition: args.drawDefinition,
      landing: args.landing,
    });
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
  if (directsElsewhere(direction)) return 'exit';
  if (loser?.carriedPast || loser?.withdrawn) return 'exit';
  if (loser?.converged) return convergedReason(view, request, write, loser, undefined, args.drawDefinition, true);
  if (loser?.exit) return carriedReason(view, write);
  return undefined;
}

function abstainReason(args: PlanArgs): AbstainReason | SeatObligation | undefined {
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
  if (typeof exit === 'string') return exit;
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
    const removal = view.line ? undefined : removalReason(view, direction, carryOf(args));
    if (removal) return removal;
  } else if (view.existing.winningSide && !view.line && !sameWinner && !reentered && !changing && !swapping)
    return 'winner';
  const shape = shapeReason(args, { sameWinner, reentered, changing, swapping });
  if (shape) return shape;
  if (view.existing.hasSideExitProvenance || view.existing.carriedExit) return 'provenance';
  // a round robin group's tally is planned (`setParticipantResults`, S3; a TEAM group's, S7); an ad hoc or lucky tally
  // that `view.group` does not hold is not yet
  if (view.draw.tallied && !view.group) return 'tallied';
  return exit;
}

/** the reason the call's own shape is not planned, by the shape `abstainReason` found it to be */
function shapeReason(
  args: PlanArgs,
  shape: { sameWinner: boolean; reentered: boolean; changing: boolean; swapping: boolean },
): AbstainReason | undefined {
  const { request, view, write, direction } = args;
  if (shape.sameWinner) return applyValuesReason(args);
  if (shape.reentered) return reenteredReason(view, write, direction);
  if (shape.changing) return changedWinnerReason(view, write, direction, carryOf(args));
  if (shape.swapping) return swapReason(view, write);
  // S5: a double exit's produced exit, vetted by `producedReason`
  if (args.route === DOUBLE_EXIT) return undefined;
  const directing = !!(request.winningSide || write?.winningSide || direction);
  return directing ? directionReason(args) : localReason(args);
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
  const carry = carryOf(args);
  const removing = resultRemovalReason(view, carry);
  if (removing) return { abstain: removing };
  // C27: a carry the result left pending is withdrawn first, as v1's removal withdraws it
  const removal = [...pendingCarryOps(view, carry), ...removalOps(view, request.matchUpStatus)];
  const undecided: OutcomeOp = {
    op: 'setMatchUpResult',
    matchUpId: request.matchUpId as string,
    matchUpStatus: TO_BE_PLAYED,
    stampsScoredTime: false,
  };
  const after = rebuild?.([...removal, undecided], DOUBLE_EXIT);
  if (!after) return { abstain: 'exit' };
  const produced = planOps({
    ...args,
    view: after.view,
    direction: after.direction,
    route: DOUBLE_EXIT,
    project: args.project ? (prefix) => args.project?.([...removal, undecided, ...prefix]) : undefined,
  });
  if (!produced.ops) return produced;
  // C21: the BYE entry's code-removal notice survives the double-exit placement further on. v1 announces
  // the source result before that notice; the source prefix and the other matchUps' removal writes commute.
  const held = heldByeLoser(view);
  if (held) {
    const ownResult = produced.ops.findIndex(
      (op) => op.op === 'setMatchUpResult' && op.matchUpId === request.matchUpId,
    );
    const ownStamp = produced.ops.findIndex(
      (op, index) =>
        index > ownResult && op.op === 'stampUpdatedAt' && op.entity === 'matchUp' && op.id === request.matchUpId,
    );
    if (ownResult < 0 || ownStamp < 0) return { abstain: 'exit' };
    // A quiet produced write on that entry keeps the identity of its earlier removal notice in v1.
    const tail = produced.ops
      .slice(ownStamp + 1)
      .map((op): OutcomeOp =>
        op.op === 'setMatchUpResult' && op.matchUpId === held.entry.matchUpId && op.announcesContext === false
          ? { ...op, restoresNoticeIdentity: true }
          : op,
      );
    return {
      ops: [...produced.ops.slice(0, ownStamp + 1), ...removal, ...tail],
      shape: produced.shape,
    };
  }
  return { ops: [...removal, ...produced.ops], shape: produced.shape };
}

/**
 * The result's direction taken back as S4 takes back a cleared result (`removalReason`): the winner alone in a clean
 * next matchUp of the same structure, the loser, if a link took them, on the seat it fed in a matchUp they have not
 * played. Not a result in a group (its tally), a WIN_RATIO structure, nor one with side provenance or a carried exit.
 */
function resultRemovalReason(view: OutcomeView, carry?: CarrySource): AbstainReason | undefined {
  if (!view.existing.winningSide) return 'exit';
  if (view.group || view.draw.tallied) return 'tallied';
  if (view.draw.winRatio) return 'link';
  if (view.existing.hasSideExitProvenance || view.existing.carriedExit) return 'provenance';
  return removalReason(view, undefined, carry);
}

/** A plan needs the draw and an existing captured instant; tournament containment is not a write prerequisite. */
function recordReason({
  drawDefinition,
  clockFree,
}: Pick<PlanArgs, 'drawDefinition' | 'clockFree'>): AbstainReason | undefined {
  if (!drawDefinition) return 'no-record';
  // Draw-scoped callers reuse their existing capture; direct uncaptured clocks still need ordered temporal effects.
  if (getCapturedClock() === undefined && !clockFree) return 'clock';
  return undefined;
}

/** C27's carry source: the call's draw and matchUp */
const carryOf = (args: PlanArgs): CarrySource => ({
  drawDefinition: args.drawDefinition,
  matchUpId: args.request.matchUpId,
});

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
    clockFree: args.clockFree,
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
      dualTally: {
        sides: line.dualRewrite.sides,
        tieFormat: line.dualRewrite.tieFormat,
        ...(line.dualRewrite.clearsTieFormatId ? { clearsTieFormatId: true as const } : {}),
        ...(line.dualRewrite.clearsInitialScore ? { clearsInitialScore: true as const } : {}),
      },
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
  const removedLineUps = removedByeLineUpOps(dual.view, args.drawDefinition);
  if (removedLineUps === false) return { abstain: 'team' };
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
      ...removedLineUps.filter(
        (op) =>
          op.op !== 'stampUpdatedAt' ||
          !dualOps.some((held) => held.op === 'stampUpdatedAt' && held.entity === op.entity && held.id === op.id),
      ),
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
  if (beyond) {
    const assignmentReturn = ops.findLastIndex(
      (op) => op.op === 'announcePositionAssignments' && op.structureId === dual.view.targets.loserStructureId,
    );
    ops.splice(assignmentReturn < 0 ? ops.length : assignmentReturn, 0, ...beyond);
  }
  if (loserCarry) ops.push(loserCarry, { op: 'stampUpdatedAt', entity: 'matchUp', id: loserCarry.matchUpId });
  return { ops: [...resultOps(request, write, request.matchUpId as string), ...ops], shape: dualPlan.shape };
}

/** the call's plan as ops, or the reason it is v1's */
function planOps(args: PlanArgs): OutcomePlan {
  const reason = abstainReason(args);
  if (typeof reason === 'string') return { abstain: reason };
  const { request, view, drawDefinition } = args;
  const unrecorded = recordReason(args);
  if (unrecorded || !drawDefinition) return { abstain: unrecorded ?? 'no-record' };
  if (args.dual) return lineDualOps({ ...args, dual: args.dual, drawDefinition });
  // a double exit asked for again: v1 writes nothing (`satisfiedDoubleExit`)
  if (satisfiedDoubleExit(view, request, args.route)) return { ops: [], shape: 'local' };
  return recordedPlanOps(args, drawDefinition, reason);
}

/** A propagated relabel returns the direction context even when its source previously held a played result. */
function carriedDirectionContext(args: PlanArgs, landing: OutcomeOp[]): boolean {
  return (
    (args.route === APPLY_VALUES || args.route === 'swap') &&
    (!!args.direction?.loser?.exit ||
      (retainedByeCarry(args) &&
        (args.request.matchUpStatus === WALKOVER || args.request.matchUpStatus === DEFAULTED))) &&
    landing.length > 0
  );
}

/** Every deferred seat obligation is discharged before an executable plan can leave the builder. */
function certifiedSeatProgram(args: PlanArgs, prefix: OutcomeOp[], obligation?: SeatObligation) {
  if (args.route !== DOUBLE_EXIT) return obligation ? undefined : { ops: [], after: [] };
  // a convergence certifies its own seats (`doubleExitSeatOps` asks no seat of it): nothing follows them
  const following = args.direction?.converged
    ? []
    : producedExitOps(args.view, args.request, args.write!, args.direction);
  if (!following) return undefined;
  const seats = doubleExitSeatOps(args.view, args.request, args.direction, args.project, prefix, following);
  if (!seats) return undefined;
  if (obligation && (seats.kind !== 'planned' || seats.targetMatchUpId !== obligation.targetMatchUpId))
    return undefined;
  return seats;
}

/** a double exit's produced exit, read on the cursor the program before it leaves */
function routedProducedOps(args: PlanArgs, drawDefinition: DrawDefinition, prefix: OutcomeOp[]) {
  if (args.route !== DOUBLE_EXIT) return [];
  const context = { prefix, landing: args.landing, drawDefinition };
  return producedExitOps(args.view, args.request, args.write!, args.direction, context);
}

/** a kept-out loser's BYE on the seat the link feeds (v1's `directLoser`), unless a reservation placed it already */
function keptOutByeOps(args: PlanArgs, seatProgram: OutcomeOp[], loser?: DirectionPlan['loser']): OutcomeOp[] {
  const { view } = args;
  const { loserMatchUpId } = view.targets;
  const keptOut = loser?.bye && !loser.arrives && !view.targets.loserTargetSeat?.bye ? loser.bye : undefined;
  return (
    unwoundKeptOutOps(view, seatProgram, loser, loser?.bye ? unwoundView(args)?.view : undefined) ??
    (keptOut && loserMatchUpId ? seatBye({ ...keptOut, matchUpId: loserMatchUpId }) : [])
  );
}

/** A recorded single-call plan after the shared refusal, dual and no-op gates. */
function recordedPlanOps(args: PlanArgs, drawDefinition: DrawDefinition, seatObligation?: SeatObligation): OutcomePlan {
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
    ...replacedLoserOps(view, args.route, write, request.matchUpStatus, carryOf(args)),
    ...unwound,
    // a dual's own call writes its sides first (S7); for the dual a line decides they are its line's (`dualTally`), by the
    // same rule (`ensuredDualSides`)
    // a schedule the call carries, written before the result as v1 writes it before `applyScoredTime` (S7)
    ...scheduleOps(args, matchUpId),
    ...resultOps(
      request,
      write,
      matchUpId,
      view.dualSides,
      autoCalcWrite(request, view),
      returnsQualifierRemoved(args),
    ),
    ...(refreshedArrivalOps(args) ?? []),
    // a convergence the unwind dissolved, re-announced by v1's settle pass after the call's own write (S6 tail)
    ...reannounced,
    ...dualTallyOps(view.line, args.route),
  ];
  // the first direction: the winner's position joins the next matchUp's, which v1 stores ascending
  const placing = placedDirection(view, args.route, write, retainedRelayDirection(args, unwound));
  const winner = placing?.winner;
  ops.push(
    ...winnerPlacementOps(view, args.route, write, winner),
    ...removedOps(view, args.route, write, request.matchUpStatus, carryOf(args)),
  );
  // a plain loser arrival: the loser on the seat the link feeds. The matchUp they land in is not stamped: its stored
  // object does not change (the write is on the structure's assignments), so it is not a touched entity (F2 (i), and v1).
  // The structure whose assignments change is stamped below (v1's `modifyPositionAssignmentsNotice`).
  const loser = placing?.loser;
  const arrival = arrivalOps(view, loser);
  const plainPassage = loserByeArrival(view, loser, args.route, write);
  // a participant placed opposite a BYE goes on through it, a loser fed onto the seat or a winner into a BYE-held
  // target: their position joins the next matchUp, which is stamped
  const loserThrough =
    loser?.arrives && view.targets.loserTargetSeat?.opponentBye
      ? (view.targets.loserThroughBye ??
        view.targets.loserByePassage?.through ??
        plainPassage?.through ??
        unwoundThrough(view, unwound, request.matchUpId))
      : undefined;
  // the loser's own position, where the unwind left it standing in the matchUp beyond (`unwoundThrough`)
  const placedThrough =
    loserThrough && !view.targets.loserThroughBye && !view.targets.loserByePassage?.through && !plainPassage?.through;
  const winnerThrough =
    winner && view.targets.winner?.hasBye ? view.targets.winnerThroughBye?.[write.winningSide as 1 | 2] : undefined;
  // a dual's own call: its loser's assignment writes the team's line-up where it lands (S7)
  const dualCall = view.isTeam && !view.line && !args.asDual;
  const lineUps = dualCall ? dualLineUpOps({ ...args, drawDefinition }, loser, loserThrough) : [];
  if (!lineUps) return { abstain: 'team' };
  // a carried exit's write on the matchUp the loser lands in (S5)
  // The carrier's assignment returns before progressExitStatus announces its provenance beside the BYE.
  const carried = unwoundCarriedFor(view, args, loser);
  const landing = dualCall ? carriedDualLanding(view, drawDefinition, carried.landing, loser) : carried.landing;
  if (!landing) return { abstain: 'team' };
  const initialLineUps = initialRelayLineUpOps(lineUps, carried.relay);
  const plainRelays =
    plainPassage?.byes.map((matchUpId) => ({
      matchUpId,
      drawPositions: view.inContextDrawMatchUps?.find((m) => m.matchUpId === matchUpId)?.drawPositions ?? [],
    })) ?? [];
  const throughBye = [...plainRelays, loserThrough, ...(loserThrough?.onward ?? []), winnerThrough].flatMap(
    (through): OutcomeOp[] =>
      through
        ? [
            {
              op: 'setMatchUpDrawPositions',
              matchUpId: through.matchUpId,
              drawPositions: through.drawPositions,
              ...(through !== winnerThrough && !(placedThrough && through === loserThrough)
                ? { preservesWinningSide: true as const }
                : {}),
              ...(placedThrough && through === loserThrough
                ? { placedDrawPosition: view.targets.loserTargetDrawPosition }
                : {}),
            },
            { op: 'stampUpdatedAt', entity: 'matchUp', id: through.matchUpId },
          ]
        : [],
  );
  const keptOutBye = keptOutByeOps(args, seatPrograms[0] ?? [], loser);
  // the FIRST_MATCHUP reservation the winner's arrival makes (v1's `propagateConsolationBye`)
  const reservation = write.winningSide ? view.targets.reservations?.[write.winningSide as 1 | 2] : undefined;
  const reserved = reservation?.kind === 'reserve' ? seatBye(reservation) : [];
  // seated beside a carried exit whose carrier the unwind released back, awarded it and sent on (S7), or seated where a
  // carried exit stands awarded to them, taken and sent on (C18)
  const seated = [
    ...arrival,
    ...awardedArrivalOps(view, loser),
    ...unwoundArrivalOps(view, unwound, loser),
    ...keptOutBye,
    ...reserved,
  ];
  // two exits meeting where the loser lands (RULE 4), and what the double exit they make produces (S5); under the policy
  // off, a landing linking its loser on is removed and served on the cursor this program leaves (2c-1)
  const convergence = unwoundConvergedFor(view, args, loser, {
    prefix: [...ops, ...seated, ...initialLineUps, ...throughBye, ...lineUps, ...carried.relay, ...landing],
    landing: args.landing,
  });
  if (!convergence) return { abstain: 'exit' };
  const converging = convergence.ops;
  // The linked seats read the state after the literal prefix emitted below, never positional guesses.
  const seatOps = certifiedSeatProgram(
    args,
    [...ops, ...seated, ...initialLineUps, ...throughBye, ...lineUps, ...carried.relay, ...landing, ...converging],
    seatObligation,
  );
  if (!seatOps) return { abstain: 'exit' };
  const doubleExitSeated = seatOps?.ops ?? [];
  const producedExit = routedProducedOps(args, drawDefinition, [
    ...ops,
    ...seated,
    ...initialLineUps,
    ...throughBye,
    ...lineUps,
    ...carried.relay,
    ...landing,
    ...converging,
    ...doubleExitSeated,
  ]);
  if (!producedExit) return { abstain: 'exit' };
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
  // Tally and result notices can stamp the same entity. Without the call's ledger, ordered stamp effects remain owed.
  if (view.group && !getCapturedStamps()) return { abstain: 'clock' };
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
  const arrivalReturns = arrivalReturnOps(arrival);
  ops.push(
    ...seated.filter((op) => op.op !== 'announcePositionAssignments'),
    ...initialLineUps,
    ...throughBye,
    ...lineUps,
    ...seated.filter((op) => op.op === 'announcePositionAssignments'),
    ...arrivalReturns,
    ...carried.relay,
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
  const carriedOn = carriedDirectionContext(args, carried.landing);
  // The convergence writes a fresh produced exit into the released landing. v1's scored-time reconciliation then
  // leaves that exit standing, including its existing stamp, rather than resetting the emptied award it replaced.
  const convergedWrites = new Set(converging.filter((op) => op.op === 'setMatchUpResult').map((op) => op.matchUpId));
  // v1's `reconcileScoredTimes` runs last and skips any matchUp `matchUpIsScored` finds scored, so a reconcile write is
  // faithful only where the matchUp's LAST result write leaves it unscored. A convergence's write is always a double
  // exit in `completedMatchUpStatuses`, stamping by default, so `convergedWrites` is a proof of "scored at the end"
  // without reading the end state. Keyed on the convergence rather than on "any later result write of the same matchUp"
  // (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 7): a later write that stamps or is scored agrees
  // with that rule, but a later unscored write carrying `stampsScoredTime: false` would need the reconcile write kept
  // and moved after it, and position alone cannot tell the two apart. Before widening this to one end-of-plan pass,
  // assert over the census that no candidate's matchUp takes a non-convergence result write later in the plan.
  const superseded = new Set(reannounced.filter((op) => isSettleWrite(op) && convergedWrites.has(op.matchUpId)));
  const relayAfter = producedRelayAfterOps(view, unwound, loser, seatPrograms, convergence.superseded);
  const delayedReturns = awardedAssignmentReturns(view, [...relayAfter, ...(seatOps?.after ?? [])], arrivalReturns);
  const writes = ops.filter((op) => !superseded.has(op) && !delayedReturns.has(op));
  return {
    ops: [...writes, ...returnedRelayOps(view, relayAfter, delayedReturns), ...retainedAward],
    shape: args.route === 'winner' || carriedOn ? 'direction' : 'local',
  };
}

/** A linked winner's later cleanup follows the assignment return in the originating structure. */
function returnedRelayOps(view: OutcomeView, ops: OutcomeOp[], returns: Set<OutcomeOp>): OutcomeOp[] {
  const cleanup = ops.findIndex(
    (op) => op.op === 'setMatchUpDrawPositions' && !!op.releasedDrawPosition && crossesWinnerLink(view, op.matchUpId),
  );
  const boundary = cleanup < 0 ? ops.length : cleanup;
  return [...ops.slice(0, boundary), ...returns, ...ops.slice(boundary)];
}

function crossesWinnerLink(view: OutcomeView, matchUpId: string): boolean {
  const source = indexed(view, matchUpId);
  const target = indexed(view, source?.winnerMatchUpId);
  return !!source && !!target && source.structureId !== target.structureId;
}

/** A produced exit is awarded inside assignDrawPosition, before that assignment returns. */
function awardedAssignmentReturns(view: OutcomeView, awards: OutcomeOp[], returns: OutcomeOp[]): Set<OutcomeOp> {
  const structures = new Set(
    awards.flatMap((op) =>
      op.op === 'setMatchUpResult' && op.announcedAs === 'assignMatchUpDrawPosition'
        ? [indexed(view, op.matchUpId)?.structureId]
        : [],
    ),
  );
  return new Set(returns.filter((op) => op.op === 'announcePositionAssignments' && structures.has(op.structureId)));
}

/** The unlinked qualifying-final removal still contributes its own undefined return field. */
function returnsQualifierRemoved({ route, view }: PlanArgs): true | undefined {
  return route === 'remove-directed' && view.draw.unlinkedQualifierRemoval ? true : undefined;
}

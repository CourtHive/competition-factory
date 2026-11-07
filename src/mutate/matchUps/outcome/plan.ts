import { clearedSingleExit, correctedSingleExit, relabelledExit } from './plan/exitCorrections';
import { removeLineUpSubstitutions } from '@Mutate/drawDefinitions/removeLineUpSubstitutions';
import { producedAwardWriteOps, producedExitOps, producedReason } from './plan/producedExit';
import { convergedOps, convergedReason, convergenceOps } from './plan/convergence';
import { getSideStatusCode } from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { getCapturedClock, writeLegacyEnabled } from '@Global/state/globalState';
import { notesReason, scheduleOps, scheduleReason } from './plan/schedulePlan';
import { ensuredDualSides } from '@Mutate/matchUps/lineUps/ensureSideLineUps';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { autoCalcWrite, resultOps, writtenScore } from './plan/resultOps';
import { standingReservationPrograms } from './plan/standingReservation';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { carriedFor, carriedReason } from './plan/carriedExit';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { groupTally, writtenLine } from './plan/tallyOps';
import { withFinishingOrder } from './finishingOrderOps';
import { convergedRelayCopy } from './plan/unwindSeats';
import { producedTarget } from './plan/producedTarget';
import { doubleExitSeatOps } from './plan/byeChain';
import {
  APPLY_VALUES,
  BLANK_SCORE,
  CLEAR_SCORE,
  DIRECTED_STATUSES,
  DOUBLE_EXIT,
  LINE_SCORE,
  REMOVE_DIRECTED,
  RESULT_TO_DOUBLE_EXIT,
  SINGLE_EXITS,
  carriedStatus,
  changesWinner,
  hasRetainedRelay,
  indexed,
  onwardFrom,
  pairedFeeder,
  positionsOf,
  reentersWinner,
  satisfiedDoubleExit,
  scoreless,
  seatBye,
  sideOf,
  structureStamps,
  unplaced,
  unwoundClean,
} from './plan/planShared';
import {
  applyValuesReason,
  changedWinnerReason,
  directionReason,
  localReason,
  plainLoserReason,
  reenteredReason,
  removalReason,
  swapReason,
} from './plan/directionReasons';
import {
  arrivalOps,
  placedDirection,
  removedLoserOps,
  removedOps,
  replacedLoserOps,
  swapOps,
  winnerPlacementOps,
} from './plan/directionOps';
import {
  earlyReleasedLandings,
  indirectRelayReset,
  producedRelayAfterOps,
  unwoundOps,
  unwoundPath,
  unwoundView,
} from './plan/unwindPath';
import {
  buildSideExitProvenance,
  collapseDoubleExitStatus,
  deriveStatusCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { DrawDefinition, MatchUpStatusUnion, Score, SideExitProvenance, Tournament } from '@Types/tournamentTypes';
import type { ProducedTarget, RetainedRelayReservation } from './plan/producedTarget';
import { LINEUPS } from '@Constants/extensionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { Convergence } from './plan/convergence';
import type { UnwoundLevel } from './plan/unwindPath';
import type { LineUp } from '@Types/factoryTypes';
import type { OutcomeOp } from './ops';
import type {
  AbstainReason,
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
} from './types';
import {
  BYE,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
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

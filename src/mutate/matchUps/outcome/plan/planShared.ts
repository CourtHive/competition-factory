import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import type { AbstainReason, DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView, Route } from '../types';
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';
import {
  AWAITING_RESULT,
  BYE,
  COMPLETED,
  DEFAULTED,
  INCOMPLETE,
  IN_PROGRESS,
  RETIRED,
  SUSPENDED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * Vocabulary the plan modules share: the route and status sets, the index readers (`indexed`, `sideOf`, `positionsOf`,
 * `onwardFrom`, `producedTarget`'s neighbours), the blank-score and clean-matchUp predicates, and the two ops every
 * family writes (`seatBye`, `structureStamps`). No shape logic lives here.
 */

export const REMOVE_DIRECTED: Route = 'remove-directed';
export const LINE_SCORE: Route = 'line-score';
export const DOUBLE_EXIT: Route = 'double-exit';
export const CLEAR_SCORE: Route = 'clear-score';
export const APPLY_VALUES: Route = 'apply-values';
export const RESULT_TO_DOUBLE_EXIT: Route = 'completed-to-double-exit';

export const LOCAL_ROUTES = new Set<Route>(['clear', CLEAR_SCORE, REMOVE_DIRECTED, 'only-score']);
export const LOCAL_STATUSES = new Set<string | undefined>([
  IN_PROGRESS,
  SUSPENDED,
  AWAITING_RESULT,
  INCOMPLETE,
  TO_BE_PLAYED,
]);
export const SINGLE_EXITS = new Set<string | undefined>([WALKOVER, DEFAULTED, RETIRED]);
export const DIRECTED_STATUSES = new Set<string | undefined>([COMPLETED, ...SINGLE_EXITS]);

/**
 * S6: a double exit asked for again (the `noop` route: the status it already holds, no winner). v1 treats it as
 * satisfied, not repeated (`attemptToSetMatchUpStatus`, `alreadyInRequestedDoubleExit`): it writes, stamps and announces
 * nothing, whatever score the call carries, and returns success. Planned as that: no ops.
 */
export function satisfiedDoubleExit(view: OutcomeView, request: OutcomeRequest, route?: Route): boolean {
  const { existing } = view;
  return (
    route === 'noop' &&
    isDoubleExit(existing.matchUpStatus) &&
    request.matchUpStatus === existing.matchUpStatus &&
    !existing.winningSide &&
    !request.winningSide
  );
}

/** the loser of a stored result: who holds the side the winner did not */
export function storedLoserId(view: OutcomeView): string | undefined {
  const winningSide = view.existing.winningSide;
  return winningSide ? view.targets.sideParticipantIds[(3 - winningSide) as 1 | 2] : undefined;
}

/** the winning side's drawPosition already stands in the winner's target: what a stored winner directed */
export function heldInTarget(view: OutcomeView, winningSide: 1 | 2): boolean {
  const position = view.targets.sideDrawPositions[winningSide];
  return !!position && !!view.targets.winner?.drawPositions.includes(position);
}

/**
 * Both sides of a correction are directed results: the write names a winner with a played or single-exit status, over
 * a stored one. The frame every correction detector opens with, S4 and S6 alike (Mentat
 * assessment/2026-11-07-outcome-refactor-debates.md, ruling 8).
 */
export const directedBothSides = (
  view: OutcomeView,
  write?: MatchUpWrite,
): write is MatchUpWrite & { winningSide: number } =>
  !!write?.winningSide &&
  DIRECTED_STATUSES.has(write.matchUpStatus) &&
  DIRECTED_STATUSES.has(view.existing.matchUpStatus);

/**
 * An exit write that stays v1's: the request names a status other than the write's, or the write is a DEFAULTED under a
 * scoring policy's `incompleteAssignmentsOnDefault` (v1 writes the process codes). Ruling 8.
 */
export const exitWriteIsV1s = (request: OutcomeRequest, view: OutcomeView, write: MatchUpWrite): boolean =>
  (!!request.matchUpStatus && request.matchUpStatus !== write.matchUpStatus) ||
  (write.matchUpStatus === DEFAULTED && !!view.draw.defaultProcessCodes);

/** the direction names a decider, a produced exit or a convergence: more than a winner and a loser to place. Ruling 8. */
export const directsElsewhere = (direction?: DirectionPlan): boolean =>
  !!direction?.decider || !!direction?.produced || !!direction?.converged;

/**
 * The winner's target as a clean next matchUp of the same structure holding the winning side's position: the reason it
 * is not, or undefined. Shared by the removal and the re-entered winner (ruling 8); each caller reads the missing target
 * its own way first.
 */
export function cleanWinnerTarget(
  view: OutcomeView,
  target: NonNullable<OutcomeView['targets']['winner']>,
  side: 1 | 2,
): AbstainReason | undefined {
  const { targets } = view;
  if (target.structureId !== targets.source.structureId) return 'link';
  if (target.hasBye || target.carriesExit || target.carriedStatuses.length || target.holdsResult) return 'cascade';
  if (target.matchUpStatus !== TO_BE_PLAYED) return 'route';
  if (!heldInTarget(view, side)) return 'route';
  return undefined;
}

export const hasRetainedRelay = (ops: OutcomeOp[]) =>
  ops.some((op) => op.op === 'setMatchUpResult' && !!op.retainedExitPlanned);

export const sideOf = (matchUp: HydratedMatchUp | undefined, drawPosition?: number) => {
  const sideNumber = matchUp?.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  return sideNumber === 1 || sideNumber === 2 ? sideNumber : undefined;
};

export const indexed = (view: OutcomeView, matchUpId?: string) =>
  view.inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);

/**
 * Where a participant awarded an exit goes on to, as v1's nested direction sends them (`directWinner`): their position
 * joins the next matchUp of the structure. Only a clean arrival: that matchUp is to be played with no winner, score,
 * provenance or BYE, and has a seat they do not already hold. Undefined otherwise.
 */
export function onwardFrom(
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
 * C18: A STANDING AWARD THE ARRIVING LOSER TAKES. The matchUp the loser's link feeds already holds a carried single
 * exit awarded to the seat they are placed on: the carrier's WALKOVER or DEFAULTED came down the link first
 * (`progressExitStatus`), stands as the matchUp's status with `winningSide` naming the empty seat, and its provenance
 * sits on the carrier's side. v1's `assignDrawPosition` then treats the arrival as the award's winner
 * (`participantArrivesAtExit`): the matchUp is written back as it stands with its codes re-derived (`[]`) and announced
 * as the assignment, and the arriving position goes on into the next matchUp of the structure
 * (`advanceIntoWinnerMatchUp`), a clean arrival there (`onwardFrom`), or nowhere from the structure's last round.
 * Certified only for that exact shape: a single exit (never a double exit's produced one, which has no winner until
 * somebody arrives), the award on the arriving seat, exactly the carrier's provenance, scoreless, no codes stored, the
 * carrier present and no BYE beside, the loser carrying nothing, a plain winner's call (an unwind's arrival is
 * `unwoundArrivalOps`), and the position not yet standing onward. Anything else stays v1's (`cascade`).
 */
export function standingAwardArrival(
  view: OutcomeView,
  loser?: DirectionPlan['loser'],
):
  | { entry: HydratedMatchUp; drawPosition: number; onward?: { matchUpId: string; drawPositions: number[] } }
  | undefined {
  const { targets, existing } = view;
  const { loserMatchUpId, loserTargetDrawPosition: drawPosition, loserTargetSeat: seat } = targets;
  if (!loser?.arrives || loser.exit || loser.converged || loser.carriedPast || loser.bye || loser.withdrawn)
    return undefined;
  if (isDoubleExit(existing.matchUpStatus) || targets.loserLink?.linkCondition) return undefined;
  const entry = indexed(view, loserMatchUpId);
  if (!entry || !drawPosition || !seat?.free || seat.opponentBye || !seat.opponentHeld) return undefined;
  if (entry.matchUpStatus !== WALKOVER && entry.matchUpStatus !== DEFAULTED) return undefined;
  const side = sideOf(entry, drawPosition);
  if (!side || entry.winningSide !== side) return undefined;
  if (entry.score?.scoreStringSide1 || entry.matchUpStatusCodes?.length) return undefined;
  const provenance = entry.sideExitProvenance ?? {};
  const carrier = provenance[(3 - side) as 1 | 2];
  if (Object.keys(provenance).length !== 1 || carrier?.matchUpStatus !== entry.matchUpStatus) return undefined;
  if (isDoubleExit(carrier.previousMatchUpStatus)) return undefined;
  if (positionsOf(entry).length !== 2 || !positionsOf(entry).includes(drawPosition)) return undefined;
  if (!entry.winnerMatchUpId) return { entry, drawPosition };
  const next = indexed(view, entry.winnerMatchUpId);
  if (!next || positionsOf(next).some((position) => positionsOf(entry).includes(position))) return undefined;
  const onward = onwardFrom(view, entry, drawPosition);
  return onward ? { entry, drawPosition, onward } : undefined;
}

/**
 * C19: a winner arriving opposite a double exit's single produced exit, still pending. v1 awards the held exit to
 * the arrival, records their origin and sends them on. Only the empty arrival seat, exactly the paired feeder's
 * double-exit provenance, no result, score, codes or BYE, and a clean onward arrival (or the last round).
 */
export function pendingProducedArrival(view: OutcomeView, write: MatchUpWrite) {
  // An unwind or a result already written on a rebuilt view has its own award program.
  if (view.existing.winningSide || isDoubleExit(view.existing.matchUpStatus)) return undefined;
  const { targets } = view;
  const entry = indexed(view, targets.winnerMatchUpId);
  const paired = pairedFeeder(view);
  const sourcePosition = targets.source.roundPosition;
  const source = view.inContextDrawMatchUps?.find(
    (matchUp) =>
      matchUp.structureId === targets.source.structureId &&
      matchUp.roundNumber === targets.source.roundNumber &&
      matchUp.roundPosition === sourcePosition,
  );
  const drawPosition = source?.sides?.find((side) => side.sideNumber === write.winningSide)?.drawPosition;
  if (!entry || !drawPosition || !paired || !source || !sourcePosition || !paired.roundPosition) return undefined;
  if (entry.structureId !== targets.source.structureId || paired.winnerMatchUpId !== entry.matchUpId) return undefined;
  if (entry.matchUpStatus !== WALKOVER && entry.matchUpStatus !== DEFAULTED) return undefined;
  if (entry.winningSide || !scoreless(entry) || entry.matchUpStatusCodes?.length) return undefined;
  if (entry.sides?.some((side) => side.bye) || positionsOf(entry).length) return undefined;
  const side: 1 | 2 = sourcePosition < paired.roundPosition ? 1 : 2;
  const provenance = entry.sideExitProvenance ?? {};
  const origin = provenance[(3 - side) as 1 | 2];
  if (
    Object.keys(provenance).length !== 1 ||
    origin?.matchUpStatus !== entry.matchUpStatus ||
    !isDoubleExit(origin.previousMatchUpStatus) ||
    origin.sourceMatchUpId !== paired.matchUpId
  )
    return undefined;
  if (!entry.winnerMatchUpId)
    return { entry, matchUpStatus: entry.matchUpStatus, drawPosition, side, sourceMatchUpId: source.matchUpId };
  const onward = onwardFrom(view, entry, drawPosition);
  return onward
    ? { entry, matchUpStatus: entry.matchUpStatus, drawPosition, side, sourceMatchUpId: source.matchUpId, onward }
    : undefined;
}

/** beside another position, the side a position takes: the numerically lower is side 1 */
export const lowerFirst = (positions: number[], drawPosition: number): 1 | 2 =>
  drawPosition === Math.min(...positions) ? 1 : 2;

/** the matchUp beside this one in its round, which feeds the other side of the same next matchUp */
export function pairedFeeder(
  view: OutcomeView,
  source: Partial<Pick<HydratedMatchUp, 'structureId' | 'roundNumber' | 'roundPosition'>> = view.targets.source,
): HydratedMatchUp | undefined {
  const { structureId, roundNumber, roundPosition } = source;
  if (!roundPosition) return undefined;
  const paired = roundPosition % 2 ? roundPosition + 1 : roundPosition - 1;
  return view.inContextDrawMatchUps?.find(
    (matchUp) =>
      matchUp.structureId === structureId && matchUp.roundNumber === roundNumber && matchUp.roundPosition === paired,
  );
}

/** the exit a loser carries across the link (`progressExitStatus`): a WALKOVER or DEFAULTED as itself, else a WALKOVER */
export const carriedStatus = (status?: string): MatchUpStatusUnion => (status === DEFAULTED ? DEFAULTED : WALKOVER);

/** the first reason this call is not S1's, or undefined when it is */
export const BLANK_SCORE: Score = toBePlayed.score;
export const scoreless = (matchUp: HydratedMatchUp) =>
  !matchUp.score?.scoreStringSide1 && !matchUp.score?.scoreStringSide2 && !matchUp.score?.sets?.length;
export const unplaced = (matchUp: HydratedMatchUp) => !(matchUp.drawPositions ?? []).some(Boolean);
/**
 * a loser's home that is a BYE holding nothing else of a result: no winner, score, codes, side provenance or loser
 * link. The seven conjuncts `unwoundKeptOutOps` and `standingReservationSeat` share (Mentat
 * assessment/2026-11-07-outcome-refactor-debates.md, ruling 9); each keeps its own seat and structure walls
 */
export const cleanByeHome = (home: HydratedMatchUp | undefined): home is HydratedMatchUp =>
  !!home &&
  home.matchUpStatus === BYE &&
  !home.winningSide &&
  scoreless(home) &&
  !home.matchUpStatusCodes?.length &&
  !Object.keys(home.sideExitProvenance ?? {}).length &&
  !home.loserMatchUpId;
/**
 * a settle write v1's `reconcileScoredTimes` pass makes, announced after everything else: the one predicate the plan
 * modules share for it (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 7)
 */
export const isSettleWrite = (op: OutcomeOp): op is Extract<OutcomeOp, { op: 'setMatchUpResult' }> =>
  op.op === 'setMatchUpResult' && op.announcedAs === 'reconcileScoredTimes';
export const undecided = (matchUp: HydratedMatchUp, loserLinked?: boolean) =>
  !matchUp.winningSide &&
  scoreless(matchUp) &&
  unplaced(matchUp) &&
  !matchUp.matchUpStatusCodes?.length &&
  (loserLinked || !matchUp.loserMatchUpId) &&
  !matchUp.sides?.some((side) => side.bye);

/**
 * v1's `removeDirectedBye` at a seat the unwind visits. Where the double exit placed a BYE (its own loser seat, and the
 * seat its produced exit left unfillable), the BYE is withdrawn, its matchUp is to be played again, and a position the
 * BYE sent on is taken back out of the next matchUp; planned where that BYE went no further (its matchUp links no loser
 * on, and the next matchUp is to be played with no result or provenance, and keeps a position). A seat further on holds nothing yet, and the
 * visit only announces its structure. Undefined for anything else.
 */
export const seatKey = ({ structureId, drawPosition }: { structureId?: string; drawPosition?: number }) =>
  `${structureId}:${drawPosition}`;

export const positionsOf = (matchUp: HydratedMatchUp | undefined) =>
  (matchUp?.drawPositions ?? []).filter((position): position is number => !!position);

/**
 * A matchUp an unwind writes back to be played, holding nothing of a result: to be played (or a BYE whose BYE this unwind
 * withdraws), no score, codes or provenance. Its positions stand: structural, or sent on by what the unwind takes back.
 */
export function unwoundClean(matchUp: HydratedMatchUp, withdrawn: Set<string>): boolean {
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

/** the stored winner entered again on the winner's route (S4) */
export function reentersWinner(view: OutcomeView, route: Route | undefined, write?: MatchUpWrite): boolean {
  return route === 'winner' && !view.line && !!write?.winningSide && write.winningSide === view.existing.winningSide;
}

/** a stored winner replaced by the other side on the winner's route (S4) */
export function changesWinner(view: OutcomeView, route: Route | undefined, write?: MatchUpWrite): boolean {
  return (
    route === 'winner' &&
    !view.line &&
    !!write?.winningSide &&
    !!view.existing.winningSide &&
    write.winningSide !== view.existing.winningSide
  );
}

/** S6 tail: a relabel where the winner already stands (the `apply-values` route, the same winner) */
export function relabelsWhereWinnerStands(view: OutcomeView, route: Route | undefined, write?: MatchUpWrite): boolean {
  return route === APPLY_VALUES && !!write?.winningSide && write.winningSide === view.existing.winningSide;
}

/** a cleared result taking back a winner it stored (S4) */
export function removesDirection(view: OutcomeView, route: Route | undefined, write: MatchUpWrite): boolean {
  // a line directs nothing: its targets are its dual's (S7)
  return route === REMOVE_DIRECTED && !view.line && !!view.existing.winningSide && !write.winningSide;
}

/** a seat filled with a propagated BYE and its matchUp a BYE (`assignDrawPositionBye`), the matchUp stamped */
export function seatBye(seat: { structureId: string; drawPosition: number; matchUpId: string }): OutcomeOp[] {
  return [
    { op: 'assignBye', structureId: seat.structureId, drawPosition: seat.drawPosition, byeFromPropagation: true },
    { op: 'setMatchUpBye', matchUpId: seat.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: seat.matchUpId },
  ];
}

/**
 * each structure other than the call's whose assignments the ops change and announce, stamped once (F2 (i)): v1 stamps a
 * structure as it announces in it, so a BYE the round-1 loser cascade takes back quietly stamps nothing by itself (its
 * walk stamps the structures it announces matchUps in, `unwindWalk`, `cascadedSeatOps`)
 */
export function structureStamps(ops: OutcomeOp[], structureId: string): OutcomeOp[] {
  const seatedIn = ops.flatMap((op) =>
    (op.op === 'assignPosition' ||
      op.op === 'assignBye' ||
      (op.op === 'withdrawBye' && op.announcesAssignments !== false)) &&
    op.structureId !== structureId
      ? [op.structureId]
      : [],
  );
  return [...new Set(seatedIn)].map((id) => ({ op: 'stampUpdatedAt', entity: 'structure', id }));
}

/** C20: a first plain loser arrival through same-structure BYEs, ending cleanly or in the last round. */
export function plainByeArrival(view: OutcomeView, loser?: DirectionPlan['loser']) {
  const { targets, existing } = view;
  const passage = targets.loserByeTraversal;
  const drawPosition = targets.loserTargetDrawPosition;
  if (
    existing.winningSide ||
    isDoubleExit(existing.matchUpStatus) ||
    !loser?.arrives ||
    loser.exit ||
    loser.converged ||
    loser.carriedPast ||
    loser.bye ||
    loser.withdrawn ||
    !targets.loserTargetSeat?.free ||
    !targets.loserTargetSeat.opponentBye ||
    targets.loserThroughBye ||
    !passage ||
    !drawPosition
  )
    return undefined;
  const home = indexed(view, targets.loserMatchUpId);
  const chain = [home, ...passage.byes.map((id) => indexed(view, id))];
  for (const [index, entry] of chain.entries()) {
    const side = sideOf(entry, drawPosition);
    if (
      !entry ||
      !side ||
      entry.structureId !== targets.loserStructureId ||
      entry.matchUpStatus !== BYE ||
      entry.winningSide ||
      !scoreless(entry) ||
      entry.matchUpStatusCodes?.length ||
      Object.keys(entry.sideExitProvenance ?? {}).length ||
      entry.sides?.find((s) => s.sideNumber === side)?.participantId ||
      !entry.sides?.some((s) => s.sideNumber !== side && s.bye) ||
      (index && chain[index - 1]?.winnerMatchUpId !== entry.matchUpId)
    )
      return undefined;
  }
  const last = chain[chain.length - 1];
  if (!last) return undefined;
  if (passage.through) {
    const next = indexed(view, passage.through.matchUpId);
    if (!next || last.winnerMatchUpId !== next.matchUpId || next.structureId !== last.structureId) return undefined;
  } else if (last.winnerMatchUpId) return undefined;
  return { byes: passage.byes, through: passage.through };
}

/** C21: the old loser still holds an unconditional seat opposite a structural BYE. */
export function heldByeLoser(view: OutcomeView) {
  const { targets } = view;
  const drawPosition = targets.loserTargetDrawPosition;
  const participantId = storedLoserId(view);
  const record = targets.loserMatchUpRecord;
  if (
    !participantId ||
    !drawPosition ||
    targets.loserLink?.linkCondition ||
    targets.loserTargetSeat?.participantId !== participantId ||
    !targets.loserTargetSeat.opponentBye ||
    targets.loserMatchUpHasResult ||
    targets.loserMatchUpCarriesExit ||
    !record ||
    record.provenance ||
    record.matchUpStatusCodes?.length
  )
    return undefined;
  const passage = targets.loserThroughBye
    ? { byes: [] as string[], through: targets.loserThroughBye }
    : targets.loserByeTraversal;
  if (!passage) return undefined;
  const entry = indexed(view, targets.loserMatchUpId);
  const chain = [entry, ...passage.byes.map((id) => indexed(view, id))];
  for (const [index, matchUp] of chain.entries()) {
    const side = sideOf(matchUp, drawPosition);
    if (
      !matchUp ||
      !side ||
      matchUp.structureId !== targets.loserStructureId ||
      matchUp.matchUpStatus !== BYE ||
      matchUp.winningSide ||
      !scoreless(matchUp) ||
      matchUp.matchUpStatusCodes?.length ||
      Object.keys(matchUp.sideExitProvenance ?? {}).length ||
      matchUp.sides?.find((s) => s.sideNumber === side)?.participantId !== participantId ||
      !matchUp.sides?.some((s) => s.sideNumber !== side && s.bye) ||
      (index && chain[index - 1]?.winnerMatchUpId !== matchUp.matchUpId)
    )
      return undefined;
  }
  const last = chain[chain.length - 1];
  if (!entry || !last) return undefined;
  if (passage.through) {
    const next = indexed(view, passage.through.matchUpId);
    if (!next || last.winnerMatchUpId !== next.matchUpId || next.structureId !== last.structureId) return undefined;
  } else if (last.winnerMatchUpId) return undefined;
  return { ...passage, entry, drawPosition };
}

/** A plain loser arriving for the first time, or replacing the old loser on a correction (C20/C21). */
export function loserByeArrival(
  view: OutcomeView,
  loser: DirectionPlan['loser'] | undefined,
  route?: Route,
  write?: MatchUpWrite,
) {
  if (!loser?.arrives || loser.exit || loser.converged || loser.carriedPast || loser.bye || loser.withdrawn)
    return undefined;
  return plainByeArrival(view, loser) ?? (changesWinner(view, route, write) ? heldByeLoser(view) : undefined);
}

/** C22: a fresh single exit awards an unreached side; there is no winner participant to direct yet. */
export function unreachedWinner(view: OutcomeView, write: MatchUpWrite, direction?: DirectionPlan): boolean {
  const { existing, targets } = view;
  const side = write.winningSide;
  if (!direction || direction.winner || (side !== 1 && side !== 2)) return false;
  return (
    (write.matchUpStatus === WALKOVER || write.matchUpStatus === DEFAULTED) &&
    existing.matchUpStatus === TO_BE_PLAYED &&
    !existing.winningSide &&
    !existing.scoreHasValue &&
    !existing.carriedExit &&
    !existing.hasSideExitProvenance &&
    !existing.matchUpStatusCodes?.length &&
    !targets.sideParticipantIds[side] &&
    !!targets.sideParticipantIds[side === 1 ? 2 : 1]
  );
}

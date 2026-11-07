import { isDoubleExit } from '@Validators/isExit';

// constants and types
import type { MatchUpWrite, OutcomeRequest, OutcomeView, Route } from '../types';
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
export const BLANK_SCORE: Score = { scoreStringSide1: '', scoreStringSide2: '' };
export const scoreless = (matchUp: HydratedMatchUp) =>
  !matchUp.score?.scoreStringSide1 && !matchUp.score?.scoreStringSide2 && !matchUp.score?.sets?.length;
export const unplaced = (matchUp: HydratedMatchUp) => !(matchUp.drawPositions ?? []).some(Boolean);
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

import { blankScore, SINGLE_EXITS, carriedStatus, indexed, isSettleWrite, sideOf } from './planShared';
import { producedTarget, producedTargetOps, producedTargetReason } from './producedTarget';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { releaseWalk } from '../unwindWalk';
import { walkChain } from './byeChain';
import {
  buildCarriedExitProvenance,
  collapseDoubleExitStatus,
  deriveStatusCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { AbstainReason, ByeWalk, DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView } from '../types';
import type { DrawDefinition, MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import type { ProducedTarget, RetainedRelayReservation } from './producedTarget';
import { DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';

/**
 * RULE 4 of v1's `progressExitStatus` (S5, S6 tail): a CARRIED exit meeting the exit standing where a carrier
 * lands, written as `setMatchUpState` writes it, the double exit they make and what it produces on.
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
  drawDefinition?: DrawDefinition,
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
    drawDefinition,
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
  /** 2a: a pending landing's reservation in the produced target, taken back before it produces there (DEA:976) */
  withdrawn?: OutcomeOp[];
};

// Two RULE 4 rules, kept apart on purpose (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 3).
// `convergenceAt` mirrors `progressExitStatus`: a CARRIED exit arriving where a single exit is AWARDED to the
// carrier's seat, any carried origin standing opposite, written as `setMatchUpState` writes it (`deriveStatusCodes`,
// `scoredTime` stamped). `producedConvergedReason` mirrors `conditionallyAdvanceDrawPosition`'s `existingExit`: a
// PRODUCED exit arriving where a PENDING exit a double exit produced stands with no winner and no positions, written
// as `modifyMatchUpScore` writes it (codes `[]`, no `scoredTime`). A merge parameterised by the arrival would branch at
// the award, the standing origin, the positions, the seats, the codes, the stamp and the score guard.
// THE WRITER FOLLOWS THE CALLER, NOT THE CELL (Mentat assessment/2026-11-12-outcome-v2-after-1c-ruling.md): a carried
// exit onto a pending produced exit is written by `progressExitStatus` RULE 4 through `setMatchUpState` when the
// loser's direction reaches it (no winner there, so nothing directed is taken back), and by `convergeCarriedExit`
// through `modifyMatchUpScore` only on DEA's own carry (`carryExitOnward`). The off-diagonal cells refused by both
// (a produced exit onto a carried award, `recordedExitAwaitingThisSeat`: FEED_IN_CHAMPIONSHIP 8, Main 2/1 WALKOVER
// carried onto Consolation 2/2, then Consolation 1/2 a DOUBLE_WALKOVER, both abstain `exit`, differential clean; the
// DEA carry onto a pending produced exit) are deferred v2 work, each owned by the slice the ruling names.
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
  drawDefinition?: DrawDefinition,
): Convergence | undefined {
  const landing = indexed(view, matchUpId);
  const sideNumber = sideOf(landing, drawPosition);
  if (!landing || !sideNumber) return undefined;
  // 2a: a PENDING exit standing there (no winner) meets the carrier as an awarded one does. `progressExitStatus` asks
  // whether the opponent has itself exited (`carriedExitStatus`, its RULE 4 gate), not who won: the same pending RULE 4
  // `standalonePendingConvergence` plans, written by the same `setMatchUpState` (after-1c ruling, M1: v1 takes nothing
  // directed back there)
  const pending = !landing.winningSide && pendingExitOpposite(landing, sideNumber);
  if (landing.winningSide !== sideNumber && !pending) return undefined;
  // a landing that links its loser on: its own seat takes the double exit's BYE (the first carrier displaced), planned
  // where the walk of v1's recursion plans it, under `doubleExitPropagateBye` (S6 tail)
  if (landing.loserMatchUpId && (!walk?.own || !view.draw.propagatesByeOnDoubleExit)) return undefined;
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
    // a pending landing's convergence is `setMatchUpState`'s nested score write, blank whatever the flavour (as the
    // standalone pending RULE 4 writes it)
    ...(pending ? { score: blankScore() } : {}),
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
  // 2a: a pending landing's own position stands there as the reservation its produced exit made: v1 takes it back before
  // the double exit produces there (`withdrawOwnAdvancement`, DEA:976, P44), as 1b's `convergedWinner` plans it
  const released =
    advanced && pending && target
      ? withdrawReservation(
          view,
          landing,
          target,
          (found) => producedTargetReason(view, landing, found, targetLinked),
          drawDefinition,
        )
      : undefined;
  const onward = released?.target ?? target;
  if (!onward || (advanced && !released) || !producedTargetReason(view, landing, onward, targetLinked))
    return undefined;
  const seats = [...(convergence.seats ?? []), ...(unfillable ? [...unfillable.assigns, ...unfillable.writes] : [])];
  return {
    ...convergence,
    target: onward,
    ...(released ? { withdrawn: released.ops } : {}),
    ...(seats.length ? { seats } : {}),
  };
}

/**
 * The reservation a pending landing's produced exit left in its target, taken back (`releaseWalk`, DEA:976's writer), and
 * the target as the convergence's produced exit then finds it. Undefined where the target holds anyone else's position:
 * a fed seat's, a BYE's, or one the landing does not hold, or where the released target does not `fit`: read before the
 * walk, which a refusal there would spend for nothing.
 */
function withdrawReservation(
  view: OutcomeView,
  landing: HydratedMatchUp,
  target: ProducedTarget,
  fits: (released: ProducedTarget) => unknown,
  drawDefinition?: DrawDefinition,
): { ops: OutcomeOp[]; target: ProducedTarget } | undefined {
  const { entry } = target;
  if (!drawDefinition || target.feed || entry.sides?.some((side) => side.bye)) return undefined;
  const held = (entry.drawPositions ?? []).filter((position): position is number => !!position);
  const own = held.filter((position) => landing.drawPositions?.includes(position));
  if (!own.length || own.length !== held.length) return undefined;
  const released = {
    ...entry,
    drawPositions: [],
    sides: entry.sides?.map((side) =>
      own.includes(side.drawPosition as number) ? { ...side, drawPosition: undefined } : side,
    ),
  };
  const releasedTarget = { ...target, entry: released as HydratedMatchUp };
  if (!fits(releasedTarget)) return undefined;
  const ops = releaseWalk({
    inContextDrawMatchUps: view.inContextDrawMatchUps ?? [],
    propagatesBye: !!view.draw.propagatesByeOnDoubleExit,
    fromRoundNumber: entry.roundNumber as number,
    structureId: entry.structureId,
    drawPositions: own,
    drawDefinition,
  });
  if (!ops) return undefined;
  return { ops, target: releasedTarget };
}

/** a pending exit carried in on the other side and recorded there alone: the opponent has itself exited (RULE 4) */
function pendingExitOpposite(landing: HydratedMatchUp, sideNumber: 1 | 2): boolean {
  const provenance = landing.sideExitProvenance ?? {};
  return Object.keys(provenance).length === 1 && !!carriedExitStatus(provenance[3 - sideNumber]);
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
  const score = convergence.score ?? (matchUpStatus === DOUBLE_WALKOVER ? blankScore() : undefined);
  const previousLoser = indexed(view, matchUpId)?.sides?.find((side) => side.sideNumber !== sideNumber)?.participantId;
  const seats = (convergence.seats ?? []).map((op): OutcomeOp => {
    if (op.op !== 'assignBye' || !previousLoser) return op;
    const participant = indexed(view, op.matchUpId)?.sides?.find(
      (side) => side.drawPosition === op.drawPosition,
    )?.participantId;
    return participant === previousLoser ? { ...op, clearsDisplacedPosition: true } : op;
  });
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus,
      removesWinningSide: true,
      // a side whose standing exit a double exit delivered shows its outcome code (S6 tail)
      matchUpStatusCodes,
      // a DOUBLE_WALKOVER says nothing was played, so its score is blanked; a DOUBLE_DEFAULT keeps what stood
      ...(score ? { score, ...(score === blankScore() ? { resetsScore: true as const } : {}) } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    // the BYEs before the exit produced onward, as v1's `doubleExitAdvancement` places them; a displaced carrier's landing
    // is announced last, by the `reconcileScoredTimes` pass that takes its `scoredTime`
    ...unreconciled(seats),
    ...(convergence.withdrawn ?? []),
    ...(target ? producedTargetOps(view, target, matchUpId, matchUpStatus) : []),
    ...reconciled(seats),
  ];
}

/** a walk's ops but the writes v1's `reconcileScoredTimes` pass makes, which it announces after everything else */
const unreconciled = (ops: OutcomeOp[]) => ops.filter((op) => !isSettleWrite(op));

const reconciled = (ops: OutcomeOp[]) => ops.filter((op) => isSettleWrite(op));

/** a convergence's writes: the landing as the double exit, the arriving side's entry, and the exit it produces */
export function convergedOps(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  loser?: DirectionPlan['loser'],
  reservation?: RetainedRelayReservation,
  drawDefinition?: DrawDefinition,
) {
  const { loserMatchUpId, loserTargetDrawPosition } = view.targets;
  const carried = carriedStatus(request.matchUpStatus);
  const convergence =
    loser?.arrives && loser.converged
      ? convergenceAt(
          view,
          loserMatchUpId,
          loserTargetDrawPosition,
          carried,
          view.targets.landingWalk,
          reservation,
          drawDefinition,
        )
      : undefined;
  if (!convergence) return [];
  return convergenceOps(view, convergence, carried, request.matchUpId, write.matchUpStatus as MatchUpStatusUnion);
}

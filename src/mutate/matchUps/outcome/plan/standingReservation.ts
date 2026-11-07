import { cleanByeHome, indexed, positionsOf, unwoundClean } from './planShared';
import { firstRoundFeedersWon } from '@Query/matchUp/firstRoundFeedersWon';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import { FIRST_MATCH_LOSER_CONSOLATION, FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { OutcomeView, PlanArgs, WinnerLoserSeat } from '../types';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';

/**
 * v1's standing FIRST_MATCHUP reservation when both possible source participants already have qualifying wins (C14): an
 * empty own-seat program on the winner route.
 */

/** v1's standing FIRST_MATCHUP reservation is an actual empty own-seat program, only for this winner route. */
export function standingReservationPrograms({
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

// Four sites read the FIRST_MATCHUP reservation and they are kept separate on purpose (Mentat
// assessment/2026-11-07-outcome-refactor-debates.md, ruling 9). `reservationReason` reads the winner target's fed
// seat with this call's result projected; `keptOutReason` and `recordedPlanOps` read this call's fed seat and treat
// any BYE as nothing to place, as v1's `assignDrawPositionBye` no-ops on any BYE; this reader requires the BYE to
// carry `byeFromPropagation`, as v1's `removeDoubleExit` withdraws only a marked BYE; `unwoundKeptOutOps` reads the
// seat on the unwound view, where it is free, and consumes the own program's ops that `standingReservationPrograms`
// shapes as the unwind's input. One reader with one seat wall would write a marker onto an unmarked BYE v1 leaves
// alone, or leave a withdrawn BYE unrestored. Only the feeders' predicate (`firstRoundFeedersWon`) and the
// clean-BYE-home test are shared.
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
  if (!cleanByeHome(home) || home.structureId !== seat.structureId || home.structureId === source.structureId)
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

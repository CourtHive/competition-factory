import { earlyReleasedLandings, unwoundOps, unwoundPath, unwoundView } from './unwindPath';
import { standaloneBareWinnerOps, standaloneCarriedWinnerOps } from './standaloneIndirect';
import { convergedOps, convergedReason, convergenceOps } from './convergence';
import { standingReservationPrograms } from './standingReservation';
import { supersededOwnRelayConvergence } from './supersededRelay';
import { terminalOccupiedWinnerOps } from './terminalAward';
import { carriedFor, carriedReason } from './carriedExit';
import { plainLoserReason } from './directionReasons';
import { convergedRelayCopy } from './unwindSeats';
import { isDoubleExit } from '@Validators/isExit';
import { producedTarget } from './producedTarget';
import {
  DIRECTED_STATUSES,
  carriedStatus,
  hasRetainedRelay,
  indexed,
  positionsOf,
  scoreless,
  seatBye,
  sideOf,
  unplaced,
  unwoundClean,
} from './planShared';

// constants and types
import { BYE, DEFAULTED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { RetainedRelayReservation } from './producedTarget';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { Convergence } from './convergence';
import type { UnwoundLevel } from './unwindPath';
import type { OutcomeOp } from '../ops';
import type {
  AbstainReason,
  DirectionPlan,
  ExitReasonArgs,
  MatchUpWrite,
  OutcomeView,
  PlanArgs,
  RebuildView,
  ThroughBye,
} from '../types';

/**
 * A double exit given a winner (S6, S7): the unwind first, then the result and its direction on the draw as the unwind
 * leaves it: the loser's plain arrival, kept-out BYE, carry or convergence on the freed seat, the retained relay, the
 * loser going on through a standing BYE, and the produced exit resting where its BYE went.
 */

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
export function givenWinnerReason(args: ExitReasonArgs): AbstainReason | undefined {
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

// This rule reads the unwind's ops, not a rebuilt view, by design (Mentat
// assessment/2026-11-07-outcome-refactor-debates.md, ruling 4). `unwoundCarryReason` folds the unwind and asks
// `plainLoserReason` because the carry needs the rebuilt view anyway and walls every conditioned link; this path
// keeps FIRST_MATCHUP round two, whose kept-out and standing programs (`unwoundKeptOutOps`,
// `standingReservationPrograms`) are certified from the exact withdrawal and clear, which the fold erases (a freed
// seat and a standing seat fold identically). The rebuilt `loserThroughBye` also reads none where `unwoundThrough`
// admits a chain of BYEs still standing (the THROUGH_CHAINS scenarios), so `plainLoserReason` on the rebuilt view
// would refuse owned calls. A plain given-winner call makes no outcome-view rebuild today; folding here would add one
// to every such call.
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

// One of the four FIRST_MATCHUP reservation readers kept apart by ruling 9 (see `standingReservationSeat`): this one
// reads the seat on the unwound view and consumes the own program's withdrawal and clear.
/** A FIRST_MATCHUP loser kept out by a qualifying win restores the BYE its own unwind withdrew. */
export function unwoundKeptOutOps(
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
export function retainedRelayDirection(
  args: Parameters<typeof unwoundView>[0] & { direction?: DirectionPlan },
  ops: OutcomeOp[],
) {
  if (!hasRetainedRelay(ops)) return args.direction;
  const after = unwoundView(args, { releasedLandings: true });
  return after && retainedRelayReservation(args, after) ? after.direction : args.direction;
}

/**
 * The carry's write (`carriedFor`), from the view as a double exit's unwind leaves it where the loser carries their own
 * exit onto the seat the unwind frees (`unwoundCarryReason`, S7), and from the call's view otherwise. The loser's half
 * is the call's: the direction re-planned on the unwound view carries the same exit (`unwoundCarryReason` asked)
 */
export function unwoundCarriedFor(
  view: OutcomeView,
  args: PlanArgs,
  loser?: DirectionPlan['loser'],
): ReturnType<typeof carriedFor> {
  const after = loser?.exit && isDoubleExit(view.existing.matchUpStatus) ? unwoundView(args) : undefined;
  return carriedFor(after?.view ?? view, args, loser);
}

/** RULE 4's writes, read after the unwind and its released landings where this call replaces a double exit (S7). */
export function unwoundConvergedFor(
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

/**
 * A double exit given a winner whose own loser seat stood in a double BYE (S7): the unwind withdraws the seat's BYE, and
 * the double BYE had sent the seat's own position on into the next matchUp, where it stands still. The loser then
 * arrives opposite the standing BYE and goes on through it, and v1 announces the next matchUp as it leaves it
 * (`assignMatchUpDrawPosition`, with the event), stamped. The stored next matchUp is a BYE until the unwind, so
 * `throughBye` reads none: it is read as the unwind leaves it. Planned where the unwind withdrew the next matchUp's BYE
 * at that position (`doubleByeSeatOps`, family 5: it is then to be played) or the next matchUp is the structure's last
 * round (COMPASS's West: a BYE still, by the other standing BYE, and nothing further to advance into).
 */
export function unwoundThrough(view: OutcomeView, unwound: OutcomeOp[]): ThroughBye | undefined {
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
export function unwoundArrivalOps(
  view: OutcomeView,
  unwound: OutcomeOp[],
  loser?: DirectionPlan['loser'],
): OutcomeOp[] {
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

import { indirectRelayReset, producedRelayAfterOps, unwoundOps } from './unwindPath';
import { getSideStatusCode } from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { arrivalOps, winnerPlacementOps } from './directionOps';
import { producedAwardWriteOps } from './producedExit';
import { directionReason } from './directionReasons';
import { isDoubleExit } from '@Validators/isExit';
import { producedTarget } from './producedTarget';
import { convergenceOps } from './convergence';
import { resultOps } from './resultOps';
import {
  BLANK_SCORE,
  CLEAR_SCORE,
  indexed,
  onwardFrom,
  pairedFeeder,
  positionsOf,
  scoreless,
  sideOf,
  structureStamps,
  unwoundClean,
} from './planShared';
import {
  buildSideExitProvenance,
  collapseDoubleExitStatus,
  deriveStatusCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { COMPLETED, DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DirectionPlan, OutcomeView, PlanArgs } from '../types';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { Convergence } from './convergence';
import type { OutcomeOp } from '../ops';

/**
 * The standalone indirect programs (C10 to C12): the shared `removeDoubleExit` removal certified without a source
 * clear, then a bare winner's arrivals, a carried winner's pending convergence, or a fresh produced award.
 */

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
  return { unwind, clear, reset, after, structureId, write, drawDefinition };
}

type StandaloneRemoval = NonNullable<ReturnType<typeof standaloneIndirectRemoval>>;

/**
 * The certified original relay both standalone winner rules read (ruling 1): the matchUp the removal clears, the
 * loser target's position on it, the side holding that position, no winner, no score, and the status the clear
 * re-derives it to. Each caller keeps its own further walls (the onward reset, the loser link, the next matchUp).
 */
function standaloneRelay(
  view: OutcomeView,
  clear: Extract<OutcomeOp, { op: 'clearMatchUpBye' }>,
): { relay: HydratedMatchUp; position?: number; side: 1 | 2 } | undefined {
  const relay = indexed(view, clear.matchUpId);
  const position = view.targets.loserTargetDrawPosition;
  const side = sideOf(relay, position);
  if (!relay || !side || position !== clear.drawPosition) return undefined;
  if (relay.winningSide || relay.score || relay.matchUpStatus !== clear.rederived?.matchUpStatus) return undefined;
  return { relay, position, side };
}

/**
 * The ops both standalone winner rules emit around their arrival (ruling 1): the removal, the source result, the
 * winner's placement, the arrival, the removal's re-announcements and after-ops, then the stamps.
 */
function standaloneTail(
  args: PlanArgs,
  removal: StandaloneRemoval,
  direction: DirectionPlan,
  arrival: OutcomeOp[],
): OutcomeOp[] {
  const { request, view } = args;
  const { unwind, after, structureId, write, drawDefinition } = removal;
  return [
    ...unwind.ops,
    ...resultOps(request, write, request.matchUpId as string),
    ...winnerPlacementOps(after.view, 'winner', write, direction.winner),
    ...arrival,
    ...unwind.reannounced,
    ...producedRelayAfterOps(view, unwind.ops, undefined, unwind.seatPrograms),
    ...structureStamps([...unwind.ops, ...arrival], structureId),
    { op: 'stampUpdatedAt', entity: 'structure', id: structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  ];
}

// Two rules, not one with a flag (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 1). The bare
// arrival mirrors v1's assignment path (`resolvePropagatedExitOnAdvance`: the standing exit awarded to the arriver,
// score absent, no `setMatchUpState`); the carried arrival below mirrors `progressExitStatus` RULE 4 (a nested
// `setMatchUpState`, score blanked, then `doubleExitAdvancement`). Each admits by the literal request status, not by
// what the loser carries: a RETIRED trigger under `propagateRetirementAsExit` carries WALKOVER (`carriedExit`) yet is
// refused by both and kept v1's, because these programs pass `request.matchUpStatus` raw where `convergedOps`
// normalises through `carriedStatus`. Keying on `loser.converged` would admit it. Only the six-read relay certificate
// and the nine-op tail they share are to be hoisted.
/** The bare winner's ordinary arrivals after its certified shared removal. */
export function standaloneBareWinnerOps(args: PlanArgs): OutcomeOp[] | undefined {
  const { request, write, drawDefinition } = args;
  if (write?.matchUpStatus !== COMPLETED || !write.winningSide || request.matchUpStatus || !drawDefinition)
    return undefined;
  const removal = standaloneIndirectRemoval(args);
  if (!removal) return undefined;
  const { clear, reset, after } = removal;
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
  return standaloneTail(args, removal, direction, placement);
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

// The carried twin of `standaloneBareWinnerOps`: a separate rule by the same ruling (see the comment there). It
// admits WALKOVER and DEFAULTED by their literal status and passes the request status raw into the pending
// convergence.
/** A real carried exit meets the exact pending foreign origin; it was never temporarily awarded. */
export function standaloneCarriedWinnerOps(args: PlanArgs): OutcomeOp[] | undefined {
  const { request, write, drawDefinition } = args;
  if (
    (request.matchUpStatus !== WALKOVER && request.matchUpStatus !== DEFAULTED) ||
    write?.matchUpStatus !== request.matchUpStatus ||
    !drawDefinition
  )
    return undefined;
  if (write.matchUpStatusCodes?.length || request.matchUpStatusCodes?.length) return undefined;
  const removal = standaloneIndirectRemoval(args);
  if (!removal) return undefined;
  const { clear, reset, after } = removal;
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
  const arrival = [...arrivalOps(after.view, loser), ...relayOps, ...produced];
  return standaloneTail(args, removal, direction, arrival);
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
  const certified = standaloneRelay(view, clear);
  if (!certified) return undefined;
  const { relay, side } = certified;
  if (relay.winnerMatchUpId !== reset.matchUpId || relay.loserMatchUpId) return undefined;
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
  const certified = standaloneRelay(view, clear);
  const next = indexed(view, reset.matchUpId);
  if (!certified || !next) return undefined;
  const { relay, position, side } = certified;
  const status = clear.rederived?.matchUpStatus;
  if (!position || !status) return undefined;
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

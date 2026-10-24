import { getCapturedClock } from '@Global/state/globalState';
import { isAnyExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, MatchUpStatusUnion, Score, Tournament } from '@Types/tournamentTypes';
import type { DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView, Route } from './types';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { OutcomeOp } from './ops';
import {
  AWAITING_RESULT,
  COMPLETED,
  INCOMPLETE,
  IN_PROGRESS,
  SUSPENDED,
  TO_BE_PLAYED,
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
  | 'unchanged' // the write changes nothing but stamps, which S1's shadow comparison cannot see (CA, 2026-10-24)
  | 'no-record' // the draw is not held in the tournament record's events: nothing to fold the plan into
  | 'edges' // the draw stores no edges, which v1 writes first (`ensureGoesTo`): S2's setEdges
  | 'clock'; // no captured instant (a call outside the engine): the timestamps a write takes cannot be reproduced

export type OutcomePlan = { ops: OutcomeOp[]; abstain?: undefined } | { abstain: AbstainReason; ops?: undefined };

const LOCAL_ROUTES = new Set<Route>(['clear', 'clear-score', 'remove-directed', 'only-score']);
const LOCAL_STATUSES = new Set<string | undefined>([IN_PROGRESS, SUSPENDED, AWAITING_RESULT, INCOMPLETE, TO_BE_PLAYED]);

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function unchanged(write: MatchUpWrite, view: OutcomeView): boolean {
  const { existing } = view;
  return (
    write.matchUpStatus === existing.matchUpStatus &&
    write.winningSide === existing.winningSide &&
    (write.scoreStringSide1 ?? '') === (existing.score?.scoreStringSide1 ?? '') &&
    (write.scoreStringSide2 ?? '') === (existing.score?.scoreStringSide2 ?? '') &&
    same(write.sets, existing.score?.sets) &&
    same(write.matchUpStatusCodes ?? [], existing.matchUpStatusCodes ?? []) &&
    (write.matchUpFormat ?? existing.ownMatchUpFormat) === existing.ownMatchUpFormat
  );
}

function localReason({ route, write }: { route?: Route; write?: MatchUpWrite }): AbstainReason | undefined {
  if (!route || !write || !LOCAL_ROUTES.has(route)) return 'route';
  if (!LOCAL_STATUSES.has(write.matchUpStatus)) return 'route';
  return undefined;
}

/**
 * A loser fed across a link joins the first direction only as a plain arrival: placed on a free seat, carrying
 * nothing, into a matchUp holding no result, exit or BYE. The FMLC feed into round 2 is left to v1: `directLoser`
 * seats it on the target's lowest position, which `positionTargets` does not say.
 */
function plainLoserReason(view: OutcomeView, direction: DirectionPlan): AbstainReason | undefined {
  const { targets } = view;
  const loser = direction.loser;
  if (!loser && !targets.loserMatchUpId) return undefined;
  if (!loser?.arrives || loser.exit || loser.converged || loser.carriedPast || loser.bye || loser.withdrawn)
    return 'loser';
  if (targets.loserLink?.linkCondition === FIRST_MATCHUP && targets.loserMatchUpRoundNumber === 2) return 'loser';
  if (!targets.loserStructureId || !targets.loserTargetDrawPosition || !targets.loserTargetSeat?.free) return 'loser';
  if (
    targets.loserMatchUpHasResult ||
    targets.loserMatchUpCarriesExit ||
    targets.loserTargetSeat.opponentBye ||
    targets.loserTargetSeat.structureHasBye
  )
    return 'cascade';
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
  if (route !== 'winner' || !write || write.matchUpStatus !== COMPLETED || !write.winningSide) return 'route';
  if (!direction?.winner) return 'route';
  const loserReason = plainLoserReason(view, direction);
  if (loserReason) return loserReason;
  if (direction.decider || direction.produced || direction.converged) return 'route';
  const target = targets.winner;
  if (!target || target.structureId !== targets.source.structureId) return 'link';
  if (view.draw.firstMatchFeed) return 'cascade';
  if (target.hasBye || target.carriesExit || target.carriedStatuses.length || target.holdsResult) return 'cascade';
  // a target generated with no status (LUCKY_DRAW, adaptive) is written TO_BE_PLAYED by v1 as the winner arrives
  if (target.matchUpStatus !== TO_BE_PLAYED) return 'route';
  if (!targets.sideDrawPositions[write.winningSide as 1 | 2]) return 'route';
  return undefined;
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
  if (!view.draw.storesEdges) return 'edges';
  if (request.carries?.schedule) return 'schedule';
  if (request.carries?.notes) return 'notes';
  if (request.matchUpStatusCodes?.length) return 'status-codes';
  if (isAnyExit(request.matchUpStatus) || isAnyExit(view.existing.matchUpStatus) || isAnyExit(write?.matchUpStatus))
    return 'exit';
  if (view.existing.winningSide) return 'winner';
  const directing = !!(request.winningSide || write?.winningSide || direction);
  const shape = directing ? directionReason(args) : localReason(args);
  if (shape) return shape;
  if (view.existing.hasSideExitProvenance || view.existing.carriedExit) return 'provenance';
  if (view.draw.tallied) return 'tallied';
  // both shapes above have a write by here
  if (unchanged(write as MatchUpWrite, view)) return 'unchanged';
  return undefined;
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
  const winner = args.direction?.winner;
  const winnerPosition = write.winningSide ? view.targets.sideDrawPositions[write.winningSide as 1 | 2] : undefined;
  if (winner && winnerPosition && view.targets.winner) {
    const drawPositions = [...new Set([...view.targets.winner.drawPositions, winnerPosition])].sort((a, b) => a - b);
    ops.push(
      { op: 'setMatchUpDrawPositions', matchUpId: winner.matchUpId, drawPositions },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: winner.matchUpId },
    );
  }
  // a plain loser arrival: the loser on the seat the link feeds. The matchUp they land in is not stamped: its stored
  // object does not change (the write is on the structure's assignments), so it is not a touched entity (F2 (i), and v1)
  const loser = args.direction?.loser;
  if (loser?.arrives && view.targets.loserStructureId && view.targets.loserTargetDrawPosition) {
    ops.push({
      op: 'assignPosition',
      structureId: view.targets.loserStructureId,
      drawPosition: view.targets.loserTargetDrawPosition,
      participantId: loser.participantId,
    });
  }
  ops.push(
    { op: 'stampUpdatedAt', entity: 'structure', id: structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  );
  return { ops };
}

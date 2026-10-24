import { isAnyExit } from '@Validators/isExit';

// constants and types
import type { DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView, Route } from './types';
import type { DrawDefinition, MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import type { OutcomeOp } from './ops';
import { AWAITING_RESULT, INCOMPLETE, IN_PROGRESS, SUSPENDED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * The outcome pipeline, v2: `planOutcome`, the plan as ops behind a fail-closed allowlist (executor plan § 3.7, S1).
 *
 * A plan is COMPLETE only when every write the call makes is an op v2 holds. Otherwise `planOutcome` ABSTAINS, naming
 * why, and the call stays v1's whole (F1 (a), fail-closed). S1 writes nothing: a complete plan is shadow-applied in
 * `differential` and compared with what v1 wrote (`shadow.ts`). The allowlist grows by slice; each reason below is a
 * shape a later slice takes on, and the abstention tally (`abstain:<reason>`) is the work list.
 *
 * S1 holds the LOCAL write: a call whose only write is the matchUp's own result, with no winner before or after (so
 * nothing is directed or taken back), no exit, nothing the score write clears or attributes, and no tally.
 */
export type AbstainReason =
  | 'route' // a route S1 does not plan as ops
  | 'winner' // a winner set or taken away: direction (S3)
  | 'exit' // an exit status, before or after: provenance and the cascade (S5)
  | 'status-codes' // the client's positional codes, split into side codes at the write
  | 'provenance' // the matchUp holds provenance the score write may clear or rescue
  | 'team' // a dual or a line: tieMatchUps and auto-calc (S7)
  | 'tallied' // a round robin, ad hoc or lucky structure: the tally (S3)
  | 'schedule' // the call carries a schedule (§ 3.5.8)
  | 'notes' // the call carries notes
  | 'unchanged'; // the write changes nothing but stamps, which S1's shadow comparison cannot see (debate-ruled)

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

/** the first reason this call is not S1's, or undefined when it is */
function abstainReason(args: {
  request: OutcomeRequest;
  view: OutcomeView;
  route?: Route;
  write?: MatchUpWrite;
  direction?: DirectionPlan;
}): AbstainReason | undefined {
  const { request, view, route, write, direction } = args;
  if (view.isTeam || view.line || view.matchUpTieId || view.existing.collectionId) return 'team';
  if (request.carries?.schedule) return 'schedule';
  if (request.carries?.notes) return 'notes';
  if (request.matchUpStatusCodes?.length) return 'status-codes';
  if (isAnyExit(request.matchUpStatus) || isAnyExit(view.existing.matchUpStatus) || isAnyExit(write?.matchUpStatus))
    return 'exit';
  if (request.winningSide || view.existing.winningSide || write?.winningSide || direction) return 'winner';
  if (!route || !write || !LOCAL_ROUTES.has(route)) return 'route';
  if (!LOCAL_STATUSES.has(write.matchUpStatus)) return 'route';
  if (view.existing.hasSideExitProvenance || view.existing.carriedExit) return 'provenance';
  if (view.draw.tallied) return 'tallied';
  if (unchanged(write, view)) return 'unchanged';
  return undefined;
}

/**
 * The ops of a complete plan for `request`, or the reason there is none. `write` and `direction` are what `planWrite`
 * and `planDirection` already decided; this re-states a complete one as ops and adds the stamps (F2 (i): the matchUp,
 * its structure and the draw, each once).
 */
export function planOutcome(args: {
  drawDefinition?: DrawDefinition;
  direction?: DirectionPlan;
  request: OutcomeRequest;
  write?: MatchUpWrite;
  view: OutcomeView;
  route?: Route;
}): OutcomePlan {
  const reason = abstainReason(args);
  if (reason) return { abstain: reason };
  const { request, view, drawDefinition } = args;
  const write = args.write as MatchUpWrite;
  const matchUpId = request.matchUpId as string;
  const structureId = view.targets.source.structureId;
  if (!drawDefinition || !structureId) return { abstain: 'route' };

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
      ...(write.matchUpStatusCodes ? { matchUpStatusCodes: write.matchUpStatusCodes } : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    { op: 'stampUpdatedAt', entity: 'structure', id: structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  ];
  return { ops };
}

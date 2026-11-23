import { findReservationWork } from '@Mutate/matchUps/matchUpStatus/reconcileConsolationReservations';
import { findMisplacedProvenance } from '@Mutate/matchUps/matchUpStatus/reconcileProvenanceSides';
import { hasStaleScoredTime } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { bindResultAliases, materializeClock } from './projection';
import { planLinkedRepairs, planReturningCarries } from './linkedRepairs';
import { planDecider, planDeciderReservations } from './decider';
import { doubleWithdrawal } from './doubleWithdrawal';
import { isDoubleExit } from '@Validators/isExit';
import { planSettlementEffects, type SettlementNoticeInput } from './effects';
import { withdrawnAwardRelease } from './release';
import { planSwapSeeds } from './swapSeeds';
import { inspectHeldPass } from './bounds';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import { planForward, winnerArrival } from './forwardLimit';
import { settlementWorklist, type Visit } from './worklist';
import { createWorkingView, type WorkingView } from '../overlay';
import { planDirection } from '../direction';
import { refuseOutcome } from '../refusals';
import { resultOps } from '../plan/resultOps';
import { chooseRoute } from '../route';
import { planOutcome } from '../plan';
import { predictSettleWork } from '../settleWork';
import { buildOutcomeView } from '../view';
import { planWrite } from '../write';
import type { OutcomeOp } from '../ops';

import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeRequest, OutcomeView, Route, MatchUpWrite, DirectionPlan } from '../types';

type Args = SettlementNoticeInput & {
  drawDefinition: DrawDefinition;
  request: OutcomeRequest;
  tournamentRecord?: Tournament;
  policyDefinitions?: PolicyDefinitions;
  event?: Event;
  capturedClock?: number;
  stampedBefore?: string[];
};

type Prediction = {
  disposition: 'predicted' | 'partial' | 'abstain';
  drawDefinition: DrawDefinition;
  affectedMatchUpIds: string[];
  affectedStructureIds: string[];
  ops: OutcomeOp[];
  reasons: string[];
  effectsComplete: boolean;
  visits: Visit[];
  result?: ResultType;
  announced?: Extract<OutcomeOp, { op: 'announceRecorded' }>[];
  readings?: number[];
  exhausted?: string;
};

/** Read-only, call-local §5.2 projection. A partial draw and its worklist trace are evidence about
 * individual rules; only a complete prediction is eligible for a whole-call comparison. */
export function predictSettlement(args: Args): Prediction {
  const { drawDefinition, event, tournamentRecord, request } = args;
  const empty: Prediction = {
    disposition: 'abstain',
    drawDefinition,
    affectedMatchUpIds: [],
    affectedStructureIds: [],
    ops: [],
    reasons: [],
    effectsComplete: false,
    visits: [],
  };
  if (request.carries?.schedule) return { ...empty, reasons: ['schedule-writer'] };
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const view = buildOutcomeView({
    drawDefinition,
    request,
    event,
    tournamentRecord,
    matchUpsMap,
    policyDefinitions: args.policyDefinitions,
  });
  const source = view.inContextDrawMatchUps?.find((m) => m.matchUpId === request.matchUpId);
  if (!source || !request.matchUpId || !view.inContextDrawMatchUps) return { ...empty, reasons: ['missing-root'] };
  const refusal = refuseOutcome(request, view);
  if (refusal) {
    // The old writer has refusal-after-write cases. A preflight code alone proves neither atomicity nor effects.
    return { ...empty, result: { error: refusal.error }, reasons: ['refusal-effects'] };
  }
  if (view.isTeam || view.line || view.group) return { ...empty, reasons: ['team-or-group-result'] };
  const route = chooseRoute(request, view);
  const write = planWrite(request, view, route);
  if (!write || !write.matchUpStatus) return { ...empty, reasons: ['unresolved-root-write'] };
  const working = createWorkingView({
    drawDefinition,
    matchUpsMap,
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    structural: view.structural,
    event,
    tournamentRecord,
    clockFree: true,
  });
  const policies = getAppliedPolicies({ drawDefinition, event, tournamentRecord }).appliedPolicies;
  const release = withdrawnAwardRelease(view, request, route, drawDefinition);
  const queue = settlementWorklist(working, request.flags, policies, release);
  const modelArgs = { before: drawDefinition, working, matchUpId: request.matchUpId };
  const direction = planDirection(request, view, route);
  const refused = seedRoot({ args, working, queue, view, root: source, route, write, direction, policies });
  if (refused) return { ...empty, reasons: refused };
  const propagationBound =
    direction?.loser?.exit &&
    direction.loser.arrives &&
    view.targets.carryLevels?.bounded &&
    SETTLE_PASS_LIMITS.exitLevels === 0
      ? { error: SETTLE_BOUND_REACHED, info: 'propagateExitFrom' }
      : undefined;
  if (!propagationBound) queue.drain('direction');
  const { forward, error } = propagationBound
    ? { forward: { exhausted: undefined }, error: propagationBound }
    : runPasses(args, working, queue, modelArgs);
  finishStamps(working, queue, !error);
  const owing = predictSettleWork({
    heldExitWork: inspectHeldPass(working).hasWork,
    drawDefinition,
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    working,
    ...request.flags,
    tournamentRecord,
    event,
    matchUpId: request.matchUpId,
    ops: queue.ops,
    loserLinked: !!view.targets.loserLink,
    contained: !!view.draw.luckyBased || !view.targets.winnerMatchUpId,
  });
  for (const site of owing) if (!(forward.exhausted && site === 'settleForwardConsequences')) queue.reasons.add(site);
  if (args.capturedClock !== undefined) materializeClock(working, args.capturedClock, new Set(args.stampedBefore));
  bindResultAliases(working, matchUpsMap, queue.ops);
  const effects =
    !queue.reasons.size && !error && !forward.exhausted
      ? planSettlementEffects({ ...args, working, route, view, ops: queue.ops, release })
      : undefined;
  for (const reason of effects?.reasons ?? []) queue.reasons.add(reason);
  const effectsComplete = !!effects?.announced && !!effects.result && !!effects.readings && !queue.reasons.size;
  return {
    disposition: effectsComplete ? 'predicted' : 'partial',
    effectsComplete,
    drawDefinition: working.drawDefinition,
    affectedStructureIds: [...queue.affectedStructures],
    affectedMatchUpIds: [...queue.affectedMatches],
    reasons: [...queue.reasons],
    ops: queue.ops,
    visits: queue.visited,
    ...(effectsComplete && effects?.announced
      ? { result: effects.result, announced: [effects.announced], readings: effects.readings }
      : {}),
    ...(error ? { result: error } : {}),
    ...(forward.exhausted
      ? {
          exhausted: forward.exhausted,
          result: { success: true, warnings: [{ code: FORWARD_SETTLE_EXHAUSTED, matchUpIds: [forward.exhausted] }] },
        }
      : {}),
  };
}

function finishStamps(working: WorkingView, queue: ReturnType<typeof settlementWorklist>, cleanup: boolean) {
  const stampOwners = new Set<string>();
  const stampMatches = new Set<string>();
  for (const op of queue.ops) {
    if ('matchUpId' in op && op.matchUpId) stampMatches.add(op.matchUpId);
    if ('structureId' in op && op.structureId) stampOwners.add(queue.ownerOf(op.structureId));
  }
  for (const m of working.matchUpsMap.drawMatchUps) {
    if (cleanup && hasStaleScoredTime(m)) {
      queue.fold([{ op: 'clearMatchUpScoredTime', matchUpId: m.matchUpId }]);
      stampMatches.add(m.matchUpId);
    }
  }
  const stamps: OutcomeOp[] = [];
  for (const m of working.inContextDrawMatchUps) {
    if (!stampMatches.has(m.matchUpId)) continue;
    stamps.push({ op: 'stampUpdatedAt', entity: 'matchUp', id: m.matchUpId });
    stampOwners.add(queue.ownerOf(m.structureId));
  }
  for (const id of stampOwners) stamps.push({ op: 'stampUpdatedAt', entity: 'structure', id });
  if (stamps.length) stamps.push({ op: 'stampUpdatedAt', entity: 'drawDefinition', id: working.drawDefinition.drawId });
  const alreadyStamped = new Set(
    queue.ops.flatMap((op) => (op.op === 'stampUpdatedAt' ? [`${op.entity}:${op.id}`] : [])),
  );
  queue.fold(stamps.filter((op) => op.op === 'stampUpdatedAt' && !alreadyStamped.has(`${op.entity}:${op.id}`)));
}

type Worklist = ReturnType<typeof settlementWorklist>;
function seedRoot({
  args,
  working,
  queue,
  view,
  root: source,
  route,
  write,
  direction,
  policies,
}: {
  args: Args;
  working: WorkingView;
  queue: Worklist;
  view: OutcomeView;
  root: HydratedMatchUp;
  route: Route;
  write: MatchUpWrite;
  direction?: DirectionPlan;
  policies?: PolicyDefinitions;
}): string[] | undefined {
  const { drawDefinition, tournamentRecord, event, request } = args;
  // Request only native ops. Supplying no recorder or legacy execution closure is essential: a
  // recording already contains its answer. Native directions are folded once before reconciliation.
  const native = planOutcome({
    drawDefinition,
    tournamentRecord,
    request,
    route,
    write,
    view,
    direction,
    clockFree: true,
  });
  const swap = route === 'swap' ? planSwapSeeds({ drawDefinition, view, request, policies }) : undefined;
  if (swap?.reasons.length) return swap.reasons;
  let nativeOps = native.ops;
  if (nativeOps?.some((op) => op.op === 'assignBye')) {
    const probe = createWorkingView({
      drawDefinition,
      matchUpsMap: working.matchUpsMap,
      inContextDrawMatchUps: working.inContextDrawMatchUps,
      structural: view.structural,
      event,
      tournamentRecord,
      clockFree: true,
    });
    if (probe.apply(nativeOps).error || findReservationWork(probe).length) nativeOps = undefined;
  }
  if (nativeOps && !swap) {
    queue.fold(nativeOps);
  } else {
    if (swap) queue.fold(swap.ops);
    if (request.carries?.schedule || request.matchUpFormat || request.carries?.notes) queue.reasons.add('root-extras');
    const prefix = doubleWithdrawal(view, request, route, drawDefinition);
    queue.fold(prefix);
    const rootOps = resultOps(request, write, source.matchUpId);
    const own = rootOps[0];
    if (own.op === 'setMatchUpResult' && route === 'clear' && isDoubleExit(source.matchUpStatus) && !write.winningSide)
      own.removesWinningSide = true;
    queue.fold(rootOps);
  }
  // A resubmitted standing winner is directed NOW. The forward pass starts with its own budget.
  if (request.winningSide && request.winningSide === source.winningSide) {
    const side = source.sides?.find((s) => s.sideNumber === request.winningSide);
    if (side?.participantId && side.drawPosition) {
      const arrival = winnerArrival(working, {
        kind: 'winner',
        matchUpId: source.matchUpId,
        drawPosition: side.drawPosition,
        key: '',
      });
      if (arrival) queue.fold(arrival);
    }
  }
  return undefined;
}

function runPasses(
  args: Args,
  working: WorkingView,
  queue: Worklist,
  modelArgs: { before: DrawDefinition; working: WorkingView; matchUpId: string },
) {
  const { event, tournamentRecord, drawDefinition, request } = args;
  const repairs = (stage: 'missed' | 'unearned') => {
    const work = planLinkedRepairs({ working, stage, event, tournamentRecord });
    work.reasons.forEach((r) => queue.reasons.add(r));
    queue.fold(work.ops, true);
    return work;
  };
  repairs('missed');
  const returning = planReturningCarries({
    before: drawDefinition,
    working,
    affectedMatchUpIds: queue.affectedMatches,
  });
  returning.reasons.forEach((r) => queue.reasons.add(r));
  queue.fold(returning.ops);
  const reservations = planDeciderReservations(modelArgs);
  reservations.reasons.forEach((r) => queue.reasons.add(r));
  queue.fold(reservations.ops);
  queue.drain('reservations');
  const held = inspectHeldPass(working, drawDefinition, request);
  const internalBound = held.error;
  if (internalBound) return { forward: { exhausted: undefined }, error: internalBound };
  repairs('missed');
  for (const { stored, expected, entry } of findMisplacedProvenance(working))
    queue.fold([{ op: 'setSideExitProvenance', matchUpId: stored.matchUpId, provenance: { [expected]: entry } }]);
  const decider = planDecider(modelArgs);
  decider.reasons.forEach((r) => queue.reasons.add(r));
  queue.fold(decider.ops);
  const forward = planForward({ working, request, tournamentRecord, event });
  forward.reasons.forEach((r) => queue.reasons.add(r));
  queue.fold(forward.ops, true);
  // At the public cutoff all remaining forward work belongs to the next call.
  if (!forward.exhausted && forward.ops.length) queue.drain('after-forward');
  const released = repairs('unearned');
  const error = released.error ? { error: released.error, info: 'reconcileLinkAdvancements' } : undefined;
  return { forward, error };
}

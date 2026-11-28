import { readTeamLineLedger, teamFinalLine, type TeamLedger } from './plan/teamFinalLine';
import { hasStaleScoredTime } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { applyOwnedPlan, applyTemporalPhases, compileTemporalPhases } from './apply';
import { recordSettleEvent } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { PREDICTED_CALL, predictSettleWork, type SettleSite } from './settleWork';
import { topLevelStructureId } from '@Mutate/notifications/drawNotifications';
import { planDirection } from './direction';
import { recordDoubleExitCascade } from './plan/recordedCascade';
import { createWorkingView, type WorkingView } from './overlay';
import { recordWholeCall } from './plan/recordedCall';
import { planWrite } from './write';
import { refuseOutcome } from './refusals';
import { stampedIn } from './ops';
import { buildOutcomeView } from './view';
import { chooseRoute } from './route';
import { planOutcome } from './plan';
import { replayableEffectScope } from './effectScope';
import { getCapturedStamps, getCapturedClock } from '@Global/state/globalState';

// constants and types
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ResultType } from '@Types/factoryTypes';
import type { OutcomeOp } from './ops';
import type {
  BuildViewArgs,
  DualCall,
  LandingView,
  OutcomePlan,
  OutcomeRequest,
  OutcomeView,
  PlanShape,
  ProjectOutcome,
  RebuildView,
  Refusal,
  Route,
} from './types';

/**
 * THE SHAPES v2 OWNS (§ 3.7: one place, so reverting a slice's PR takes its shapes out). S2: the local write, the
 * matchUp's own result with no winner before or after, no exit, nothing directed, no tally and no settle work.
 */
const OWNED_SHAPES = new Set<PlanShape>(['local', 'direction']);

/**
 * The call planned against the view (§ 3.1 step 3): the route, the write on the matchUp and the direction, then the plan as ops behind the fail-closed allowlist, then the working view after them and
 * the settle passes' has-work predicates. A plan that leaves a pass work abstains `settle`.
 */
function planCall(args: BuildViewArgs, view: OutcomeView, teamLedger?: TeamLedger) {
  let teamStamps: Set<string> | undefined;
  // v1's refusal of the call on a copy, where the recorder ran it whole and v1 refused
  let refusedOnCopy: ResultType | undefined;
  args = { ...args, clockFree: getCapturedClock() === undefined };
  // TEAM auto-calc: a dual whose result is computed from its lines takes the PROJECTED winner and score in
  // place of the call's before anything is routed, as `handleTeamAutoCalc` rewrites v1's parameters
  const planned = autoCalculated(args.request, view);
  const route = chooseRoute(planned, view);
  const plan = route ? planWrite(planned, view, route) : undefined;
  const direction = route ? planDirection(planned, view, route) : undefined;
  const allowed = planOutcome({
    settles: carrySettles(args, view),
    clockFree: args.clockFree,
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    rebuild: rebuildView(args, view, planned),
    project: projectOutcome(args, view),
    landing: landingView(args, view),
    record: (prefix) => recordDoubleExitCascade({ ...args, request: planned }, prefix),
    teamLine: (plan, why) =>
      teamLedger &&
      teamFinalLine(args, plan, why, () => (teamStamps = stampedIn(args.drawDefinition, teamLedger.stamps))),
    // a call whose ledger was read before the view is recorded with that reading, never a second one
    recordWhole: () =>
      recordWholeCall(
        args,
        teamStamps ?? (teamLedger && stampedIn(args.drawDefinition, teamLedger.stamps)),
        (refusal) => (refusedOnCopy = refusal),
      ),
    certifiesPhases: (ops) => !!compileTemporalPhases({ args, view, route, ops }),
    dual: dualCallFor(route, args, view),
    request: planned,
    write: plan,
    direction,
    route,
    view,
  });
  // the working view after the plan (§ 3.2), folded before anything is written to the stored objects it reads
  const folded = allowed.ops ? finalizePlan({ args, view, ops: allowed.ops }) : undefined;
  let outcome: OutcomePlan = allowed;
  if (allowed.ops)
    outcome =
      folded && 'ops' in folded && !folded.settle.length ? { ...allowed, ops: folded.ops } : { abstain: 'settle' };
  const phases =
    args.clockFree && outcome.ops ? compileTemporalPhases({ args, view, route, ops: outcome.ops }) : undefined;
  const replayable = !!phases && !!outcome.ops && replayableEffectScope(args, phases);
  // v1's whole write, recorded with the instants it read (`recordedWhole`): apply writes them as data, and reads no clock
  const recorded = outcome.ops && outcome.recordedResult ? outcome : undefined;
  // An uncaptured call requires a complete phase program and a replayable effect scope, in either mode.
  if (args.clockFree && !replayable) outcome = { abstain: 'clock' };
  if (recorded) outcome = recorded;
  return { outcome, phases, route, refusedOnCopy };
}

/**
 * A plan's composition point (`RebuildView`): the call's view with `ops` folded into a working view (§ 3.2), read again as
 * an outcome view, and the direction the route plans there. No hydration: the working view re-derives what the ops
 * touched from the call's own index (or projection), and the view is built on it with the call's map.
 */
function rebuildView(args: BuildViewArgs, view: OutcomeView, request: OutcomeRequest): RebuildView {
  return (ops, route) => {
    const working = projectOutcome(args, view)(ops);
    if (!working) return undefined;
    const rebuilt = buildOutcomeView({
      ...args,
      inContextDrawMatchUps: working.inContextDrawMatchUps,
      drawDefinition: working.drawDefinition,
      matchUpsMap: working.matchUpsMap,
      structural: view.structural,
      temporal: working.temporal,
    });
    return { view: rebuilt, direction: planDirection(request, rebuilt, route) };
  };
}

/** Fold only the supplied program; routing and source admission keep their original entry facts. */
function projectOutcome(args: BuildViewArgs, view: OutcomeView): ProjectOutcome {
  return (prefix) => {
    if (!args.drawDefinition || !args.matchUpsMap || !view.inContextDrawMatchUps) return undefined;
    // Until the continuation's clock phase is explicit, its timestamp cannot be treated as already written here.
    if (args.clockFree && prefix.some((op) => op.op === 'setMatchUpResult' && op.stampsScoredTime !== false))
      return undefined;
    const working = createWorkingView({
      clockFree: args.clockFree,
      inContextDrawMatchUps: view.inContextDrawMatchUps,
      structural: view.structural,
      tournamentRecord: args.tournamentRecord,
      drawDefinition: args.drawDefinition,
      matchUpsMap: args.matchUpsMap,
      event: args.event,
    });
    return working.apply(prefix).error ? undefined : working;
  };
}

/** A converged landing read as its own double exit's call on the cursor the prefix leaves (1b, L2). */
function landingView(args: BuildViewArgs, view: OutcomeView): LandingView {
  return (prefix, matchUpId, matchUpStatus) => {
    const working = projectOutcome(args, view)(prefix);
    if (!working) return undefined;
    const landing = buildOutcomeView({
      ...args,
      request: { flags: args.request.flags, matchUpId, matchUpStatus },
      inContextDrawMatchUps: working.inContextDrawMatchUps,
      drawDefinition: working.drawDefinition,
      matchUpsMap: working.matchUpsMap,
      structural: view.structural,
      temporal: working.temporal,
    });
    return landing.found ? { view: landing, working } : undefined;
  };
}

/**
 * The routing point (§ 3.1). A refusal is returned as the result the entry hands back, shaped as every other refusal is
 * (`error`, `info`, `context`). A call whose complete plan is a shape v2 owns is written by v2; any other is handed back
 * (`{}`), and the entry runs v1's writers on it.
 */
export function decideOutcomeV2(args: BuildViewArgs): {
  refused?: ResultType;
  owned?: ResultType;
  /** `owned` is v1's whole answer for a call recorded on a copy (`plan/recordedCall.ts`) */
  recorded?: boolean;
  /** A native line phase completed its warnings and return before replay. */
  finished?: boolean;
  /** v1's refusal of the call, met on a copy before any write (`plan/recordedCall.ts`), returned as it stands */
  refusedOnCopy?: ResultType;
} {
  // handed to the plan alone: the view and the refusals read the arguments every call passes
  const teamLedger = readTeamLineLedger(args);
  const view = buildOutcomeView(args);
  const refusal: Refusal | undefined = refuseOutcome(args.request, view);
  if (refusal) return { refused: toResult(refusal, args) };
  // S2: a call whose complete plan is a shape v2 owns is written by v2, and v1 is not asked (F1 (a), fail-closed)
  const { outcome, phases, route, refusedOnCopy } = planCall(args, view, teamLedger);
  // A REFUSAL CHANGES NOTHING: v1 on the copy refused the call, as v1 on the stored record would, after its writes
  if (refusedOnCopy) return { refusedOnCopy };
  if (!outcome.ops || !OWNED_SHAPES.has(outcome.shape)) return {};
  const applied = phases
    ? applyTemporalPhases(args, phases, outcome.shape)
    : applyOwnedPlan({ args, ops: outcome.ops, shape: outcome.shape, route });
  // a call recorded whole returns what v1 returned for it
  if (!applied.error && outcome.phaseResult) return { owned: outcome.phaseResult, finished: true };
  if (applied.error || !outcome.recordedResult) return { owned: applied };
  return { owned: outcome.recordedResult, recorded: true };
}

/** S7: the dual's own call a line's result makes: deciding it (`winner`), or un-deciding it (`line-score`) */
function dualCallFor(route: Route | undefined, args: BuildViewArgs, view: OutcomeView): DualCall | undefined {
  if (route === 'winner') return decidedDualCall(args, view);
  return route === 'line-score' ? undecidedDualCall(args, view) : undefined;
}

/**
 * S7: a line whose result leaves its decided dual's lines projecting no winner un-decides the dual: v1
 * (`scoreModification`, `removeDirectedParticipants` through the line) takes the dual's winner back out of the next
 * dual and writes its tally. v2 plans that as the dual's own removal, from a view of the dual whose request is its
 * projected tally with no winner (routed `remove-directed`, vetted as any removal).
 */
function undecidedDualCall(args: BuildViewArgs, view: OutcomeView): DualCall | undefined {
  const line = view.line;
  if (!line || line.autoCalcDisabled || !line.dualWinningSide || line.projectedWinningSide) return undefined;
  const request: OutcomeRequest = {
    flags: { ...args.request.flags, enableAutoCalc: false },
    matchUpId: line.dualMatchUpId,
    // no status: v1 takes the dual's direction back as a removal (`removeDirectedParticipants`), then its tally writes
    // the status (`undecidingLineOps`)
    score: line.projectedScore,
  };
  const dualView = buildOutcomeView({
    ...args,
    request,
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    structural: view.structural,
  });
  const route = chooseRoute(request, dualView);
  return {
    write: route ? planWrite(request, dualView, route) : undefined,
    direction: route ? planDirection(request, dualView, route) : undefined,
    rebuild: rebuildView(args, dualView, request),
    view: dualView,
    request,
    route,
  };
}

/**
 * S7: a line whose projection decides its dual makes the dual's own call, which v2 plans as it plans any call: from a
 * view of the dual taken on the line's own index (no hydration), the dual's request is its projected winner, COMPLETED,
 * with its projected score. Routed, written and directed by the same functions a singles result is.
 */
function decidedDualCall(args: BuildViewArgs, view: OutcomeView): DualCall | undefined {
  const line = view.line;
  const winningSide = line?.projectedWinningSide;
  if (!line || line.autoCalcDisabled || line.dualWinningSide || (winningSide !== 1 && winningSide !== 2))
    return undefined;
  const request: OutcomeRequest = {
    flags: { ...args.request.flags, enableAutoCalc: false },
    matchUpId: line.dualMatchUpId,
    matchUpStatus: COMPLETED,
    score: line.projectedScore,
    winningSide,
  };
  const dualView = buildOutcomeView({
    ...args,
    request,
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    structural: view.structural,
  });
  const route = chooseRoute(request, dualView);
  return {
    write: route ? planWrite(request, dualView, route) : undefined,
    direction: route ? planDirection(request, dualView, route) : undefined,
    rebuild: rebuildView(args, dualView, request),
    view: dualView,
    request,
    route,
  };
}

function autoCalculated(request: OutcomeRequest, view: OutcomeView): OutcomeRequest {
  if (!view.isTeam || !request.flags.enableAutoCalc || !view.dualProjection) return request;
  return { ...request, winningSide: view.dualProjection.projectedWinningSide, score: view.dualProjection.score };
}

function toResult(refusal: Refusal, args: BuildViewArgs): ResultType {
  const matchUp = refusal.namesMatchUp
    ? args.matchUpsMap?.drawMatchUps.find((candidate) => candidate.matchUpId === args.request.matchUpId)
    : undefined;
  const context =
    refusal.context || matchUp ? { ...(refusal.context ?? {}), ...(matchUp ? { matchUp } : {}) } : undefined;
  return {
    error: refusal.error,
    ...(refusal.info ? { info: refusal.info } : {}),
    ...(context ? { context } : {}),
    ...(refusal.extra ?? {}),
  };
}

/** Fold the complete program, append final cleanup, and return the authoritative executable plan and view. */
/** S2's has-work predicates on a working view the call's ops leave, as `finalizePlan` reads them */
function settleSites(args: BuildViewArgs, view: OutcomeView, working: WorkingView, ops: OutcomeOp[]): SettleSite[] {
  if (!args.drawDefinition || !view.inContextDrawMatchUps) return [];
  // SETTLED BY PROOF: v1's settle passes, run again on the copy this recording was read off, changed nothing at all
  // (`plan/recordedCall.ts` `settledOnCopy`). The predicates approximate those passes; where the passes were asked,
  // theirs is the answer
  if (ops.some((op) => op.op === 'announceRecorded' && op.settledByProof)) return [];
  return predictSettleWork({
    propagateRetirementAsExit: args.request.flags.propagateRetirementAsExit,
    propagateExitStatus: args.request.flags.propagateExitStatus,
    loserLinked: !!view.targets.loserLink,
    // doubleExitAdvancement stops in a lucky-based draw or a group. A line's targets belong
    // to its dual, and a final without a winner target has nowhere to produce an exit.
    contained:
      !!view.draw.luckyBased || (!!view.group && !view.group.adHoc) || !!view.line || !view.targets.winnerMatchUpId,
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    matchUpId: args.request.matchUpId,
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    event: args.event,
    working,
    ops,
  });
}

/**
 * C27 owns a call whole or not at all (`planOutcome`), and a call whose planned ops leave settle work is asked for whole
 * (`recordedWhole`): whether a plan's ops leave a settle pass work, read before the plan is returned, on the working view
 * they leave. Stale scored times are `finalizePlan`'s cleanup, work only where there is no stamp ledger to order it; a
 * program that cannot be folded here is not known to settle clean.
 */
function carrySettles(args: BuildViewArgs, view: OutcomeView) {
  return (ops: OutcomeOp[]) => {
    const fold = settleFolds.get(ops) ?? settleFold(args, view, ops);
    if (!fold || fold.error !== undefined) return true;
    const stale = fold.sites.includes('reconcileScoredTimes');
    return fold.sites.some((site) => site !== 'reconcileScoredTimes') || (stale && !getCapturedStamps());
  };
}

/**
 * ONE FOLD PER PLAN: the working view `carrySettles` folded a plan's ops into and the settle sites it read there, or the
 * error the fold met, kept by the ops array itself until the call's `finalizePlan` takes them. `planOutcome` asks
 * `settles` of every plan it returns ops for, and the plan it returns is that same array, so asking costs a planned
 * call no second fold.
 */
type SettleFold = { working: WorkingView; sites: SettleSite[]; error?: undefined } | { error: string };
const settleFolds = new WeakMap<OutcomeOp[], SettleFold>();

/** `finalizePlan`'s fold of a program, made where `projectOutcome` would make one: undefined where it would not */
function settleFold(args: BuildViewArgs, view: OutcomeView, ops: OutcomeOp[]): SettleFold | undefined {
  if (!args.drawDefinition || !args.matchUpsMap || !view.inContextDrawMatchUps) return undefined;
  if (args.clockFree && ops.some((op) => op.op === 'setMatchUpResult' && op.stampsScoredTime !== false))
    return undefined;
  const working = createWorkingView({
    clockFree: args.clockFree,
    inContextDrawMatchUps: view.inContextDrawMatchUps,
    structural: view.structural,
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    matchUpsMap: args.matchUpsMap,
    event: args.event,
  });
  const { error } = working.apply(ops);
  const fold: SettleFold = error ? { error } : { working, sites: settleSites(args, view, working, ops) };
  settleFolds.set(ops, fold);
  return fold;
}

function finalizePlan({
  args,
  view,
  ops,
}: {
  args: BuildViewArgs;
  view: OutcomeView;
  ops?: OutcomeOp[];
}): { ops: OutcomeOp[]; settle: SettleSite[] } | { error: string } | undefined {
  if (!ops || !args.drawDefinition || !args.matchUpsMap || !view.inContextDrawMatchUps) return undefined;
  // the fold `settles` made of these very ops, if it asked: taken once, the cleanup below is folded into it
  const shared = settleFolds.get(ops);
  settleFolds.delete(ops);
  if (shared?.error !== undefined) return { error: shared.error };
  const working =
    shared?.working ??
    createWorkingView({
      clockFree: args.clockFree,
      inContextDrawMatchUps: view.inContextDrawMatchUps,
      structural: view.structural,
      tournamentRecord: args.tournamentRecord,
      drawDefinition: args.drawDefinition,
      matchUpsMap: args.matchUpsMap,
      event: args.event,
    });
  const applied: { error?: string } = shared ? {} : working.apply(ops);
  if (applied.error) return { error: applied.error };
  const cleanup: OutcomeOp[] = [];
  const staleTimes = working.matchUpsMap.drawMatchUps.filter(hasStaleScoredTime);
  // A captured instant without its stamp ledger still needs ordered temporal effects: explicit stamps plus
  // live notices would otherwise stamp twice. Keep that execution context owed rather than creating a ledger.
  if (staleTimes.length && !getCapturedStamps()) return { error: 'scored-time cleanup needs ordered stamps' };
  for (const matchUp of staleTimes) {
    const structureId = topLevelStructureId(working.drawDefinition, matchUp.matchUpId);
    if (!structureId) return { error: `scored-time cleanup cannot locate ${matchUp.matchUpId}` };
    cleanup.push(
      { op: 'clearMatchUpScoredTime', matchUpId: matchUp.matchUpId },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUp.matchUpId },
      { op: 'stampUpdatedAt', entity: 'structure', id: structureId },
      { op: 'stampUpdatedAt', entity: 'drawDefinition', id: working.drawDefinition.drawId },
    );
  }
  if (cleanup.length) {
    const cleared = working.apply(cleanup);
    if (cleared.error) return { error: cleared.error };
  }
  const completedOps = cleanup.length ? [...ops, ...cleanup] : ops;
  // S2's has-work predicates, recorded for the census to set against v1's per-pass writes (nothing outside telemetry)
  // the sites `settles` read stand unless cleanup was appended, which the predicates are asked again after
  const settle = shared && !cleanup.length ? shared.sites : settleSites(args, view, working, completedOps);
  recordSettleEvent({ kind: 'predicted', site: PREDICTED_CALL });
  const predicted = new Set<SettleSite>(settle);
  if (cleanup.length) predicted.add('reconcileScoredTimes');
  for (const site of predicted) recordSettleEvent({ kind: 'predicted', site });
  return {
    ops: completedOps,
    settle,
  };
}

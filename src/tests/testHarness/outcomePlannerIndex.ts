import { buildStructuralIndex, type StructuralIndex } from '@Query/matchUps/structuralIndex';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { canonicalJson } from '@Tools/canonicalJson';
import { mustNotWrite } from './queryPurity/methodKinds';

// constants and types
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type ScopedDraw = { drawDefinition: DrawDefinition; tournamentRecord?: Tournament; event?: Event };
type Entry = ScopedDraw & { overlay: ReturnType<typeof createWorkingView> };
const broadOps = new Set<OutcomeOp['op']>(['replaceDrawState', 'replaceStructureState']);
let entries = new WeakMap<DrawDefinition, Entry>();
let retained = false;
const counts = () => ({ hits: 0, builds: 0, updates: 0, invalidations: 0 });
let totals = counts();

export function selectPlannerIndex(enabled: boolean) {
  retained = enabled;
  entries = new WeakMap();
  totals = counts();
}

export function plannerIndexCounts() {
  return { ...totals };
}

export function invalidatePlannerIndex() {
  if (!retained) return;
  entries = new WeakMap();
  totals.invalidations++;
}

export function beforePlannerMethod(method: string) {
  if (method !== 'setMatchUpStatus' && !mustNotWrite(method)) invalidatePlannerIndex();
}

export function indexForPlanner(args: ScopedDraw): StructuralIndex {
  if (!retained) return buildStructuralIndex({ ...args, team: true });
  const prior = entries.get(args.drawDefinition);
  if (prior && prior.tournamentRecord === args.tournamentRecord && prior.event === args.event) {
    totals.hits++;
    return { matchUps: prior.overlay.inContextDrawMatchUps };
  }
  totals.builds++;
  const drawDefinition = structuredClone(args.drawDefinition);
  const index = buildStructuralIndex({ ...args, drawDefinition, team: true });
  if (index.unsupported) return index;
  const overlay = createWorkingView({
    ...args,
    drawDefinition,
    inContextDrawMatchUps: index.matchUps,
    matchUpsMap: getMatchUpsMap({ drawDefinition }),
    structural: true,
    clockFree: true,
  });
  entries.set(args.drawDefinition, { ...args, overlay });
  return index;
}

export function reducePlannerIndex(drawDefinition: DrawDefinition, ops: OutcomeOp[]) {
  if (!retained) return;
  const entry = entries.get(drawDefinition);
  if (!entry) return;
  if (ops.some((op) => broadOps.has(op.op)) || entry.overlay.apply(ops).error) {
    entries.delete(drawDefinition);
    totals.invalidations++;
  } else {
    totals.updates++;
  }
}

let plans: string[] | undefined;
export function tracePlannerDecisions(trace?: string[]) {
  plans = trace;
}
export function observePlan(outcome: unknown) {
  if (plans) plans.push(canonicalJson(outcome));
}

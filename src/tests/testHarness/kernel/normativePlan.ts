import type { SchedulePlan } from '@Mutate/matchUps/schedule/pipeline/plan';

type ByDate<T> = { [scheduleDate: string]: T };

/**
 * The part of a plan that is a rule (scheduling-pipeline.md § 7, "The plan"): what is placed where and when, what is
 * left unplaced, and why — each refused matchUp's FIRST refusal, with its facts. How the slot loop got there (the
 * attempts per slot, the slots skipped or left over, every later refusal of the same matchUp) is one implementation's
 * trace, informative only (CA 2026-10-25), so `kernel.scheduling.plan@2` compares this projection and nothing more.
 */
export function normativePlan(plan: SchedulePlan) {
  return {
    matchUpScheduleTimes: plan.matchUpScheduleTimes,
    scheduledMatchUpIds: plan.scheduledMatchUpIds,
    placements: plan.placements,
    unplaced: plan.unplaced,
    noTimeMatchUpIds: plan.noTimeMatchUpIds,
    noFormatMatchUpIds: plan.noFormatMatchUpIds,
    unbookedMatchUpIds: plan.unbookedMatchUpIds,
    overLimitMatchUpIds: plan.overLimitMatchUpIds,
    requestConflicts: plan.requestConflicts,
    overLimitMatchUpDetails: mapDates(plan.overLimitMatchUpDetails, firstPerMatchUp),
    recoveryTimeDeferredMatchUpIds: mapDates(plan.recoveryTimeDeferredMatchUpIds, firstOfEach),
    dependencyDeferredMatchUpIds: mapDates(plan.dependencyDeferredMatchUpIds, firstOfEach),
    playedOrderDeferredMatchUpIds: plan.playedOrderDeferredMatchUpIds,
  };
}

function mapDates<T, U>(byDate: ByDate<T> | undefined, map: (value: T) => U): ByDate<U> {
  return Object.fromEntries(Object.entries(byDate ?? {}).map(([date, value]) => [date, map(value)]));
}

/** each matchUp's first refusal: the refusals after it record the loop offering later slots */
function firstOfEach<T>(byMatchUp: { [matchUpId: string]: T[] }): { [matchUpId: string]: T | undefined } {
  return Object.fromEntries(Object.entries(byMatchUp).map(([matchUpId, refusals]) => [matchUpId, refusals[0]]));
}

function firstPerMatchUp<T extends { matchUpId: string }>(details: T[]): T[] {
  const seen = new Set<string>();
  return details.filter(({ matchUpId }) => !seen.has(matchUpId) && !!seen.add(matchUpId));
}

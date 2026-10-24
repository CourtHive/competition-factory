import type { ParticipantReachability } from '../scheduleMatchUps/getParticipantReachability';
import type { PlanningView } from './view';

/**
 * The planning view as JSON text, and back. The planner reads nothing else, so a view written here can be planned
 * anywhere a view literal can: a bug report can attach the view that produced a bad plan, and a test can plan from one.
 *
 * Only the planner's members are written (`PLANNING_VIEW_KEYS`, which the compiler holds to `PlanningView`): never the
 * records, nor the write side's matchUps by id. The one member JSON cannot carry as is, `reachability.upstream` (a Set
 * per matchUp, read on the day-load hot path), is written as a sorted array and read back as a Set.
 */
const PLANNING_VIEW_KEYS: Record<keyof PlanningView, true> = {
  schedulingProfileModifications: true,
  schedulingProfileIssues: true,
  dateSchedulingProfiles: true,
  matchUpDependencies: true,
  dailyLimitOverrides: true,
  matchUpDailyLimits: true,
  schedulingProfile: true,
  playedOrderFacts: true,
  personRequests: true,
  eventTimings: true,
  timedMinutes: true,
  reachability: true,
  dateCourts: true,
  hydrated: true,
  courts: true,
  dates: true,
};

type EncodedReachability = Omit<ParticipantReachability, 'upstream'> & { upstream: { [matchUpId: string]: string[] } };

export function encodePlanningView(view: PlanningView): string {
  const planning: Record<string, unknown> = {};
  for (const key of Object.keys(PLANNING_VIEW_KEYS) as (keyof PlanningView)[]) planning[key] = view[key];
  const upstream = Object.fromEntries(
    Object.entries(view.reachability.upstream).map(([matchUpId, ids]) => [
      matchUpId,
      [...ids].sort((a, b) => a.localeCompare(b, 'en')),
    ]),
  );
  planning.reachability = { ...view.reachability, upstream } satisfies EncodedReachability;
  return JSON.stringify(planning);
}

export function decodePlanningView(text: string): PlanningView {
  const planning = JSON.parse(text);
  const reachability: EncodedReachability = planning.reachability;
  const upstream = Object.fromEntries(
    Object.entries(reachability.upstream).map(([matchUpId, ids]) => [matchUpId, new Set(ids)]),
  );
  return { ...planning, reachability: { ...reachability, upstream } };
}
